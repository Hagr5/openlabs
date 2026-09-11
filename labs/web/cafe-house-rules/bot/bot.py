import asyncio
import os
from urllib.parse import urlparse

from flask import Flask, request
from playwright.async_api import async_playwright


app = Flask(__name__)
ADMIN_TOKEN = "admin-token111111"
ALLOWED_HOST = os.getenv("ALLOWED_HOST", "nginx")


async def visit(url):
    parsed = urlparse(url)
    if parsed.scheme != "http":
        raise ValueError("bad scheme")
    if parsed.username or parsed.password or not parsed.hostname:
        raise ValueError("bad url")
    if parsed.hostname != ALLOWED_HOST:
        raise ValueError("host not allowed")
    if parsed.port not in (None, 80):
        raise ValueError("bad port")
    origin = f"{parsed.scheme}://{parsed.hostname}:{parsed.port or (443 if parsed.scheme == 'https' else 80)}"
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        await page.goto(origin, wait_until="networkidle")
        await context.add_cookies(
            [
                {
                    "name": "ADMIN_TOKEN",
                    "value": ADMIN_TOKEN,
                    "url": origin,
                    "httpOnly": False,
                }
            ]
        )
        await page.goto(url, wait_until="networkidle")
        await page.wait_for_timeout(1500)
        await browser.close()


@app.get("/visit")
def do_visit():
    url = request.args["url"]
    try:
        asyncio.run(visit(url))
        return "ok"
    except ValueError as e:
        return (str(e), 400)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001)
