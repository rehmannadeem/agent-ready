#!/usr/bin/env python3
"""
Agent-Ready Audit v0.2
Checks whether AI shopping agents (ChatGPT, Gemini, Copilot and others) can
discover and transact with an online store, using only public endpoints.

Author: Rehman Nadeem, Armans.AI  |  License: MIT
Python 3.10+ standard library. Optional: `pip install truststore` lets Python use
your operating system's certificate checks (recommended on Windows).

Usage:
    python agent_ready.py allbirds.com colourpop.com
    python agent_ready.py --out reports mystore.com
"""
import argparse
import json
import re
import ssl
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from html import unescape
from pathlib import Path

VERSION = "0.2.1"
USER_AGENT = f"Mozilla/5.0 (compatible; ArmansAgentReadyAudit/{VERSION}; +https://armans.ai)"
TIMEOUT = 20
POLITE_DELAY = 1.0          # seconds between requests to the same store
KNOWN_LATEST_UCP = "2026-08-25"   # newest UCP version observed at build time (Nov 2026)
CORE_CAPABILITIES = [
    "dev.ucp.shopping.catalog.search",
    "dev.ucp.shopping.catalog.lookup",
    "dev.ucp.shopping.cart",
    "dev.ucp.shopping.checkout",
]
# Bots that fetch pages live for AI search or for a user's request.
# Blocking these can hide a store from AI shopping answers.
AI_DISCOVERY_BOTS = ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot",
                     "Claude-SearchBot", "Claude-User"]
# Bots used mainly for model training. Blocking them is a legitimate business
# choice, so it is reported as information, not as a problem.
AI_TRAINING_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended",
                    "Applebot-Extended", "CCBot"]
POLICY_PATHS = {
    "refund": "/policies/refund-policy",
    "shipping": "/policies/shipping-policy",
    "privacy": "/policies/privacy-policy",
    "terms": "/policies/terms-of-service",
}


def make_ssl_context():
    """Certificate verification is always on. Prefer the operating system's own
    verifier (truststore), then the certifi bundle, then Python's default store.
    Some Windows machines hold an expired root that breaks Python's default store."""
    try:
        import truststore
        return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    except ImportError:
        pass
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()


SSL_CONTEXT = make_ssl_context()


class Fetcher:
    """Polite HTTP client: one request at a time, delay between calls, 429 backoff."""

    def __init__(self):
        self.last = 0.0
        self.log = []

    def request(self, url, method="GET", body=None, headers=None, retries=2):
        wait = POLITE_DELAY - (time.time() - self.last)
        if wait > 0:
            time.sleep(wait)
        hdrs = {"User-Agent": USER_AGENT, "Accept": "*/*"}
        if headers:
            hdrs.update(headers)
        data = body.encode("utf-8") if isinstance(body, str) else body
        req = urllib.request.Request(url, data=data, method=method, headers=hdrs)
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT, context=SSL_CONTEXT) as resp:
                text = resp.read().decode("utf-8", errors="replace")
                result = (resp.status, dict(resp.headers), text, resp.geturl())
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", errors="replace") if e.fp else ""
            result = (e.code, dict(e.headers or {}), text, url)
        except Exception as e:  # network error, timeout, TLS
            result = (0, {}, f"{type(e).__name__}: {e}", url)
        self.last = time.time()
        status = result[0]
        if status == 429 and retries > 0:
            try:
                ra = int(result[1].get("Retry-After", "5"))
            except ValueError:
                ra = 5
            time.sleep(min(max(ra, 2), 15))
            return self.request(url, method, body, headers, retries - 1)
        entry = {"method": method, "url": url, "status": status}
        if status == 0:
            entry["error"] = result[2][:200]
        self.log.append(entry)
        return result


# ---------------------------------------------------------------- helpers

def normalize_base(store):
    s = store.strip()
    if not re.match(r"^https?://", s):
        s = "https://" + s
    return s.rstrip("/")


def parse_json(text):
    """Parse a JSON body, or the first JSON 'data:' line of a server-sent event stream."""
    text = (text or "").strip()
    try:
        return json.loads(text)
    except (ValueError, TypeError):
        pass
    for line in text.splitlines():
        if line.startswith("data:"):
            try:
                return json.loads(line[5:].strip())
            except ValueError:
                continue
    return None


# ---------------------------------------------------------------- checks

def check_platform(f, base):
    status, _, html, final_url = f.request(base + "/")
    out = {"status": status, "final_url": final_url, "is_shopify": False,
           "myshopify_domain": None}
    if status == 200:
        markers = ("cdn.shopify.com", "Shopify.shop", "myshopify.com")
        out["is_shopify"] = any(m in html for m in markers)
        m = re.search(r"([a-z0-9][a-z0-9-]*\.myshopify\.com)", html)
        if m:
            out["myshopify_domain"] = m.group(1)
    return out, html if status == 200 else ""


def check_ucp(f, base):
    status, hdrs, text, final_url = f.request(base + "/.well-known/ucp",
                                              headers={"Accept": "application/json"})
    out = {"status": status, "present": False, "version": None, "mcp_endpoint": None,
           "capabilities": [], "payment_handlers": [], "missing_core": list(CORE_CAPABILITIES)}
    if status != 200:
        # Only 404/410 prove the manifest is absent. 403, 429, 5xx or a network
        # error mean we could not tell, so the audit must not claim it is missing.
        out["inconclusive"] = status not in (404, 410)
        return out
    doc = parse_json(text)
    if not isinstance(doc, dict) or "ucp" not in doc:
        # A "soft 404": the address answers 200 but with a web page (often a redirect to
        # the homepage), not the manifest. Agents get HTML and cannot use it.
        ctype = (hdrs.get("Content-Type") or hdrs.get("content-type") or "").lower()
        out["status"] = "not-a-manifest"
        out["served_html"] = "html" in ctype or (text or "").lstrip()[:1] == "<"
        out["final_url"] = final_url
        return out
    ucp = doc["ucp"]
    out["present"] = True
    out["version"] = ucp.get("version")
    for svc in (ucp.get("services") or {}).get("dev.ucp.shopping", []):
        if svc.get("transport") == "mcp" and svc.get("endpoint"):
            out["mcp_endpoint"] = svc["endpoint"]
            break
    out["capabilities"] = sorted((ucp.get("capabilities") or {}).keys())
    out["payment_handlers"] = sorted((ucp.get("payment_handlers") or {}).keys())
    out["missing_core"] = [c for c in CORE_CAPABILITIES if c not in out["capabilities"]]
    return out


def check_mcp(f, endpoint):
    out = {"live": False, "server": None, "tools": []}
    if not endpoint:
        return out
    hdrs = {"Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"}
    init = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {
        "protocolVersion": "2025-06-18", "capabilities": {},
        "clientInfo": {"name": "agent-ready-audit", "version": VERSION}}})
    status, rh, text, _ = f.request(endpoint, "POST", init, hdrs)
    doc = parse_json(text)
    if status != 200 or not isinstance(doc, dict) or "result" not in doc:
        out["status"] = status
        return out
    out["live"] = True
    out["server"] = (doc["result"].get("serverInfo") or {}).get("name")
    session = rh.get("Mcp-Session-Id") or rh.get("mcp-session-id")
    if session:
        hdrs["Mcp-Session-Id"] = session
    lst = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "tools/list", "params": {}})
    status, _, text, _ = f.request(endpoint, "POST", lst, hdrs)
    doc = parse_json(text)
    if isinstance(doc, dict) and "result" in doc:
        out["tools"] = [t.get("name") for t in doc["result"].get("tools", [])]
    return out


POLICY_LINK_WORDS = {
    "refund": ("refund", "return"),
    "shipping": ("shipping", "delivery"),
    "privacy": ("privacy",),
    "terms": ("terms",),
}


def find_policy_link(home_html, key):
    """Headless stores often keep policies at their own URLs. Look for a homepage link."""
    for href in re.findall(r'href="([^"#]+)"', home_html or ""):
        low = href.lower()
        if any(w in low for w in POLICY_LINK_WORDS[key]) and "/products/" not in low:
            return href
    return None


def check_policies(f, base, home_html=""):
    out = {"alt_urls": {}, "empty": {}}
    for key, path in POLICY_PATHS.items():
        status, _, text, _ = f.request(base + path)
        if status in (404, 410):
            out[key] = False
            alt = find_policy_link(home_html, key)
            if alt:
                out["alt_urls"][key] = alt
            continue
        if status != 200:
            out[key] = None   # could not tell (rate limit, block, error)
            continue
        # Shopify renders policy text inside .shopify-policy__body. Require real text
        # there, so an empty policy shell is not counted as a published policy.
        m = re.search(r'class="shopify-policy__body"[^>]*>(.*?)</div>\s*</div>',
                      text, re.S)
        if m:
            body = re.sub(r"<[^>]+>", " ", m.group(1))
            out[key] = len(re.sub(r"\s+", " ", body).strip()) > 200
            if not out[key]:
                out["empty"][key] = True   # page exists but the policy text is blank
                alt = find_policy_link(home_html, key)
                if alt:
                    out["alt_urls"][key] = alt
        else:
            out[key] = True  # non-Shopify markup: page exists, content not judged
    return out


def parse_robots(text):
    """Return robots.txt groups as (list_of_user_agents, list_of_(field, value))."""
    groups, agents, rules = [], [], []
    for raw in (text or "").splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        field, value = (x.strip() for x in line.split(":", 1))
        field = field.lower()
        if field == "user-agent":
            if rules:
                groups.append((agents, rules))
                agents, rules = [], []
            agents.append(value.lower())
        elif field in ("allow", "disallow") and agents:
            rules.append((field, value))
    if agents:
        groups.append((agents, rules))
    return groups


def blocks_whole_site(groups, bot):
    b = bot.lower()
    specific = [r for a, r in groups if b in a]
    if specific:
        rules = [x for r in specific for x in r]
    else:
        rules = [x for a, r in groups if "*" in a for x in r]
    return (any(fl == "disallow" and v == "/" for fl, v in rules)
            and not any(fl == "allow" and v == "/" for fl, v in rules))


def check_robots(f, base):
    status, _, text, _ = f.request(base + "/robots.txt")
    out = {"status": status, "blocked_discovery": [], "blocked_training": []}
    if status != 200:
        return out
    groups = parse_robots(text)
    out["blocked_discovery"] = [b for b in AI_DISCOVERY_BOTS if blocks_whole_site(groups, b)]
    out["blocked_training"] = [b for b in AI_TRAINING_BOTS if blocks_whole_site(groups, b)]
    return out


def find_product_url(f, base, home_html):
    status, _, text, _ = f.request(base + "/sitemap.xml")
    if status == 200:
        m = re.search(r"<loc>\s*([^<]*sitemap_products[^<]*?)\s*</loc>", text)
        if m:
            s2, _, t2, _ = f.request(unescape(m.group(1)))
            if s2 == 200:
                for loc in re.findall(r"<loc>\s*([^<]+?)\s*</loc>", t2):
                    # Skip gift cards: they carry no GTIN or stock and give a misleading sample.
                    if "/products/" in loc and not re.search(r"gift[-_]?card", loc, re.I):
                        return unescape(loc)
    for href in re.findall(r'href="(/(?:[a-z]{2}(?:-[a-z]{2})?/)?products/[^"#?]+)"', home_html or ""):
        if not re.search(r"gift[-_]?card", href, re.I):
            return base + href
    return None


def extract_jsonld_products(page):
    found = []
    pattern = r'<script[^>]*type=["\']application/ld\+json["\'][^>]*>(.*?)</script>'
    for block in re.findall(pattern, page, re.S | re.I):
        try:
            data = json.loads(block.strip())
        except ValueError:
            continue
        stack = [data]
        while stack:
            node = stack.pop()
            if isinstance(node, list):
                stack.extend(node)
                continue
            if not isinstance(node, dict):
                continue
            t = node.get("@type")
            types = t if isinstance(t, list) else [t]
            if "Product" in types or "ProductGroup" in types:
                found.append(node)
            if "@graph" in node:
                stack.append(node["@graph"])
    return found


def check_product(f, base, home_html):
    out = {"product_url": None, "jsonld": False, "price": False, "availability": False,
           "brand": False, "image": False, "description": False, "gtin": False, "sku": False}
    url = find_product_url(f, base, home_html)
    if not url:
        return out
    out["product_url"] = url
    status, _, page, _ = f.request(url, retries=3)
    if status != 200:
        out["status"] = status
        out["inconclusive"] = True   # could not read the page; do not judge its data
        return out
    out.update(analyze_product_page(page))
    return out


def analyze_product_page(page):
    """Read schema.org Product / ProductGroup data, including variant offers."""
    out = {"jsonld": False, "price": False, "availability": False, "brand": False,
           "image": False, "description": False, "gtin": False, "sku": False}
    products = extract_jsonld_products(page)
    if not products:
        return out
    out["jsonld"] = True
    gtin_keys = ("gtin", "gtin8", "gtin12", "gtin13", "gtin14")
    for p in products:
        sources = [p] + [v for v in (p.get("hasVariant") or []) if isinstance(v, dict)]
        out["brand"] |= bool(p.get("brand"))
        out["image"] |= bool(p.get("image"))
        out["description"] |= bool(str(p.get("description") or "").strip())
        for src in sources:
            offers = src.get("offers")
            offers = offers if isinstance(offers, list) else [offers]
            for o in [x for x in offers if isinstance(x, dict)] + [src]:
                out["price"] |= bool(o.get("price") or o.get("lowPrice"))
                out["availability"] |= bool(o.get("availability"))
                out["gtin"] |= any(o.get(k) for k in gtin_keys)
                out["sku"] |= bool(o.get("sku") or o.get("mpn"))
    return out


# ---------------------------------------------------------------- scoring

def score_and_findings(r):
    score, findings = 0.0, []

    def add(sev, area, finding, fix):
        findings.append({"severity": sev, "area": area, "finding": finding, "fix": fix})

    ucp, mcp, pol, rob, prod = r["ucp"], r["mcp"], r["policies"], r["robots"], r["product"]

    # 1. Commerce manifest (UCP) - 35 points
    if ucp["present"]:
        score += 30
        if ucp["version"] == KNOWN_LATEST_UCP:
            score += 5
        else:
            add("MEDIUM", "UCP manifest",
                f"Manifest advertises UCP version {ucp['version']}; newest observed is {KNOWN_LATEST_UCP}.",
                "Newer agents may expect newer capabilities. Check your platform or app for the current UCP release.")
    elif r.get("backend_ucp_present"):
        score += 15   # the capability exists on the platform; only the public route is missing
        how = (f"answers /.well-known/ucp with a web page instead of the manifest "
               f"(it ends up at {ucp.get('final_url')})" if ucp.get("served_html")
               else "does not serve /.well-known/ucp")
        add("HIGH", "UCP manifest",
            f"Your Shopify backend ({r['platform']['myshopify_domain']}) publishes a UCP manifest, "
            f"but your public domain {how}. Agents that discover stores by "
            "domain cannot find your checkout. (Shopify's central Catalog may still list your products.)",
            "Typical for headless or custom front ends: proxy or redirect /.well-known/ucp from your "
            "Shopify backend to your public domain.")
    else:
        detail = (f" The address returns a web page instead (it ends up at {ucp.get('final_url')})."
                  if ucp.get("served_html") else "")
        add("HIGH", "UCP manifest",
            "No commerce manifest at /.well-known/ucp. AI shopping agents cannot discover how to "
            "search, cart or check out with this store." + detail,
            "On Shopify this is normally automatic; check headless routing and sales-channel settings. "
            "On other platforms, review Google UCP and OpenAI ACP onboarding.")

    # 2. Agent endpoint (MCP) - 15 points
    if mcp["live"]:
        score += 10
        if {"search_catalog", "get_product"} <= set(mcp["tools"]):
            score += 5
        else:
            add("MEDIUM", "Agent endpoint", "MCP endpoint is live but catalog search/product tools were not listed.",
                "Confirm Shopify Catalog is enabled for this store.")
    elif ucp["mcp_endpoint"]:
        add("HIGH", "Agent endpoint", f"Manifest names an MCP endpoint that did not respond: {ucp['mcp_endpoint']}",
            "Check the endpoint is reachable from the public internet.")

    # 3. Core capabilities - 10 points
    present = len(CORE_CAPABILITIES) - len(ucp["missing_core"])
    score += 2.5 * present
    if ucp["present"] and ucp["missing_core"]:
        add("MEDIUM", "Capabilities", "Missing core agent capabilities: " + ", ".join(ucp["missing_core"]),
            "Without these, an agent can find products but cannot complete a purchase end to end.")

    # 4. Policies agents compare on - 15 points
    weights = {"refund": 5, "shipping": 5, "privacy": 2.5, "terms": 2.5}
    unchecked = 0
    for key, w in weights.items():
        if pol.get(key) is None:
            unchecked += w
            add("INFO", "Policies", f"Could not read {POLICY_PATHS[key]}, so it was not scored.",
                "Re-run the audit later.")
        elif pol.get(key):
            score += w
        elif pol.get("alt_urls", {}).get(key):
            score += w / 2   # policy exists, but not where agents and crawlers look first
            add("LOW", "Policies",
                f"No {key} policy at the standard path {POLICY_PATHS[key]}; the homepage links to "
                f"{pol['alt_urls'][key]} instead.",
                f"Redirect {POLICY_PATHS[key]} to that page so agents and crawlers find it at the expected address.")
        elif pol.get("empty", {}).get(key):
            sev = "MEDIUM" if key in ("refund", "shipping") else "LOW"
            add(sev, "Policies",
                f"The {key} policy page at {POLICY_PATHS[key]} exists but is empty. Agents that read "
                f"store policies get no {key} terms.",
                f"In Shopify admin, open Settings > Policies and fill in the {key} policy.")
        else:
            sev = "MEDIUM" if key in ("refund", "shipping") else "LOW"
            add(sev, "Policies",
                f"No {key} policy found at {POLICY_PATHS[key]} or linked from the homepage.",
                f"Publish a clear {key} policy and link it. AI agents compare stores on delivery and "
                "returns before recommending one.")

    # 5. AI discovery access - 10 points
    blocked = rob["blocked_discovery"]
    score += max(0, 10 - 2 * len(blocked))
    if blocked:
        add("HIGH", "robots.txt", "Blocks AI search/assistant bots from the whole site: " + ", ".join(blocked),
            "These bots fetch pages to answer shoppers in real time. Unblock them unless this is deliberate.")
    if rob["blocked_training"]:
        add("INFO", "robots.txt", "Opts out of AI model training: " + ", ".join(rob["blocked_training"]),
            "A legitimate business choice. It does not block AI shopping answers on its own.")

    # 6. Product structured data - 15 points
    max_points = 100 - unchecked   # score only what was actually checked
    if prod.get("inconclusive"):
        max_points -= 15
        add("INFO", "Product data",
            f"Product page could not be read (HTTP {prod.get('status')}), so product data was not scored.",
            "Re-run the audit later. Stores often rate-limit repeated requests.")
    elif not prod["product_url"]:
        # The tool could not find a product URL. That is a limit of this audit, not a store failure.
        max_points -= 15
        add("INFO", "Product data", "No product page was found to sample, so product data was not scored.",
            "Re-run with a product URL in a later version, or check that /sitemap.xml lists products.")
    elif not prod["jsonld"]:
        add("HIGH", "Product data", "Product page has no schema.org Product data (JSON-LD).",
            "Add Product structured data so agents read name, price and stock reliably.")
    else:
        score += 4
        checks = [("price", 2.5, "HIGH", "price"), ("availability", 2.5, "HIGH", "stock availability"),
                  ("gtin", 2.5, "MEDIUM", "GTIN/barcode"), ("brand", 1.5, "LOW", "brand"),
                  ("description", 1, "LOW", "description"), ("image", 1, "LOW", "image")]
        for key, w, sev, label in checks:
            if prod[key]:
                score += w
            else:
                fix = ("Add GTIN (barcode) to variants. Agents use it to match the same product across stores."
                       if key == "gtin" else f"Include {label} in the Product structured data.")
                add(sev, "Product data", f"Product structured data is missing {label}.", fix)

    order = {"HIGH": 0, "MEDIUM": 1, "LOW": 2, "INFO": 3}
    findings.sort(key=lambda x: order[x["severity"]])
    r["coverage"] = round(max_points)   # how many of the 100 check points were actually tested
    score = round(score * 100 / max_points)
    grade = "A" if score >= 90 else "B" if score >= 75 else "C" if score >= 60 else "D" if score >= 40 else "F"
    return score, grade, findings


# ---------------------------------------------------------------- audit + report

def audit(store):
    f = Fetcher()
    base = normalize_base(store)
    r = {"store": base, "tool": f"agent-ready-audit {VERSION}",
         "audited_at": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")}
    r["platform"], home_html = check_platform(f, base)
    if r["platform"]["status"] == 0:
        # Never grade a store we could not reach: a network failure is not a store failure.
        r["error"] = "Could not reach the store: " + f.log[-1].get("error", "unknown error")
        r["requests"] = f.log
        return r
    r["ucp"] = check_ucp(f, base)
    if r["ucp"].get("inconclusive"):
        # The manifest is the core of the audit. If we cannot read it, do not grade.
        r["error"] = (f"Could not read /.well-known/ucp (HTTP {r['ucp']['status']}). "
                      "The store may be rate-limiting or blocking automated requests. Re-run later.")
        r["requests"] = f.log
        return r
    # The manifest's own MCP endpoint proves the platform even when the homepage
    # hides Shopify markers (headless front ends, bot-blocked homepages).
    m = re.search(r"([a-z0-9][a-z0-9-]*\.myshopify\.com)", r["ucp"].get("mcp_endpoint") or "")
    if m:
        r["platform"]["is_shopify"] = True
        r["platform"]["myshopify_domain"] = r["platform"]["myshopify_domain"] or m.group(1)
    r["backend_ucp_present"] = False
    shop = r["platform"]["myshopify_domain"]
    if not r["ucp"]["present"] and shop and shop not in base:
        r["backend_ucp_present"] = check_ucp(f, "https://" + shop)["present"]
    # Product pages are the most rate-limited, so read them early, before the
    # store has seen many requests from us.
    r["product"] = check_product(f, base, home_html)
    r["mcp"] = check_mcp(f, r["ucp"]["mcp_endpoint"])
    r["policies"] = check_policies(f, base, home_html)
    r["robots"] = check_robots(f, base)
    r["score"], r["grade"], r["findings"] = score_and_findings(r)
    r["requests"] = f.log
    return r


def yes(v):
    return "Yes" if v else "No"


def pol_label(p, key):
    if p.get(key) is None:
        return "Not checked"
    if p.get(key):
        return "Yes"
    return "Elsewhere" if p.get("alt_urls", {}).get(key) else "No"


def render_markdown(r):
    u, m, p, pr, rb = r["ucp"], r["mcp"], r["policies"], r["product"], r["robots"]
    high = sum(1 for x in r["findings"] if x["severity"] == "HIGH")
    L = [f"# AI Agent-Readiness Audit: {r['store']}", "",
         f"**Score: {r['score']}/100 (Grade {r['grade']})** - {high} high-priority issue(s)"
         + (f" - based on {r['coverage']}% of checks; see INFO items for what could not be tested"
            if r.get("coverage", 100) < 100 else ""), "",
         f"Audited {r['audited_at']} with {r['tool']}. Public endpoints only.", "",
         "## Can AI shopping agents buy from this store?", "",
         "| Check | Result |", "|---|---|",
         f"| Shopify store detected | {yes(r['platform']['is_shopify'])} |",
         f"| Commerce manifest (/.well-known/ucp) | {yes(u['present'])}"
         + (f" - version {u['version']}" if u["present"] else "") + " |",
         f"| Agent endpoint (MCP) live | {yes(m['live'])}"
         + (f" - {len(m['tools'])} tools" if m["live"] else "") + " |",
         f"| Core capabilities (search, lookup, cart, checkout) | {4 - len(u['missing_core'])}/4 |",
         f"| Payment options exposed to agents | {', '.join(u['payment_handlers']) or 'None'} |",
         f"| Refund / shipping policy | {pol_label(p, 'refund')} / {pol_label(p, 'shipping')} |",
         f"| AI search bots blocked | {', '.join(rb['blocked_discovery']) or 'None'} |",
         (f"| Product structured data (JSON-LD) | Not checked (HTTP {pr.get('status')}) |"
          if pr.get("inconclusive") else
          f"| Product structured data (JSON-LD) | {yes(pr['jsonld'])} |"),
         ("| Price / stock / GTIN in product data | Not checked |"
          if pr.get("inconclusive") else
          f"| Price / stock / GTIN in product data | {yes(pr['price'])} / {yes(pr['availability'])} / {yes(pr['gtin'])} |"),
         "", "## Findings and fixes", ""]
    if not r["findings"]:
        L.append("No issues found in the checks performed.")
    for i, x in enumerate(r["findings"], 1):
        L += [f"**{i}. [{x['severity']}] {x['area']}:** {x['finding']}", "",
              f"   Fix: {x['fix']}", ""]
    if m["tools"]:
        L += ["## What an AI agent can do here", "",
              "Tools exposed at the store's agent endpoint: " + ", ".join(f"`{t}`" for t in m["tools"]), ""]
    L += ["## Method and limits", "",
          "- Reads only public pages and the public agent manifest. No login, no admin access, no purchases.",
          "- Live catalog queries need a registered UCP agent profile and are not part of this public audit.",
          "- One product page is sampled. Catalog-wide data quality needs a full audit.",
          "- A high score means agents can technically transact. It does not measure how often agents "
          "recommend the store.", "",
          "---", "Built by Rehman Nadeem, Armans.AI - https://armans.ai - open source, MIT licence."]
    return "\n".join(L) + "\n"


def main():
    ap = argparse.ArgumentParser(description="Audit online stores for AI shopping-agent readiness.")
    ap.add_argument("stores", nargs="+", help="store domains, e.g. allbirds.com")
    ap.add_argument("--out", default="reports", help="output folder (default: reports)")
    args = ap.parse_args()
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    for store in args.stores:
        print(f"Auditing {store} ...", flush=True)
        r = audit(store)
        if r.get("error"):
            print(f"  AUDIT INCOMPLETE - not graded. {r['error']}", flush=True)
            continue
        host = re.sub(r"^https?://", "", r["store"]).replace("/", "_")
        (out_dir / f"{host}.md").write_text(render_markdown(r), encoding="utf-8")
        (out_dir / f"{host}.json").write_text(json.dumps(r, indent=2), encoding="utf-8")
        high = sum(1 for x in r["findings"] if x["severity"] == "HIGH")
        print(f"  score {r['score']}/100 grade {r['grade']} | coverage {r['coverage']}% | high issues: {high} | "
              f"requests: {len(r['requests'])} | report: {out_dir / (host + '.md')}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
