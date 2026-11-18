"""Bounded batch execution and portable CSV/HTML reports. No network in exporters."""
import csv
import io
import os
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from html import escape
from pathlib import Path
from urllib.parse import urlsplit

from agent_ready_http import HostPacer, normalize_store

MAX_DOMAINS = 50
FIELDS = ["store", "audited_at", "tool", "status", "score", "grade", "coverage_pct",
          "high_issues", "manifest", "mcp", "mcp_tools", "robots", "product_data",
          "refund_policy", "shipping_policy", "privacy_policy", "terms_policy",
          "requests", "not_checked", "findings"]


def validate_domains(stores):
    result, seen = [], set()
    for store in stores:
        normalized = normalize_store(store)
        host = urlsplit(normalized).hostname
        if host not in seen:
            seen.add(host)
            result.append(normalized)
    if not result:
        raise ValueError("The batch contains no domains")
    if len(result) > MAX_DOMAINS:
        raise ValueError(f"A batch supports at most {MAX_DOMAINS} unique domains; received {len(result)}")
    return result


def load_domains(path):
    lines = Path(path).read_text(encoding="utf-8-sig").splitlines()
    stores = []
    for number, line in enumerate(lines, 1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        try:
            stores.append(normalize_store(line))
        except ValueError as exc:
            raise ValueError(f"Line {number}: {exc}") from None
    return validate_domains(stores)


def run_batch(stores, audit_fn, concurrency=3):
    if isinstance(concurrency, bool) or not isinstance(concurrency, int) or not 1 <= concurrency <= 5:
        raise ValueError("Concurrency must be between 1 and 5")
    domains = validate_domains(stores)
    pacer = HostPacer(delay=1.0)

    def run(store):
        try:
            return audit_fn(store, pacer=pacer)
        except Exception as exc:
            # One unexpected parser/runtime error must not lose the other rows.
            # Do not copy arbitrary exception text (which may contain response data).
            return {"store": store, "audited_at": datetime.now(timezone.utc).isoformat(),
                    "error": f"Not checked: audit stopped ({type(exc).__name__}). Re-run this domain.",
                    "requests": []}

    with ThreadPoolExecutor(max_workers=concurrency, thread_name_prefix="audit") as executor:
        return list(executor.map(run, domains))  # Preserve input order, regardless of finish order.


def summary_row(result):
    graded = result.get("score") is not None and not result.get("error")
    row = {key: "" for key in FIELDS}
    row.update(store=result["store"], audited_at=result.get("audited_at", ""),
               tool=result.get("tool", ""), status="Graded" if graded else "Not checked",
               requests=sum("skipped" not in r for r in result.get("requests", [])))
    if not graded:
        row.update({key: "Not checked" for key in
                    ("manifest", "mcp", "mcp_tools", "robots", "product_data", "refund_policy",
                     "shipping_policy", "privacy_policy", "terms_policy")})
        row["not_checked"] = result.get("error", "Audit did not produce a grade")
        return row
    findings = result.get("findings", [])
    u, m, p, rb, product = (result[k] for k in ("ucp", "mcp", "policies", "robots", "product"))
    row.update(score=result["score"], grade=result["grade"], coverage_pct=result["coverage"],
               high_issues=sum(f["severity"] == "HIGH" for f in findings),
               manifest="Present" if u["present"] else "Missing/invalid",
               mcp="Not checked" if m.get("inconclusive") else ("Live" if m["live"] else "Not available"),
               mcp_tools="Not checked" if m.get("inconclusive") or m.get("tools_inconclusive")
               else (", ".join(m["tools"]) or "None"),
               robots="Not checked" if rb["status"] not in (200, 404, 410)
               else (", ".join(rb["blocked_discovery"]) or "No site-wide discovery block found"),
               product_data="Not checked" if product.get("inconclusive") or not product.get("product_url")
               else ("Present" if product["jsonld"] else "Missing"))
    for key in ("refund", "shipping", "privacy", "terms"):
        row[key + "_policy"] = ("Not checked" if p.get(key) is None else "Present" if p[key]
                                else "Elsewhere" if p.get("alt_urls", {}).get(key) else "Missing/empty")
    row["not_checked"] = " | ".join(f["finding"] for f in findings if f["severity"] == "INFO"
                                      and f["area"] in ("Agent endpoint", "Policies", "Product data", "robots.txt")
                                      and ("not scored" in f["finding"] or "not checked" in f["finding"]))
    row["findings"] = " | ".join(f"[{f['severity']}] {f['area']}: {f['finding']} Fix: {f['fix']}"
                                  for f in findings)
    return row


def csv_cell(value):
    # A spreadsheet must treat remote text as text, never as a formula.
    if isinstance(value, str) and value.lstrip().startswith(("=", "+", "-", "@")):
        return "'" + value
    return value


def render_csv(results):
    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=FIELDS)
    writer.writeheader()
    for result in results:
        writer.writerow({key: csv_cell(value) for key, value in summary_row(result).items()})
    return out.getvalue()


def render_html(results):
    rows = [summary_row(r) for r in results]
    graded = sum(row["status"] == "Graded" for row in rows)
    timestamp = datetime.now(timezone.utc).strftime("%d %b %Y, %H:%M UTC")
    esc = lambda value: escape(str(value), quote=True)
    table, sections = [], []
    for index, (result, row) in enumerate(zip(results, rows), 1):
        is_graded = row["status"] == "Graded"
        score = f"{row['score']}/100 · {row['grade']}" if is_graded else "—"
        coverage = f"{row['coverage_pct']}%" if is_graded else "—"
        status = "Partial coverage" if is_graded and row["coverage_pct"] < 100 else row["status"]
        table.append(f'<tr><th scope="row"><a href="#store-{index}">{esc(row["store"])}</a></th>'
                     f'<td><span class="badge {"graded" if is_graded else "neutral"}">{esc(status)}</span></td>'
                     f'<td>{esc(score)}</td><td>{esc(coverage)}</td>'
                     f'<td>{row["high_issues"] if is_graded else "—"}</td></tr>')
        facts = [("Manifest", "manifest"), ("MCP endpoint", "mcp"), ("MCP tools", "mcp_tools"),
                 ("AI discovery access", "robots"), ("Product structured data", "product_data"),
                 ("Refund policy", "refund_policy"), ("Shipping policy", "shipping_policy"),
                 ("Privacy policy", "privacy_policy"), ("Terms policy", "terms_policy")]
        checks = "".join(f'<div><dt>{label}</dt><dd>{esc(row[key])}</dd></div>' for label, key in facts)
        findings = "".join(f'<li><strong>{esc(f["severity"])} · {esc(f["area"])}</strong>'
                           f'<p>{esc(f["finding"])}</p><p class="fix">Fix: {esc(f["fix"])}</p></li>'
                           for f in result.get("findings", []))
        if not findings:
            findings = '<li>No issues found in the checks performed.</li>' if is_graded else '<li>Audit incomplete; no grade assigned.</li>'
        reason = f'<p class="notice"><strong>Not checked:</strong> {esc(row["not_checked"])}</p>' if row["not_checked"] else ""
        evidence = "".join(f'<li><code>{esc(req.get("method", ""))} {esc(req.get("url", ""))}</code>'
                           f' · {esc(req.get("status", ""))}'
                           f'{" · skipped (cooldown)" if "skipped" in req else ""}</li>'
                           for req in result.get("requests", []))
        sections.append(f'<section id="store-{index}" class="store"><h2>{esc(row["store"])}</h2>'
                        f'<p class="meta">{esc(score)} · Coverage {esc(coverage)} · {esc(row["audited_at"])}'
                        f' · {esc(row["tool"])}</p>{reason}<dl>{checks}</dl>'
                        f'<h3>Findings and fixes</h3><ol class="findings">{findings}</ol>'
                        f'<details><summary>Request evidence ({row["requests"]} attempts)</summary>'
                        f'<ul class="evidence">{evidence}</ul></details></section>')
    return '''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>Agent-Ready · Batch audit</title><style>
:root{color-scheme:light;--ink:#142b3b;--muted:#516270;--line:#d9e2e8;--teal:#006d69}
*{box-sizing:border-box}body{margin:0;background:#f2f5f7;color:var(--ink);font:16px/1.55 system-ui,sans-serif}
main{max-width:1120px;margin:auto;padding:48px 24px}header{border-top:6px solid var(--teal);padding:28px 0}
.eyebrow{letter-spacing:.15em;text-transform:uppercase;font-size:12px;font-weight:750;color:var(--teal)}
h1{font-size:clamp(30px,5vw,46px);line-height:1.12;margin:12px 0}h2{font-size:23px;overflow-wrap:anywhere}
h3{font-size:17px}.intro{max-width:780px}.meta{color:var(--muted);font-size:14px}
.stats{display:flex;gap:16px;flex-wrap:wrap;margin:24px 0}.stat{background:white;border:1px solid var(--line);padding:18px 24px;flex:1;min-width:160px}
.stat strong{display:block;font-size:32px}.notice{padding:16px 20px;background:#edf2f6;border-left:4px solid #708798;overflow-wrap:anywhere}
.table-wrap{overflow-x:auto;background:white;border:1px solid var(--line)}table{border-collapse:collapse;width:100%;font-size:14px}
th,td{text-align:left;padding:15px;border-bottom:1px solid var(--line)}thead{background:#e7eef2}tbody th{font-weight:550;overflow-wrap:anywhere;min-width:220px}
a{color:var(--teal)}.badge{padding:4px 9px;border-radius:5px;font-size:12px;white-space:nowrap}.graded{background:#e1f1ed;color:#155647}.neutral{background:#e8edf1;color:#445564}
.store{background:white;border:1px solid var(--line);padding:28px;margin-top:24px;scroll-margin:16px}
dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}dl div{border-top:1px solid var(--line);padding-top:12px}dt{font-size:12px;color:var(--muted)}dd{margin:4px 0;overflow-wrap:anywhere;font-size:14px}
.findings{padding-left:22px}.findings li{padding:10px 0}.findings p{margin:5px 0;overflow-wrap:anywhere}.fix{color:var(--muted)}
details{border-top:1px solid var(--line);padding-top:16px}summary{cursor:pointer;font-weight:600}.evidence{font-size:12px;overflow-wrap:anywhere;padding-left:20px}footer{padding:24px 0;color:var(--muted);font-size:13px}
@media(max-width:700px){main{padding:24px 14px}.store{padding:18px}dl{grid-template-columns:1fr 1fr}}
@media print{body{background:white}main{padding:0}.store{break-inside:avoid}.table-wrap{overflow:visible}a{color:inherit}details{display:none}}
</style></head><body><main><header><div class="eyebrow">Armans.AI / Agent-Ready</div>
<h1>Public commerce readiness</h1><p class="intro">Batch audit of public store pages and advertised agent interfaces.
Scores describe completed checks. Coverage shows how much could be checked.</p>''' + f'''
<p class="meta">Generated {esc(timestamp)} · Self-contained report · No external assets</p></header>
<div class="stats"><div class="stat"><strong>{len(rows)}</strong>Domains</div>
<div class="stat"><strong>{graded}</strong>Graded</div><div class="stat"><strong>{len(rows)-graded}</strong>Not checked / ungraded</div></div>
<p class="notice">“Not checked” is excluded from scoring. A blank score is not a failure.
Compare coverage alongside scores; a high score with partial coverage is limited evidence.</p>
<div class="table-wrap"><table><caption class="meta">Batch summary — select a domain for findings</caption>
<thead><tr><th scope="col">Domain</th><th scope="col">Status</th><th scope="col">Score / grade</th>
<th scope="col">Coverage</th><th scope="col">High issues</th></tr></thead><tbody>{''.join(table)}</tbody></table></div>
{''.join(sections)}
<footer><strong>Method and limits.</strong> Public HTTP(S) endpoints only. No login, admin access, cart changes,
checkout actions or purchases. MCP calls are limited to initialize and tools/list. One product page is sampled.
Live catalog, cart, checkout and payment operations were not tested. A score does not prove a purchase can succeed,
or measure recommendations or business results. Review domain names before sharing this report.<br>
Built by Rehman Nadeem · Armans.AI · Open source, MIT licence.</footer></main></body></html>
'''


def write_reports(results, out_dir):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    payloads = ((out_dir / "batch-audit.csv", render_csv(results)),
                (out_dir / "batch-audit.html", render_html(results)))
    temporary = []
    try:
        for target, content in payloads:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="",
                                             dir=out_dir, delete=False) as stream:
                temporary.append((Path(stream.name), target))
                stream.write(content)
        for source, target in temporary:
            os.replace(source, target)
    finally:
        for source, _ in temporary:
            source.unlink(missing_ok=True)
    return tuple(target for target, _ in payloads)
