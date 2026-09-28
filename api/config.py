import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib.m512 import JsonHandler, SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_KEY


class handler(JsonHandler):
    """إعدادات عامة للواجهة: رابط Supabase والمفتاح العام فقط."""

    def do_GET(self):
        self.run(lambda: {
            "supabaseUrl": SUPABASE_URL,
            "supabaseAnonKey": SUPABASE_ANON_KEY,
            "configured": bool(SUPABASE_URL and SUPABASE_ANON_KEY and SUPABASE_SERVICE_KEY),
            "missing": [k for k, v in {"SUPABASE_URL": SUPABASE_URL, "SUPABASE_ANON_KEY": SUPABASE_ANON_KEY,
                                        "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_SERVICE_KEY}.items() if not v],
        })
