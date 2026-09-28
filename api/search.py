import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from datetime import datetime, timezone, timedelta
from lib.m512 import (JsonHandler, DB, ApiError, authenticate, yt_call, yt_hydrate, cache_key,
                      published_after, as_bool, now_iso)


def search(h):
    db = DB()
    prof = authenticate(db, h.headers)
    b = h.body()
    is_admin = prof["role"] == "admin"
    if not is_admin and not as_bool(db.setting("students_can_search", True), True):
        raise ApiError("البحث المباشر متاح للمدير فقط حالياً. تصفح المكتبة أو اطلب من المدير تفعيله", 403, "search_disabled")

    platform = b.get("platform", "youtube")
    if platform not in ("youtube", "shorts"):
        raise ApiError("البحث المباشر متاح ليوتيوب وشورتس فقط. تيك توك وإنستغرام تُضاف بالرابط أو بإضافة كروم")
    mode = b.get("mode", "search")
    query = (b.get("query") or "").strip()[:120]
    category = (b.get("category") or "").strip()[:60] or None
    language = b.get("language", "all")
    period = int(b.get("period") if b.get("period") not in (None, "") else db.setting("youtube_period_days", 30))
    region = (b.get("region") or db.setting("youtube_region", "") or "").upper()[:2]
    duration = b.get("duration") or db.setting("youtube_duration", "medium")
    order = b.get("order", "viewCount")
    results = min(int(db.setting("youtube_results", 25)), 50)
    shorts_max = int(db.setting("shorts_max_seconds", 180))

    if mode == "search" and not query and not category:
        raise ApiError("اكتب نوع المحتوى الذي تبحث عنه")
    q = query or category

    key = cache_key(platform, mode, q, language, period, region, duration, order, category)
    hours = float(db.setting("search_cache_hours", 12))
    force = as_bool(b.get("force")) and is_admin
    if not force and hours > 0:
        since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        cached = db.one("searches", select="video_ids,created_at", cache_key=f"eq.{key}", created_at=f"gte.{since}")
        if cached and cached.get("video_ids"):
            ids = ",".join(cached["video_ids"])
            vids = db.select("videos", select="*", id=f"in.({ids})", order="score.desc")
            return {"videos": vids, "cached": True, "cached_at": cached["created_at"], "units": 0}

    units = 0
    if mode == "trending":
        cat_id = None
        if category:
            c = db.one("categories", select="yt_category_id", name=f"eq.{category}")
            cat_id = c and c.get("yt_category_id")
        params = {"part": "id", "chart": "mostPopular", "regionCode": region or "SA", "maxResults": 50}
        if cat_id:
            params["videoCategoryId"] = cat_id
        try:
            data = yt_call(db, "videos", params, 1)
        except ApiError:
            params.pop("videoCategoryId", None)
            data = yt_call(db, "videos", params, 1)
        units += 1
        ids = [it["id"] for it in data.get("items", [])]
    else:
        params = {"part": "id", "type": "video", "q": q, "order": order, "maxResults": results,
                  "safeSearch": "moderate"}
        if period and period > 0:
            params["publishedAfter"] = published_after(period)
        if language in ("ar", "en"):
            params["relevanceLanguage"] = language
        if region:
            params["regionCode"] = region
        if platform == "shorts":
            params["videoDuration"] = "short"
        elif duration in ("medium", "long"):
            params["videoDuration"] = duration
        data = yt_call(db, "search", params, 100)
        units += 100
        ids = [it["id"]["videoId"] for it in data.get("items", []) if it.get("id", {}).get("videoId")]

    rows = yt_hydrate(db, ids, None, {"category": category or query or None, "search_query": q,
                                      "source": mode, "added_by": prof["id"]})
    units += 2
    if platform == "shorts":
        rows = [r for r in rows if r["duration_sec"] is not None and r["duration_sec"] <= shorts_max]
    else:
        rows = [r for r in rows if not (r["duration_sec"] is not None and r["duration_sec"] <= shorts_max)]
    for r in rows:
        r["platform"] = platform
        r["url"] = (f"https://www.youtube.com/shorts/{r['external_id']}" if platform == "shorts"
                    else f"https://www.youtube.com/watch?v={r['external_id']}")
    if language == "ar":
        rows = [r for r in rows if r["language"] == "ar"]
    elif language == "en":
        rows = [r for r in rows if r["language"] != "ar"]

    saved = db.upsert("videos", rows, "platform,external_id") if rows else []
    saved.sort(key=lambda r: float(r.get("score") or 0), reverse=True)
    db.upsert("searches", [{"cache_key": key, "platform": platform, "query": q,
                            "params": {"mode": mode, "language": language, "period": period, "region": region,
                                       "duration": duration, "order": order, "category": category},
                            "video_ids": [r["id"] for r in saved], "created_by": prof["id"],
                            "created_at": now_iso()}], "cache_key")
    return {"videos": saved, "cached": False, "units": units, "found": len(ids)}


class handler(JsonHandler):
    def do_POST(self):
        self.run(lambda: search(self))
