import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib.m512 import (JsonHandler, DB, ApiError, authenticate, parse_video_url, resolve_short_link, yt_hydrate,
                      ytdlp_info, row_from_ytdlp, clean_page_data, compute_score, detect_language, analyze_video,
                      as_bool, now_iso)


def ingest(h):
    """إضافة فيديو بالرابط (من الموقع أو من إضافة كروم)."""
    db = DB()
    prof = authenticate(db, h.headers)
    b = h.body()
    if prof["role"] != "admin" and not as_bool(db.setting("students_can_add", True), True):
        raise ApiError("إضافة المقاطع متاحة للمدير فقط حالياً", 403, "add_disabled")

    url = b.get("url", "")
    platform, ext_id, canon = parse_video_url(url)
    if platform == "tiktok" and not ext_id:
        platform, ext_id, canon = parse_video_url(resolve_short_link(canon))
        if not ext_id:
            raise ApiError("تعذّر فتح الرابط المختصر، افتح المقطع وانسخ رابطه الكامل")

    category = (b.get("category") or "").strip()[:60] or None
    page = clean_page_data(b.get("page_data"))
    base = {"category": category, "source": b.get("source", "link"), "added_by": prof["id"], "updated_at": now_iso()}
    warnings = []

    if platform in ("youtube", "shorts"):
        rows = yt_hydrate(db, [ext_id], platform, base)
        if not rows:
            raise ApiError("الفيديو غير موجود أو خاص")
        row = rows[0]
    else:
        row = {"platform": platform, "external_id": ext_id, "url": canon}
        allow = as_bool(db.setting(f"{platform}_server_fetch", True), True)
        fetched = {}
        if allow:
            try:
                info, _ = ytdlp_info(canon)
                fetched = {k: v for k, v in row_from_ytdlp(platform, info, canon).items() if v not in (None, "", 0)}
            except ApiError:
                raise
            except Exception as e:
                warnings.append("تعذّر جلب البيانات من الخادم، استُخدمت بيانات الصفحة/الإدخال اليدوي")
        # بيانات الصفحة (من الإضافة أو اليدوي) تكمل ما نقص، والأرقام الأكبر هي الأحدث غالباً
        merged = dict(fetched)
        for k, v in page.items():
            if k in ("views", "likes", "comments", "shares", "channel_followers"):
                merged[k] = max(int(merged.get(k) or 0), int(v or 0))
            elif not merged.get(k):
                merged[k] = v
        if not merged.get("title") and not merged.get("thumbnail_url"):
            raise ApiError("لم نستطع قراءة بيانات هذا المقطع تلقائياً. استخدم إضافة كروم أو املأ البيانات يدوياً",
                           422, "need_manual")
        row.update(merged)
        row.setdefault("title", (row.get("description") or "")[:120] or "بدون عنوان")
        row["url"] = row.get("url") or canon
        score, parts = compute_score(row.get("views"), row.get("likes"), row.get("comments"),
                                     row.get("channel_followers"), row.get("published_at"), row.get("shares"))
        row.update({"score": score, "score_parts": parts,
                    "language": detect_language((row.get("title") or "") + " " + (row.get("description") or ""))})
        row.update(base)

    if b.get("language") in ("ar", "en", "other"):
        row["language"] = b["language"]
    if not category:
        row.pop("category", None)
    saved = db.upsert("videos", [row], "platform,external_id")[0]

    analyzed = False
    if as_bool(b.get("analyze"), as_bool(db.setting("auto_analyze_on_add", True), True)) and saved.get("analysis_status") != "done":
        try:
            analysis, mode = analyze_video(db, saved)
            saved = db.update("videos", {"id": f"eq.{saved['id']}"}, {
                "analysis": analysis, "analysis_status": "done", "analysis_mode": mode,
                "analysis_error": None, "analyzed_at": now_iso()})[0]
            analyzed = True
        except ApiError as e:
            warnings.append(f"أُضيف المقطع لكن التحليل لم يكتمل: {e}")
            db.update("videos", {"id": f"eq.{saved['id']}"}, {"analysis_status": "failed", "analysis_error": str(e)})
    return {"video": saved, "analyzed": analyzed, "warnings": warnings}


class handler(JsonHandler):
    def do_POST(self):
        self.run(lambda: ingest(self))
