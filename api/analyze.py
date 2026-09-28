import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib.m512 import JsonHandler, DB, ApiError, authenticate, analyze_video, as_bool, now_iso


def analyze(h):
    db = DB()
    prof = authenticate(db, h.headers)
    b = h.body()
    vid = str(b.get("video_id") or "")
    v = db.one("videos", select="*", id=f"eq.{vid}")
    if not v:
        raise ApiError("الفيديو غير موجود", 404)
    force = as_bool(b.get("force")) and prof["role"] == "admin"
    if v.get("analysis_status") == "done" and v.get("analysis") and not force:
        return {"video": v, "cached": True}
    db.update("videos", {"id": f"eq.{vid}"}, {"analysis_status": "running"})
    try:
        analysis, mode = analyze_video(db, v)
    except ApiError as e:
        db.update("videos", {"id": f"eq.{vid}"}, {"analysis_status": "failed", "analysis_error": str(e)})
        raise
    v = db.update("videos", {"id": f"eq.{vid}"}, {"analysis": analysis, "analysis_status": "done",
                                                    "analysis_mode": mode, "analysis_error": None,
                                                    "analyzed_at": now_iso()})[0]
    return {"video": v, "cached": False}


class handler(JsonHandler):
    def do_POST(self):
        self.run(lambda: analyze(self))
