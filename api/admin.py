import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib.m512 import JsonHandler, DB, ApiError, authenticate, yt_call, gemini_generate, SUPABASE_URL, http_json, HttpFailure, service_headers


def admin(h):
    db = DB()
    prof = authenticate(db, h.headers)
    if prof["role"] != "admin":
        raise ApiError("للمدير فقط", 403)
    b = h.body()
    action = b.get("action")

    if action == "test_keys":
        out = {}
        try:
            yt_call(db, "videos", {"part": "id", "chart": "mostPopular", "regionCode": "US", "maxResults": 1}, 1)
            out["youtube"] = {"ok": True, "message": "مفتاح يوتيوب يعمل"}
        except ApiError as e:
            out["youtube"] = {"ok": False, "message": str(e)}
        try:
            db._settings = None
            r = gemini_generate(db, [{"text": "حلل هذا: عنوان تجريبي. أعد JSON قصيراً جداً، transcript فارغ و scenes فارغة."}])
            out["gemini"] = {"ok": True, "message": f"مفتاح Gemini يعمل ({r.get('_model')})"}
        except ApiError as e:
            out["gemini"] = {"ok": False, "message": str(e)}
        try:
            import yt_dlp  # noqa
            out["ytdlp"] = {"ok": True, "message": f"yt-dlp مثبت ({yt_dlp.version.__version__})"}
        except Exception:
            out["ytdlp"] = {"ok": False, "message": "yt-dlp غير مثبت"}
        return out

    if action == "delete_user":
        uid = str(b.get("user_id") or "")
        if uid == prof["id"]:
            raise ApiError("لا يمكنك حذف حسابك")
        try:
            http_json("DELETE", f"{SUPABASE_URL}/auth/v1/admin/users/{uid}", None,
                      service_headers())
        except HttpFailure as e:
            raise ApiError(f"تعذّر الحذف ({e.status})")
        return {"ok": True}

    if action == "create_user":
        email, password = (b.get("email") or "").strip(), b.get("password") or ""
        if "@" not in email or len(password) < 6:
            raise ApiError("أدخل بريداً صحيحاً وكلمة مرور من 6 أحرف على الأقل")
        try:
            u = http_json("POST", f"{SUPABASE_URL}/auth/v1/admin/users",
                          {"email": email, "password": password, "email_confirm": True,
                           "user_metadata": {"full_name": b.get("full_name") or email.split("@")[0]}},
                          service_headers())
        except HttpFailure as e:
            msg = (e.payload or {}).get("msg") or (e.payload or {}).get("message") or ""
            raise ApiError("تعذّر إنشاء الحساب: " + ("البريد مستخدم مسبقاً" if "already" in msg else msg))
        db.update("profiles", {"id": f"eq.{u['id']}"}, {"status": "active", "role": b.get("role", "student")})
        return {"ok": True, "id": u["id"]}

    raise ApiError("إجراء غير معروف")


class handler(JsonHandler):
    def do_POST(self):
        self.run(lambda: admin(self))
