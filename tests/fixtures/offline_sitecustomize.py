"""Subprocess-only fixture: fake public HTTP; hard fail on real sockets.

The integration test copies this as sitecustomize.py into its temporary folder.
It is never imported by the audit in normal use.
"""
import io
import json
import socket
import urllib.request
from urllib.parse import urlsplit

import agent_ready_http as http


def forbidden(*args, **kwargs):
    raise AssertionError("Offline tests must not open sockets")


socket.create_connection = forbidden
socket.socket.connect = forbidden
socket.getaddrinfo = forbidden
OriginalPacer = http.HostPacer


class FastPacer(OriginalPacer):
    def __init__(self, *args, **kwargs):
        self.tick = 100.0
        super().__init__(delay=0, clock=lambda: self.tick, sleep=self.advance)

    def advance(self, seconds):
        self.tick += seconds


http.HostPacer = FastPacer


class Response(io.BytesIO):
    def __init__(self, body, code=200, headers=None):
        super().__init__(body.encode())
        self.code = code
        self.headers = headers or {}


def open_fixture(self, request, timeout=None):
    parsed = urlsplit(request.full_url)
    if parsed.hostname == "blocked.example.com":
        return Response("", 429, {"Retry-After": "3600"})
    path = parsed.path
    if path == "/":
        return Response('<html><a href="/products/demo">Product</a></html>')
    if path == "/.well-known/ucp":
        return Response(json.dumps({"ucp": {"version": "2026-08-25", "services": {
            "dev.ucp.shopping": [{"transport": "mcp", "endpoint": f"https://{parsed.hostname}/mcp"}]},
            "capabilities": {name: {} for name in (
                "dev.ucp.shopping.catalog.search", "dev.ucp.shopping.catalog.lookup",
                "dev.ucp.shopping.cart", "dev.ucp.shopping.checkout")}}}))
    if path == "/mcp":
        method = json.loads(request.data)["method"]
        assert method in ("initialize", "tools/list"), "No commerce operations allowed"
        if method == "initialize":
            return Response('{"result":{"serverInfo":{"name":"fixture"}}}')
        return Response('{"result":{"tools":[{"name":"search_catalog"},{"name":"get_product"}]}}')
    if path == "/products/demo":
        return Response('<script type="application/ld+json">' + json.dumps({
            "@type": "Product", "brand": "Fixture", "description": "Synthetic test product",
            "image": "image.png", "gtin13": "1234567890123",
            "offers": {"price": "12.50", "availability": "InStock"}}) + '</script>')
    if path.startswith("/policies/"):
        return Response("Fixture policy")
    if path == "/robots.txt":
        if parsed.hostname == "partial.example.com":
            return Response("", 503)
        return Response("User-agent: *\nAllow: /\n")
    if path == "/sitemap.xml":
        return Response("", 404)
    raise AssertionError("Unexpected fixture request: " + request.full_url)


urllib.request.OpenerDirector.open = open_fixture
