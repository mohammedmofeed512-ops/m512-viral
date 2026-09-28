"""M512 Viral Content — مكتبة الخادم المشتركة.

كل دوال /api تستورد من هنا. لا تعتمد إلا على مكتبة بايثون القياسية
(و yt-dlp لجلب تيك توك وإنستغرام).
"""
import base64
import hashlib
import json
import math
import os
import re
import tempfile
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")

PLATFORMS = ("youtube", "shorts", "tiktok", "instagram")
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"


class ApiError(Exception):
    def __init__(self, message, status=400, code=None):
        super().__init__(message)
        self.status = status
        self.code = code or "error"


# ------------------------------------------------------------------ HTTP
def http_json(method, url, body=None, headers=None, timeout=30):
    data = None
    # لا نستخدم هوية متصفح هنا: Supabase يرفض المفتاح السري إذا بدا الطلب قادماً من متصفح
    h = {"User-Agent": "M512-Server/1.0 (python-urllib)", "Accept": "application/json"}
    if headers:
        h.update(headers)
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
            if not raw:
                return None
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        try:
            payload = json.loads(raw)
        except Exception:
            payload = {"message": raw[:400]}
        raise HttpFailure(e.code, payload)


def http_bytes(url, timeout=30, max_bytes=None, headers=None):
    h = {"User-Agent": UA}
    if headers:
        h.update(headers)
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        mime = r.headers.get("Content-Type", "application/octet-stream").split(";")[0]
        chunks, total = [], 0
        while True:
            c = r.read(1 << 16)
            if not c:
                break
            total += len(c)
            if max_bytes and total > max_bytes:
                raise ApiError("الملف أكبر من الحد المسموح", 413, "too_large")
            chunks.append(c)
        return b"".join(chunks), mime


class HttpFailure(Exception):
    def __init__(self, status, payload):
        super().__init__(f"HTTP {status}: {payload}")
        self.status = status
        self.payload = payload


# ------------------------------------------------------------------ Supabase (service role)
def service_headers():
    """المفاتيح الجديدة (sb_secret_...) تُرسل في apikey فقط، والقديمة (JWT) في الاثنين."""
    h = {"apikey": SUPABASE_SERVICE_KEY}
    if not SUPABASE_SERVICE_KEY.startswith("sb_"):
        h["Authorization"] = "Bearer " + SUPABASE_SERVICE_KEY
    return h


class DB:
    def __init__(self):
        if not (SUPABASE_URL and SUPABASE_SERVICE_KEY):
            raise ApiError("الخادم غير مُعدّ: أضف متغيرات Supabase في Vercel", 500, "not_configured")
        self.base = SUPABASE_URL + "/rest/v1"
        self.h = service_headers()
        self._settings = None

    def req(self, method, table, params=None, body=None, prefer=None):
        url = f"{self.base}/{table}"
        if params:
            url += "?" + urllib.parse.urlencode(params, safe=",.()*:")
        h = dict(self.h)
        if prefer:
            h["Prefer"] = prefer
        return http_json(method, url, body, h)

    def select(self, table, **params):
        return self.req("GET", table, params) or []

    def one(self, table, **params):
        params["limit"] = 1
        rows = self.select(table, **params)
        return rows[0] if rows else None

    def upsert(self, table, rows, on_conflict):
        return self.req("POST", table, {"on_conflict": on_conflict}, rows,
                        "resolution=merge-duplicates,return=representation") or []

    def insert(self, table, rows):
        return self.req("POST", table, None, rows, "return=representation") or []

    def update(self, table, match, body):
        return self.req("PATCH", table, match, body, "return=representation") or []

    def rpc(self, fn, args):
        return http_json("POST", f"{self.base}/rpc/{fn}", args, self.h)

    def settings(self):
        if self._settings is None:
            rows = self.select("settings", select="key,value")
            self._settings = {r["key"]: r["value"] for r in rows}
        return self._settings

    def setting(self, key, default=None):
        v = self.settings().get(key)
        return default if v in (None, "") else v

    def bump(self, service, units):
        try:
            self.rpc("bump_usage", {"p_service": service, "p_units": int(units)})
        except Exception:
            pass


# ------------------------------------------------------------------ Auth
def authenticate(db, headers):
    """يعيد ملف المستخدم (profile). يقبل رمز الدخول أو رمز إضافة كروم."""
    ext = headers.get("X-M512-Token") or headers.get("x-m512-token")
    if ext:
        if not re.fullmatch(r"[0-9a-fA-F-]{36}", ext.strip()):
            raise ApiError("رمز الإضافة غير صالح", 401, "bad_token")
        prof = db.one("profiles", select="*", ext_token=f"eq.{ext.strip()}")
        if not prof:
            raise ApiError("رمز الإضافة غير صحيح. انسخه من صفحة إعداداتك في المنصة", 401, "bad_token")
    else:
        auth = headers.get("Authorization") or ""
        if not auth.lower().startswith("bearer "):
            raise ApiError("سجّل الدخول أولاً", 401, "no_auth")
        try:
            user = http_json("GET", SUPABASE_URL + "/auth/v1/user", None,
                             {"apikey": SUPABASE_ANON_KEY or SUPABASE_SERVICE_KEY, "Authorization": auth})
        except HttpFailure:
            raise ApiError("انتهت الجلسة، سجّل الدخول من جديد", 401, "bad_session")
        prof = db.one("profiles", select="*", id=f"eq.{user['id']}")
        if not prof:
            raise ApiError("الحساب غير موجود", 401, "no_profile")
    if prof["status"] == "pending":
        raise ApiError("حسابك بانتظار تفعيل المدير", 403, "pending")
    if prof["status"] == "blocked":
        raise ApiError("هذا الحساب موقوف", 403, "blocked")
    return prof


# ------------------------------------------------------------------ Scoring
def _clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def compute_score(views, likes=0, comments=0, followers=None, published_at=None, shares=None, now=None):
    """درجة انتشار 0-100 من أربعة مؤشرات:
    - الوصول: حجم المشاهدات (1K = 0 ، 50M = 1)
    - التفوّق على القناة: المشاهدات ÷ المتابعين (1x = 0 ، 100x = 1)
    - السرعة: مشاهدات يومياً منذ النشر (100 = 0 ، 1M = 1)
    - التفاعل: (إعجاب + تعليق + مشاركة) ÷ مشاهدات (10% = 1)
    """
    views = int(views or 0)
    likes = int(likes or 0)
    comments = int(comments or 0)
    shares = int(shares or 0)
    parts, weights = {}, {}

    parts["reach"] = _clamp((math.log10(views + 1) - 3) / (7.7 - 3))
    weights["reach"] = 0.35

    if followers and followers > 0 and views > 0:
        ratio = views / followers
        parts["outlier"] = _clamp(math.log10(max(ratio, 1)) / 2)
        parts["outlier_ratio"] = round(ratio, 2)
        weights["outlier"] = 0.25

    age_days = None
    if published_at:
        try:
            dt = published_at if isinstance(published_at, datetime) else datetime.fromisoformat(str(published_at).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            age_days = max(((now or datetime.now(timezone.utc)) - dt).total_seconds() / 86400, 1)
        except Exception:
            age_days = None
    if age_days:
        vpd = views / age_days
        parts["velocity"] = _clamp((math.log10(vpd + 1) - 2) / 4)
        parts["views_per_day"] = int(vpd)
        weights["velocity"] = 0.25

    if views > 0 and (likes or comments or shares):
        er = (likes + comments + shares) / views
        parts["engagement"] = _clamp(er / 0.10)
        parts["engagement_rate"] = round(er * 100, 2)
        weights["engagement"] = 0.15

    total_w = sum(weights.values())
    score = sum(parts[k] * w for k, w in weights.items()) / total_w * 100 if total_w else 0
    for k in ("reach", "outlier", "velocity", "engagement"):
        if k in parts:
            parts[k] = round(parts[k] * 100)
    return round(score, 1), parts


def detect_language(text):
    t = text or ""
    ar = len(re.findall(r"[؀-ۿ]", t))
    latin = len(re.findall(r"[A-Za-z]", t))
    if ar and ar >= latin * 0.3:
        return "ar"
    if latin:
        return "en"
    return "other"


def iso_duration_to_sec(d):
    m = re.fullmatch(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", d or "")
    if not m:
        return None
    days, h, mi, s = (int(x or 0) for x in m.groups())
    return days * 86400 + h * 3600 + mi * 60 + s


# ------------------------------------------------------------------ URL parsing
def parse_video_url(url):
    """يعيد (platform, external_id, canonical_url) أو يرفع خطأ."""
    u = (url or "").strip()
    if not u:
        raise ApiError("الصق رابط الفيديو")
    if not re.match(r"^https?://", u):
        u = "https://" + u
    p = urllib.parse.urlparse(u)
    host = re.sub(r"^(www\.|m\.)", "", p.netloc.lower().split(":")[0])
    path = p.path

    if host in ("youtube.com", "youtu.be", "music.youtube.com"):
        vid = None
        if host == "youtu.be":
            vid = path.strip("/").split("/")[0]
        elif path.startswith("/shorts/"):
            vid = path.split("/")[2]
            return "shorts", vid, f"https://www.youtube.com/shorts/{vid}"
        elif path.startswith("/watch"):
            vid = urllib.parse.parse_qs(p.query).get("v", [None])[0]
        elif path.startswith(("/live/", "/embed/")):
            vid = path.split("/")[2]
        if not vid or not re.fullmatch(r"[\w-]{6,20}", vid):
            raise ApiError("رابط يوتيوب غير مفهوم")
        return "youtube", vid, f"https://www.youtube.com/watch?v={vid}"

    if host.endswith("tiktok.com"):
        m = re.search(r"/(?:video|photo)/(\d+)", path)
        if m:
            user = re.search(r"/@([^/]+)", path)
            canon = f"https://www.tiktok.com/@{user.group(1)}/video/{m.group(1)}" if user else f"https://www.tiktok.com/video/{m.group(1)}"
            return "tiktok", m.group(1), canon
        if host.startswith(("vm.", "vt.")) or path.startswith("/t/"):
            return "tiktok", None, u  # رابط مختصر، يُحلّ لاحقاً
        raise ApiError("رابط تيك توك غير مفهوم")

    if host.endswith("instagram.com"):
        m = re.search(r"/(?:reel|reels|p|tv)/([\w-]+)", path)
        if not m:
            raise ApiError("رابط إنستغرام غير مفهوم (استخدم رابط الريل نفسه)")
        return "instagram", m.group(1), f"https://www.instagram.com/reel/{m.group(1)}/"

    raise ApiError("المنصات المدعومة: يوتيوب، شورتس، تيك توك، إنستغرام")


def resolve_short_link(url):
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.geturl()
    except Exception:
        return url


# ------------------------------------------------------------------ YouTube
YT = "https://www.googleapis.com/youtube/v3"


def yt_key(db):
    key = db.setting("youtube_api_key")
    if not key:
        raise ApiError("أضف مفتاح YouTube API من الإعدادات > يوتيوب", 400, "missing_youtube_key")
    return key


def yt_call(db, endpoint, params, units):
    params = dict(params)
    params["key"] = yt_key(db)
    try:
        data = http_json("GET", f"{YT}/{endpoint}?" + urllib.parse.urlencode(params))
    except HttpFailure as e:
        err = (e.payload or {}).get("error", {}) if isinstance(e.payload, dict) else {}
        reason = ""
        try:
            reason = err.get("errors", [{}])[0].get("reason", "")
        except Exception:
            pass
        if reason in ("quotaExceeded", "dailyLimitExceeded"):
            raise ApiError("انتهت حصة يوتيوب المجانية لليوم. تتجدد تلقائياً بعد منتصف الليل بتوقيت المحيط الهادئ", 429, "yt_quota")
        msg = re.sub(r"<[^>]+>", "", err.get("message") or "")
        if reason in ("keyInvalid", "keyExpired", "accessNotConfigured", "ipRefererBlocked", "forbidden") or \
                "API key" in msg or "has not been used" in msg:
            raise ApiError("مفتاح يوتيوب غير صالح أو خدمة YouTube Data API غير مفعّلة: " + msg, 400, "yt_key")
        if "regionCode" in msg or reason in ("invalidRegionCode", "unsupportedRegionCode"):
            raise ApiError("يوتيوب لا يدعم هذه الدولة في هذا النوع من البحث. اختر دولة أخرى", 400, "yt_region")
        if e.status in (400, 403, 404):
            raise ApiError("يوتيوب رفض الطلب: " + msg, 400, "yt_bad_request")
        raise ApiError("خطأ من يوتيوب: " + (err.get("message") or str(e.status)), 502, "yt_error")
    db.bump("youtube", units)
    return data


def yt_hydrate(db, ids, platform_hint=None, extra=None):
    """يجلب إحصاءات الفيديوهات والقنوات ويعيد صفوفاً جاهزة للحفظ."""
    if not ids:
        return []
    vids = []
    for i in range(0, len(ids), 50):
        data = yt_call(db, "videos", {"part": "snippet,statistics,contentDetails", "id": ",".join(ids[i:i + 50])}, 1)
        vids += data.get("items", [])
    ch_ids = list({v["snippet"]["channelId"] for v in vids})
    subs = {}
    for i in range(0, len(ch_ids), 50):
        data = yt_call(db, "channels", {"part": "statistics", "id": ",".join(ch_ids[i:i + 50])}, 1)
        for c in data.get("items", []):
            st = c.get("statistics", {})
            if not st.get("hiddenSubscriberCount"):
                subs[c["id"]] = int(st.get("subscriberCount", 0) or 0)

    shorts_max = int(db.setting("shorts_max_seconds", 180))
    rows = []
    for v in vids:
        sn, st = v["snippet"], v.get("statistics", {})
        dur = iso_duration_to_sec(v.get("contentDetails", {}).get("duration"))
        platform = platform_hint or ("shorts" if dur is not None and dur <= shorts_max else "youtube")
        thumbs = sn.get("thumbnails", {})
        thumb = (thumbs.get("maxres") or thumbs.get("standard") or thumbs.get("high") or thumbs.get("medium") or {}).get("url")
        views, likes, comments = int(st.get("viewCount", 0) or 0), int(st.get("likeCount", 0) or 0), int(st.get("commentCount", 0) or 0)
        followers = subs.get(sn["channelId"])
        score, parts = compute_score(views, likes, comments, followers, sn.get("publishedAt"))
        lang = (sn.get("defaultAudioLanguage") or sn.get("defaultLanguage") or "")[:2]
        lang = "ar" if lang == "ar" else (detect_language(sn.get("title")) if not lang else ("en" if lang == "en" else "other"))
        url = f"https://www.youtube.com/shorts/{v['id']}" if platform == "shorts" else f"https://www.youtube.com/watch?v={v['id']}"
        row = {
            "platform": platform, "external_id": v["id"], "url": url,
            "title": sn.get("title"), "description": (sn.get("description") or "")[:3000],
            "thumbnail_url": thumb, "channel_name": sn.get("channelTitle"), "channel_id": sn.get("channelId"),
            "channel_followers": followers, "language": lang, "views": views, "likes": likes, "comments": comments,
            "duration_sec": dur, "published_at": sn.get("publishedAt"), "score": score, "score_parts": parts,
            "updated_at": now_iso(),
        }
        if extra:
            row.update(extra)
        rows.append(row)
    return rows


# ------------------------------------------------------------------ yt-dlp (TikTok / Instagram)
def ytdlp_info(url, download_dir=None, max_mb=40):
    """يجلب بيانات الفيديو، ويحمّل الفيديو إن طُلب. يعيد (info, video_path)."""
    try:
        import yt_dlp  # noqa
    except ImportError:
        raise ApiError("أداة yt-dlp غير مثبتة على الخادم", 500, "no_ytdlp")
    opts = {
        "quiet": True, "no_warnings": True, "noplaylist": True, "skip_download": download_dir is None,
        "socket_timeout": 20, "http_headers": {"User-Agent": UA},
    }
    if download_dir:
        opts.update({
            "outtmpl": os.path.join(download_dir, "v.%(ext)s"),
            "format": f"best[ext=mp4][filesize<{max_mb}M]/best[ext=mp4]/best[filesize<{max_mb}M]/worst",
            "max_filesize": max_mb * 1024 * 1024,
        })
    with yt_dlp.YoutubeDL(opts) as ydl:
        info = ydl.extract_info(url, download=download_dir is not None)
    path = None
    if download_dir:
        for f in os.listdir(download_dir):
            if f.startswith("v."):
                path = os.path.join(download_dir, f)
    return info, path


def row_from_ytdlp(platform, info, fallback_url):
    ts = info.get("timestamp")
    published = datetime.fromtimestamp(ts, timezone.utc).isoformat() if ts else None
    if not published and info.get("upload_date"):
        d = info["upload_date"]
        published = f"{d[:4]}-{d[4:6]}-{d[6:8]}T00:00:00+00:00"
    title = info.get("title") or ""
    desc = info.get("description") or ""
    if platform in ("tiktok", "instagram") and (not title or title.startswith("Video by")):
        title = (desc.split("\n")[0] or title)[:200]
    return {
        "title": title[:300] or None,
        "description": desc[:3000],
        "thumbnail_url": info.get("thumbnail"),
        "channel_name": info.get("uploader") or info.get("channel") or info.get("uploader_id"),
        "channel_id": str(info.get("uploader_id") or info.get("channel_id") or ""),
        "channel_followers": info.get("channel_follower_count"),
        "views": info.get("view_count") or 0,
        "likes": info.get("like_count") or 0,
        "comments": info.get("comment_count") or 0,
        "shares": info.get("repost_count"),
        "duration_sec": int(info["duration"]) if info.get("duration") else None,
        "published_at": published,
        "url": info.get("webpage_url") or fallback_url,
    }


def clean_page_data(pd):
    """بيانات قادمة من إضافة كروم أو الإدخال اليدوي."""
    if not isinstance(pd, dict):
        return {}
    out = {}
    for k in ("title", "description", "thumbnail_url", "channel_name", "published_at"):
        if pd.get(k):
            out[k] = str(pd[k])[:3000]
    for k in ("views", "likes", "comments", "shares", "channel_followers", "duration_sec"):
        v = parse_count(pd.get(k))
        if v is not None:
            out[k] = v
    return out


def parse_count(v):
    """يحوّل '1.2M' أو '12,300' أو '3.4 ألف' إلى رقم."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(v)
    s = str(v).strip().lower().replace(",", "").replace("٬", "")
    s = s.translate(str.maketrans("٠١٢٣٤٥٦٧٨٩٫", "0123456789."))
    m = re.search(r"([\d.]+)\s*(k|m|b|ألف|الف|مليون|مليار|آلاف)?", s)
    if not m:
        return None
    try:
        n = float(m.group(1))
    except ValueError:
        return None
    mult = {"k": 1e3, "ألف": 1e3, "الف": 1e3, "آلاف": 1e3, "m": 1e6, "مليون": 1e6, "b": 1e9, "مليار": 1e9}.get(m.group(2) or "", 1)
    return int(n * mult)


# ------------------------------------------------------------------ Gemini
GEMINI = "https://generativelanguage.googleapis.com/v1beta/models"

ANALYSIS_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "summary": {"type": "STRING"},
        "content_type": {"type": "STRING"},
        "hook": {"type": "OBJECT", "properties": {
            "moment": {"type": "STRING"}, "type": {"type": "STRING"}, "why": {"type": "STRING"}}},
        "pacing": {"type": "STRING"},
        "editing": {"type": "STRING"},
        "topic_emotion": {"type": "STRING"},
        "title_thumbnail": {"type": "STRING"},
        "audience": {"type": "STRING"},
        "cta": {"type": "STRING"},
        "viral_reasons": {"type": "ARRAY", "items": {"type": "STRING"}},
        "lesson": {"type": "STRING"},
        "formula": {"type": "STRING"},
        "transcript": {"type": "STRING"},
        "scenes": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "time": {"type": "STRING"}, "visual": {"type": "STRING"}, "audio": {"type": "STRING"}}}},
    },
    "required": ["summary", "hook", "viral_reasons", "lesson", "transcript", "scenes"],
}


def analysis_prompt(v, mode):
    metrics = (f"المنصة: {v.get('platform')} | المشاهدات: {v.get('views')} | الإعجابات: {v.get('likes')} | "
               f"التعليقات: {v.get('comments')} | متابعو الصانع: {v.get('channel_followers') or 'غير معروف'} | "
               f"المدة: {v.get('duration_sec') or '?'} ثانية | درجة الانتشار: {v.get('score')}/100")
    source = {
        "video": "شاهد الفيديو المرفق كاملاً (الصورة والصوت).",
        "thumbnail": "لم يتوفر الفيديو نفسه؛ حلّل من الصورة المصغرة المرفقة والنص والأرقام فقط، ووضّح ذلك باختصار، واترك transcript فارغاً إن لم تعرفه، وscenes تقديرية مختصرة.",
        "text": "لم يتوفر الفيديو ولا الصورة؛ حلّل من العنوان والوصف والأرقام فقط، واترك transcript فارغاً.",
    }[mode]
    return f"""أنت محلل محتوى فيروسي تدرّب صنّاع المحتوى العرب. {source}

العنوان: {v.get('title') or ''}
الوصف: {(v.get('description') or '')[:1200]}
{metrics}

اكتب تحليلاً عملياً مختصراً باللغة العربية الفصحى المبسطة يشرح لماذا انتشر هذا المقطع، بحيث يتعلم منه الطالب ويصنع مقطعاً مشابهاً:
- summary: جملة واحدة تلخص المقطع.
- content_type: نوع المحتوى بكلمتين (مثل: تعليمي سريع، كوميديا موقف، فلوق عائلي).
- hook: ماذا حدث/قيل في أول 3 ثوانٍ (moment)، ونوع الهوك (type: سؤال، صدمة، وعد، فضول، حركة...)، ولماذا شدّ المشاهد (why).
- pacing: الإيقاع وطول المقطع وسرعة الانتقال.
- editing: أسلوب المونتاج والنصوص على الشاشة والصوت والموسيقى.
- topic_emotion: الموضوع والعاطفة التي حرّكها ولماذا لمست الناس.
- title_thumbnail: ما الذي يجعل العنوان والصورة المصغرة يجذبان النقر.
- audience: الجمهور المستهدف.
- cta: الدعوة لفعل إن وجدت (أو "لا توجد").
- viral_reasons: من 3 إلى 5 أسباب انتشار قصيرة ومحددة.
- lesson: درس واحد قابل للتطبيق فوراً.
- formula: قالب قابل للتكرار بصيغة خطوات قصيرة (مثال: هوك سؤال ← مشكلة ← 3 حلول سريعة ← نتيجة).
- transcript: النص المنطوق حرفياً بلغته الأصلية كما قيل (مع النصوص الظاهرة على الشاشة بين قوسين [ ]).
- scenes: تقسيم المشاهد بالتوقيت (time مثل 0:00-0:03) مع وصف الصورة (visual) والصوت/الكلام (audio).
كن محدداً، ولا تكرر نفس الفكرة في أكثر من حقل."""


def gemini_generate(db, parts):
    key = db.setting("gemini_api_key")
    if not key:
        raise ApiError("أضف مفتاح Gemini من الإعدادات > التحليل", 400, "missing_gemini_key")
    models = [db.setting("gemini_model", "gemini-3.5-flash"), db.setting("gemini_fallback_model", "gemini-3.5-flash-lite")]
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {"temperature": 0.4, "responseMimeType": "application/json", "responseSchema": ANALYSIS_SCHEMA},
    }
    last = None
    for model in [m for m in models if m]:
        try:
            data = http_json("POST", f"{GEMINI}/{model}:generateContent?key={urllib.parse.quote(key)}", body, timeout=110)
            db.bump("gemini", 1)
            text = "".join(p.get("text", "") for p in data["candidates"][0]["content"]["parts"])
            result = json.loads(text)
            result["_model"] = model
            return result
        except HttpFailure as e:
            msg = (e.payload or {}).get("error", {}).get("message", "") if isinstance(e.payload, dict) else ""
            last = (e.status, msg)
            if e.status in (400, 401, 403) and "API key" in msg:
                raise ApiError("مفتاح Gemini غير صالح", 400, "gemini_key")
            continue  # 429 أو 404 أو 5xx: جرّب النموذج الاحتياطي
        except (KeyError, IndexError, ValueError) as e:
            last = (0, f"رد غير مفهوم: {e}")
            continue
    if last and last[0] == 429:
        raise ApiError("انتهت حصة Gemini المجانية مؤقتاً. جرّب بعد دقيقة أو غداً", 429, "gemini_quota")
    raise ApiError(f"تعذر التحليل: {last[1] if last else ''}", 502, "gemini_error")


def analyze_video(db, v):
    """يحلل الفيديو بأفضل مصدر متاح. يعيد (analysis, mode)."""
    prompt_mode = None
    parts = []
    if v["platform"] in ("youtube", "shorts"):
        parts = [{"file_data": {"file_uri": f"https://www.youtube.com/watch?v={v['external_id']}"}}]
        prompt_mode = "video"
        try:
            return _run(db, v, parts, prompt_mode)
        except ApiError as e:
            if e.code in ("missing_gemini_key", "gemini_key", "gemini_quota"):
                raise
            parts, prompt_mode = [], None  # نكمل بالصورة المصغرة

    if not prompt_mode and v["platform"] in ("tiktok", "instagram"):
        try:
            with tempfile.TemporaryDirectory() as d:
                _, path = ytdlp_info(v["url"], download_dir=d, max_mb=40)
                if path and os.path.getsize(path) > 0:
                    with open(path, "rb") as f:
                        data = f.read()
                    parts = [{"inline_data": {"mime_type": "video/mp4", "data": base64.b64encode(data).decode()}}]
                    prompt_mode = "video"
        except Exception:
            parts, prompt_mode = [], None

    if not prompt_mode and v.get("thumbnail_url"):
        try:
            img, mime = http_bytes(v["thumbnail_url"], max_bytes=8 * 1024 * 1024)
            if not mime.startswith("image/"):
                mime = "image/jpeg"
            parts = [{"inline_data": {"mime_type": mime, "data": base64.b64encode(img).decode()}}]
            prompt_mode = "thumbnail"
        except Exception:
            parts, prompt_mode = [], None

    if not prompt_mode:
        prompt_mode = "text"
    return _run(db, v, parts, prompt_mode)


def _run(db, v, media_parts, mode):
    parts = list(media_parts) + [{"text": analysis_prompt(v, mode)}]
    return gemini_generate(db, parts), mode


# ------------------------------------------------------------------ misc
def now_iso():
    return datetime.now(timezone.utc).isoformat()


def cache_key(*parts):
    return hashlib.sha1("|".join(str(p) for p in parts).encode()).hexdigest()


def published_after(days):
    return (datetime.now(timezone.utc) - timedelta(days=int(days))).strftime("%Y-%m-%dT%H:%M:%SZ")


def as_bool(v, default=False):
    if v is None:
        return default
    if isinstance(v, bool):
        return v
    return str(v).lower() in ("1", "true", "yes", "on")


# ------------------------------------------------------------------ Handler base
class JsonHandler(BaseHTTPRequestHandler):
    """أساس لكل دوال /api: CORS + JSON + معالجة الأخطاء."""

    def _send(self, status, payload):
        body = b"" if status == 204 else json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type, X-M512-Token")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if body:
            self.wfile.write(body)

    def do_OPTIONS(self):
        self._send(204, {})

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            return json.loads(self.rfile.read(n).decode("utf-8"))
        except Exception:
            raise ApiError("طلب غير صالح")

    def query(self):
        return {k: v[0] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).items()}

    def run(self, fn):
        try:
            self._send(200, fn())
        except ApiError as e:
            self._send(e.status, {"error": str(e), "code": e.code})
        except HttpFailure as e:
            self._send(502, {"error": f"خطأ في الاتصال بالخدمة ({e.status})", "code": "upstream", "detail": e.payload})
        except Exception as e:  # pragma: no cover
            self._send(500, {"error": f"خطأ غير متوقع: {e}", "code": "server"})

    def log_message(self, *args):
        pass
