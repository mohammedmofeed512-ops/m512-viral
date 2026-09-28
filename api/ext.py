import os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from lib.m512 import JsonHandler, DB, authenticate


def info(h):
    """تستخدمه إضافة كروم للتحقق من الرمز وجلب التصنيفات."""
    db = DB()
    prof = authenticate(db, h.headers)
    cats = db.select("categories", select="name", order="sort.asc")
    return {"name": prof.get("full_name"), "role": prof["role"], "categories": [c["name"] for c in cats]}


class handler(JsonHandler):
    def do_GET(self):
        self.run(lambda: info(self))
