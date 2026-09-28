"""اختبارات منطق الخادم بدون إنترنت: نستبدل الاتصالات الخارجية بردود وهمية."""
import io, json, os, sys, re, urllib.parse
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.environ.update(SUPABASE_URL="https://x.supabase.co", SUPABASE_ANON_KEY="anon", SUPABASE_SERVICE_ROLE_KEY="svc")
import importlib
import lib.m512 as M
importlib.reload(M)

# ---------- وحدات صغيرة
assert M.parse_video_url("https://www.youtube.com/shorts/abcDEF12345")[0] == "shorts"
assert M.parse_video_url("youtu.be/abcDEF12345?t=3")[1] == "abcDEF12345"
assert M.parse_video_url("https://www.youtube.com/watch?v=abcDEF12345&list=x")[0] == "youtube"
assert M.parse_video_url("https://www.tiktok.com/@some.user/video/7301234567890123456?lang=ar")[1] == "7301234567890123456"
assert M.parse_video_url("https://vm.tiktok.com/ZMabc/")[1] is None
assert M.parse_video_url("https://www.instagram.com/reel/C9xYz_AbC/?igsh=1")[1] == "C9xYz_AbC"
assert M.parse_count("1.2M") == 1200000 and M.parse_count("12,300") == 12300 and M.parse_count("3.4 ألف") == 3400
assert M.parse_count("٤٥٬٠٠٠") == 45000 and M.parse_count(None) is None
assert M.iso_duration_to_sec("PT1M5S") == 65 and M.iso_duration_to_sec("PT2H") == 7200
assert M.detect_language("تحدي رياضي #shorts") == "ar" and M.detect_language("Hello world") == "en"
s_big, p = M.compute_score(20_000_000, 1_500_000, 30_000, 200_000, "2026-09-20T00:00:00Z")
s_small, _ = M.compute_score(5_000, 100, 5, 900_000, "2025-01-01T00:00:00Z")
assert s_big > 75 > s_small, (s_big, s_small)
assert 0 <= s_small <= 100 and p["outlier_ratio"] == 100.0
s_nof, p2 = M.compute_score(1_000_000, 0, 0, None, None)
assert "outlier" not in p2 and s_nof > 0
try:
    M.parse_video_url("https://example.com/v")
    raise SystemExit("should fail")
except M.ApiError:
    pass
print("units ok")

# ---------- خادم وهمي
DBS = {"profiles": [{"id": "u1", "role": "admin", "status": "active", "ext_token": "11111111-2222-3333-4444-555555555555", "full_name": "م"}],
       "settings": [{"key": "youtube_api_key", "value": "YTKEY"}, {"key": "gemini_api_key", "value": "GKEY"},
                    {"key": "shorts_max_seconds", "value": 180}, {"key": "youtube_results", "value": 25}],
       "videos": [], "searches": [], "categories": [{"name": "رياضة", "yt_category_id": "17"}]}
CALLS = []


def fake_http_json(method, url, body=None, headers=None, timeout=30):
    CALLS.append((method, url.split("?")[0]))
    u = urllib.parse.urlparse(url); q = urllib.parse.parse_qs(u.query)
    if "auth/v1/user" in url:
        return {"id": "u1"}
    if "googleapis.com/youtube/v3/search" in url:
        assert q["key"] == ["YTKEY"]
        return {"items": [{"id": {"videoId": f"vid{i}"}} for i in range(4)]}
    if "googleapis.com/youtube/v3/videos" in url:
        ids = q.get("id", ["t1,t2"])[0].split(",")
        durs = ["PT45S", "PT12M", "PT2M50S", "PT59S"]
        return {"items": [{"id": vid, "snippet": {"title": "تحدي كرة " + vid, "channelId": "c1", "channelTitle": "قناة",
                                                  "publishedAt": "2026-09-01T00:00:00Z", "thumbnails": {"high": {"url": "https://i/x.jpg"}}},
                           "statistics": {"viewCount": str(1_000_000 * (i + 1)), "likeCount": "50000", "commentCount": "900"},
                           "contentDetails": {"duration": durs[i % 4]}} for i, vid in enumerate(ids)]}
    if "googleapis.com/youtube/v3/channels" in url:
        return {"items": [{"id": "c1", "statistics": {"subscriberCount": "100000"}}]}
    if "generativelanguage" in url:
        assert body["contents"][0]["parts"][-1]["text"]
        return {"candidates": [{"content": {"parts": [{"text": json.dumps({"summary": "ملخص", "hook": {"moment": "م"}, "viral_reasons": ["أ", "ب", "ج"], "lesson": "د", "transcript": "نص", "scenes": []}, ensure_ascii=False)}]}}]}
    if "/rest/v1/rpc/" in url:
        return None
    m = re.search(r"/rest/v1/(\w+)", url)
    table = m.group(1)
    rows = DBS.setdefault(table, [])
    if method == "GET":
        out = rows
        for k, v in q.items():
            if k in ("select", "order", "limit"):
                continue
            op, val = v[0].split(".", 1)
            if op == "eq":
                out = [r for r in out if str(r.get(k)) == val]
            elif op == "in":
                ids = val.strip("()").split(",")
                out = [r for r in out if r.get(k) in ids]
            elif op == "gte":
                out = [r for r in out if str(r.get(k)) >= val]
        return out[: int(q["limit"][0])] if "limit" in q else out
    if method == "POST":
        conflict = q.get("on_conflict", [None])[0]
        res = []
        for b in (body if isinstance(body, list) else [body]):
            keys = conflict.split(",") if conflict else []
            ex = next((r for r in rows if keys and all(r.get(k) == b.get(k) for k in keys)), None)
            if ex:
                ex.update(b); res.append(ex)
            else:
                nb = {"id": b.get("id") or f"{table}-{len(rows)+1}", "analysis_status": "none", **b}; rows.append(nb); res.append(nb)
        return res
    if method == "PATCH":
        vid = q["id"][0].split(".", 1)[1]
        res = [r for r in rows if r["id"] == vid]
        for r in res:
            r.update(body)
        return res
    raise AssertionError(url)


M.http_json = fake_http_json


class FakeH:
    def __init__(self, body, token=True):
        self._b = body
        self.headers = {"Authorization": "Bearer abc"} if token else {"X-M512-Token": "11111111-2222-3333-4444-555555555555"}

    def body(self):
        return self._b


def load(name):
    spec = importlib.util.spec_from_file_location(name, os.path.join(ROOT, "api", name + ".py"))
    mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)
    for k in ("DB", "authenticate", "yt_call", "yt_hydrate", "analyze_video", "ytdlp_info"):
        if hasattr(mod, k) and hasattr(M, k):
            setattr(mod, k, getattr(M, k))
    return mod

import importlib.util
search = load("search")
r = search.search(FakeH({"platform": "shorts", "query": "رياضة", "category": "رياضة", "language": "ar"}))
assert r["units"] == 102 and not r["cached"]
assert all(v["platform"] == "shorts" and v["duration_sec"] <= 180 for v in r["videos"]), r["videos"]
assert len(r["videos"]) == 3, len(r["videos"])
assert r["videos"][0]["score"] >= r["videos"][-1]["score"]
r2 = search.search(FakeH({"platform": "shorts", "query": "رياضة", "category": "رياضة", "language": "ar"}))
assert r2["cached"] and r2["units"] == 0 and len(r2["videos"]) == 3
r3 = search.search(FakeH({"platform": "youtube", "mode": "trending", "category": "رياضة", "language": "all"}))
assert r3["units"] == 3 and all(v["platform"] == "youtube" for v in r3["videos"])
print("search ok", [v["score"] for v in r["videos"]])

ingest = load("ingest")
# تيك توك: yt-dlp يفشل، وبيانات الإضافة تكمل
def boom(*a, **k): raise RuntimeError("blocked")
ingest.ytdlp_info = boom
M.ytdlp_info = boom
M.http_bytes = lambda *a, **k: (b"\xff\xd8img", "image/jpeg")
out = ingest.ingest(FakeH({"url": "https://www.tiktok.com/@a/video/7301234567890123456", "category": "رياضة",
                           "page_data": {"title": "لقطة خرافية", "views": "2.5M", "likes": "300K", "comments": "4,100",
                                         "thumbnail_url": "https://p16/x.jpg", "channel_followers": 50000}}, token=False))
v = out["video"]
assert v["platform"] == "tiktok" and v["views"] == 2_500_000 and v["likes"] == 300_000 and v["score"] > 50, v
assert out["analyzed"] and v["analysis_mode"] == "thumbnail" and out["warnings"], out
# بدون أي بيانات = يطلب الإدخال اليدوي
try:
    ingest.ingest(FakeH({"url": "https://www.instagram.com/reel/ABCdef123/"}))
    raise SystemExit("should need manual")
except M.ApiError as e:
    assert e.code == "need_manual"
# يوتيوب بالرابط: يحلل بالفيديو مباشرة
out = ingest.ingest(FakeH({"url": "https://youtu.be/zzz111"}))
assert out["video"]["analysis_mode"] == "video" and out["analyzed"]
print("ingest ok")

analyze = load("analyze")
res = analyze.analyze(FakeH({"video_id": out["video"]["id"]}))
assert res["cached"]
res = analyze.analyze(FakeH({"video_id": out["video"]["id"], "force": True}))
assert not res["cached"] and res["video"]["analysis"]["summary"] == "ملخص"
print("analyze ok")

# طالب بانتظار التفعيل
DBS["profiles"][0]["status"] = "pending"
try:
    analyze.analyze(FakeH({"video_id": "x"}))
    raise SystemExit("should block")
except M.ApiError as e:
    assert e.status == 403
print("ALL TESTS PASSED")
