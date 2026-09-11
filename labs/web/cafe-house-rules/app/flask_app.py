from http.cookies import SimpleCookie
import os

from flask import Flask
from flask import jsonify
from flask import make_response
from flask import redirect
from flask import request
from flask.sessions import TaggedJSONSerializer
from itsdangerous import BadData
from itsdangerous.url_safe import URLSafeSerializer
from jinja2 import Environment
import requests


SECRET_KEY = os.getenv("SECRET_KEY", "devkey-devkey-devkey")
ADMIN_TOKEN = "admin-token111111"
FLAG = os.getenv("FLAG", "duck{markup_cookie_route_5e29a1}")
BOT_URL = "http://bot:8001/visit"
RULES = {
    "en": "<h2>House Rules</h2><p>Be kind to staff and guests. Keep the noise down. No outside food. Enjoy the coffee.</p>",
    "ar": "<h2>House Rules</h2><p>Be kind to staff and guests. Keep the noise down. No outside food. Enjoy the coffee.</p>",
}
TPL = Environment(autoescape=True).from_string(
    """<!doctype html>
<meta charset=utf-8>
<title>House Rules</title>
<style>
:root{--bg:#f6eedd;--ink:#3a2a1c;--coffee:#6f4e37;--caramel:#c08552;--accent:#b3573a;--panel:#fffaf0f5;--panel2:#f4e8d2f5}
*{box-sizing:border-box}
body{margin:0;color:var(--ink);min-height:100vh;font:16px/1.6 Georgia,"Iowan Old Style","Times New Roman",serif;background:
radial-gradient(circle at 18% 8%,rgba(192,133,82,.20),transparent 30%),
radial-gradient(circle at 82% 0,rgba(179,87,58,.14),transparent 30%),
linear-gradient(180deg,#f9f2e3,#efdfc4),
repeating-linear-gradient(90deg,transparent 0 59px,rgba(111,78,55,.05) 60px 61px),
repeating-linear-gradient(0deg,transparent 0 59px,rgba(111,78,55,.04) 60px 61px);
overflow-x:hidden}
body:before{content:"";position:fixed;inset:0;background:repeating-linear-gradient(0deg,transparent 0 3px,rgba(111,78,55,.02) 3px 4px);pointer-events:none;opacity:.6}
.wrap{max-width:980px;margin:0 auto;padding:54px 22px 88px;position:relative}
.shell{position:relative;background:linear-gradient(180deg,var(--panel),var(--panel2));border:2px solid rgba(111,78,55,.35);border-radius:28px;padding:28px;box-shadow:0 24px 70px rgba(87,58,34,.18),inset 0 0 32px rgba(255,250,240,.5)}
.shell:before,.shell:after{content:"";position:absolute;width:16px;height:16px;border-radius:50%;top:18px}
.shell:before{right:52px;background:var(--caramel);box-shadow:0 2px 6px rgba(87,58,34,.25)}
.shell:after{right:26px;background:var(--accent);box-shadow:0 2px 6px rgba(87,58,34,.25)}
.badge{display:inline-block;padding:7px 12px;border:1px solid rgba(111,78,55,.45);border-radius:999px;background:#fffaf0;letter-spacing:.18em;text-transform:uppercase;font-size:11px;color:var(--coffee)}
h1{margin:16px 0 10px;font-size:64px;line-height:.98;max-width:14ch;letter-spacing:.02em;color:#4a3222}
.lede{max-width:50ch;font-size:18px;color:#7a5c44}
.stats{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}
.stat{padding:10px 14px;border-radius:14px;background:#fffaf0;border:1px solid rgba(192,133,82,.45);min-width:140px}
.stat b{display:block;color:var(--coffee);font-size:12px;letter-spacing:.12em;text-transform:uppercase}
.stat span{display:block;margin-top:4px;font-size:18px;color:#3a2a1c}
.panel{margin-top:30px;padding:26px;border-radius:22px;background:#fffaf0;border:1px solid rgba(192,133,82,.35)}
.langs{display:flex;gap:14px;flex-wrap:wrap;margin:4px 0 0}
.langs a{text-decoration:none;color:#4a3222;padding:12px 18px;border-radius:14px;background:linear-gradient(180deg,#f5e5c9,#fdf6ea);border:1px solid rgba(192,133,82,.5)}
.langs a:hover{transform:translateY(-1px);box-shadow:0 10px 22px rgba(87,58,34,.18)}
#rules{margin-top:20px;padding:22px;border-radius:18px;background:#fdf6ea;border-left:6px solid var(--accent);border:1px solid rgba(192,133,82,.35);min-height:132px}
#rules h2{margin-top:0;color:var(--coffee);text-transform:uppercase;letter-spacing:.08em}
.hint{margin-top:16px;color:#8a6f57;font-size:14px}
.hint code{color:var(--accent)}
</style>
<div class=wrap>
<div class=shell>
<span class=badge>Quack &amp; Grind Café</span>
<h1>Order Your Language</h1>
<p class=lede>Pick your table, read the house rules, and help us keep the café cozy for every guest who walks in.</p>
<div class=stats><div class=stat><b>Customer</b><span>Guest</span></div><div class=stat><b>Refills</b><span>01</span></div><div class=stat><b>Table</b><span>Corner Booth</span></div></div>
<div class=panel>
<div class=langs><a href=/preferences?lang=en>English</a><a href=/preferences?lang=ar>العربية</a></div>
<div id=rules>{{ body }}</div>
<p class=hint>Be kind to the baristas. Keep noise low. Enjoy your stay.</p>
</div>
</div>
</div>"""
)


SER = URLSafeSerializer(SECRET_KEY, salt="session", serializer=TaggedJSONSerializer())


app = Flask(__name__)


def load_session():
    raw = parsed_cookies().get("SESSION")
    if not raw:
        return {"user": "guest", "lang": "English"}
    try:
        return SER.loads(raw)
    except BadData:
        return {"user": "guest", "lang": "English"}


def parsed_cookies():
    jar = SimpleCookie()
    jar.load(request.headers.get("Cookie", ""))
    return {k: v.value for k, v in jar.items()}


def with_session(resp):
    if not parsed_cookies().get("SESSION"):
        resp.set_cookie("SESSION", SER.dumps({"user": "guest", "lang": "English"}), path="/")
    return resp


@app.get("/")
def index():
    return redirect("/rules")


@app.get("/rules")
def rules():
    s = load_session()
    lang = parsed_cookies().get("LANG", "en")
    body = RULES.get(lang, s.get("lang", RULES["en"]))
    return with_session(make_response(TPL.render(body=body)))


@app.get("/flag")
def flag():
    cookies = parsed_cookies()
    if cookies.get("ADMIN_TOKEN") != ADMIN_TOKEN:
        return ("Forbidden", 403)
    return FLAG


@app.get("/report")
def report():
    url = request.args.get("url", "")
    if not url.startswith("http://nginx/"):
        return jsonify({"error": "url must start with http://nginx/"}), 400
    r = requests.get(BOT_URL, params={"url": url}, timeout=30)
    return jsonify({"status": r.text})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
