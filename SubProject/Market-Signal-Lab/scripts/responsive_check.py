#!/usr/bin/env python3
"""Responsive regression checks for the embedded Market Signal Lab workspace.

The managed Chromium available in CI blocks navigation to localhost. To keep
this test deterministic and faithful to the shipped UI, the checker starts an
allowed about:blank page, injects the real template and real embedded CSS, then
executes the real responsive workspace runtime through Chrome DevTools
Protocol. It does not seed market data and it never touches user storage.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

import websocket

VIEWPORTS = [
    (1920, 1080),
    (1600, 900),
    (1440, 900),
    (1366, 768),
    (1280, 720),
    (1024, 768),
    (768, 1024),
]
LANGUAGES = ("en", "id")
CSS_FILES = (
    "legacy.css",
    "tokens.css",
    "workspace.css",
    "components.css",
    "tables.css",
    "responsive.css",
    "consensus.css",
    "telemetry.css",
)


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


class CDP:
    def __init__(self, websocket_url: str) -> None:
        self.socket = websocket.create_connection(
            websocket_url,
            timeout=20,
            origin="http://127.0.0.1",
            http_proxy_host=None,
            http_proxy_port=None,
        )
        self.next_id = 1

    def close(self) -> None:
        self.socket.close()

    def call(self, method: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        call_id = self.next_id
        self.next_id += 1
        message: dict[str, Any] = {"id": call_id, "method": method}
        if params is not None:
            message["params"] = params
        self.socket.send(json.dumps(message))
        deadline = time.time() + 25
        while time.time() < deadline:
            response = json.loads(self.socket.recv())
            if response.get("id") != call_id:
                continue
            if "error" in response:
                raise RuntimeError(f"CDP {method} failed: {response['error']}")
            return response.get("result", {})
        raise TimeoutError(f"CDP timeout: {method}")

    def evaluate(self, expression: str, *, await_promise: bool = False) -> Any:
        result = self.call(
            "Runtime.evaluate",
            {
                "expression": expression,
                "returnByValue": True,
                "awaitPromise": await_promise,
            },
        ).get("result", {})
        if result.get("subtype") == "error":
            raise RuntimeError(result.get("description", "JavaScript evaluation failed"))
        return result.get("value")


def fetch_pages(port: int) -> list[dict[str, Any]]:
    with urllib.request.urlopen(f"http://127.0.0.1:{port}/json", timeout=1) as response:
        return json.loads(response.read().decode("utf-8"))


def wait_for_blank_page(port: int, process: subprocess.Popen[bytes]) -> dict[str, Any]:
    deadline = time.time() + 15
    last_error: Exception | None = None
    while time.time() < deadline:
        if process.poll() is not None:
            stderr = process.stderr.read().decode("utf-8", errors="replace") if process.stderr else ""
            raise RuntimeError(f"Chromium exited early: {stderr[-2000:]}")
        try:
            pages = fetch_pages(port)
            for page in pages:
                if page.get("type") == "page" and page.get("webSocketDebuggerUrl"):
                    return page
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = exc
        time.sleep(0.1)
    raise TimeoutError(f"DevTools page unavailable: {last_error}")


def strip_external_assets(template: str) -> str:
    template = re.sub(r'<link\b[^>]*href="/assets/[^>]*>\s*', "", template, flags=re.I)
    template = re.sub(r'<script\b[^>]*src="/assets/[^>]*></script>\s*', "", template, flags=re.I)
    return template


def build_harness_html(root: Path, language: str) -> str:
    template = (root / "internal/web/templates/index.html").read_text(encoding="utf-8")
    template = strip_external_assets(template)
    template = re.sub(r'<html\b[^>]*lang="[^"]*"', f'<html lang="{language}"', template, count=1)
    css_root = root / "internal/web/assets/css"
    css = "\n".join((css_root / name).read_text(encoding="utf-8") for name in CSS_FILES)
    style = f"<style id=\"responsiveHarnessStyles\">\n{css}\n</style>"
    return template.replace("</head>", style + "</head>", 1)


def locale_bootstrap(translations: dict[str, str], language: str) -> str:
    translations_json = json.dumps(translations, ensure_ascii=False)
    language_json = json.dumps(language)
    return f"""
(() => {{
  const messages={translations_json};
  window.currentLocale={language_json};
  window.t=(key)=>Object.prototype.hasOwnProperty.call(messages,key)?messages[key]:key;
  window.formatTemporalDate=(value)=>{{
    const date=new Date(value);
    return Number.isNaN(date.getTime())?'—':new Intl.DateTimeFormat({language_json}==='id'?'id-ID':'en-US',{{dateStyle:'medium',timeStyle:'short'}}).format(date);
  }};
  document.documentElement.lang={language_json};
  const languageSelect=document.getElementById('languageSelect');
  if(languageSelect)languageSelect.value={language_json};
  const leaf=(node)=>!node.querySelector('[data-i18n]');
  document.querySelectorAll('[data-i18n]').forEach(node=>{{
    const key=node.dataset.i18n;
    if(leaf(node)&&messages[key]!==undefined)node.textContent=messages[key];
  }});
  document.querySelectorAll('[data-i18n-title]').forEach(node=>{{
    const key=node.dataset.i18nTitle;if(messages[key]!==undefined)node.title=messages[key];
  }});
  document.querySelectorAll('[data-i18n-placeholder]').forEach(node=>{{
    const key=node.dataset.i18nPlaceholder;if(messages[key]!==undefined)node.placeholder=messages[key];
  }});
  document.querySelectorAll('[data-i18n-aria-label]').forEach(node=>{{
    const key=node.dataset.i18nAriaLabel;if(messages[key]!==undefined)node.setAttribute('aria-label',messages[key]);
  }});
}})();
"""


def representative_content_script() -> str:
    """Populate existing UI surfaces only for layout stress, not analytics."""
    return r"""
(() => {
  const live=document.getElementById('liveMarketMappingPanel');
  if(live){
    live.hidden=false;
    const status=document.getElementById('liveRunStatus'); if(status)status.textContent='Running';
    const tracker=document.getElementById('liveStageTracker'); if(tracker)tracker.innerHTML=['Preparing Scan Plan','Validating Sources','Loading Catalog Structure','Mapping Market Surfaces','Normalizing Products','Deduplicating','Taxonomy Segmentation','Signal Quality Audit','Ranking / Consensus','Persisting History','Finalizing Market Map'].map((name,i)=>`<div class="telemetry-stage ${i<3?'done':i===3?'running':'waiting'}"><b>${name}</b></div>`).join('');
    const fill=document.getElementById('liveProgressBar'); if(fill)fill.style.width='61%';
    const pct=document.getElementById('liveProgressPercent'); if(pct)pct.textContent='61%';
    const values={liveProductsDiscovered:'825',liveWorkUnits:'57 / 94',liveElapsed:'00:15:42',liveEtaRemaining:'00:10:18',liveExpectedFinish:'08:32',liveEtaConfidence:'High'}; Object.entries(values).forEach(([id,v])=>{const n=document.getElementById(id);if(n)n.textContent=v;});
    const log=document.getElementById('liveRecentLog'); if(log)log.innerHTML=['Token verified','GraphicRiver / Popular','VideoHive / New','429 received — retrying in 8 sec','Retry successful'].map((text,i)=>`<div class="live-log-row"><span class="live-log-time">08:16:${22-i}</span><span class="telemetry-${i===3?'warning':'info'}">${i===3?'△':'✓'}</span><span>${text}</span></div>`).join('');
  }
  const history=document.getElementById('marketMapHistoryRows');
  if(history){
    history.innerHTML='';
    for(let i=0;i<5;i++){
      const row=document.createElement('tr');
      row.innerHTML=`<td>16/08/2026 0${i}:15</td><td>Standard</td><td>Completed</td><td>${825+i*12}</td><td>99.6%</td><td>80.0%</td><td>${i===0?'Current composition only':'Previous compatible run'}</td>`;
      history.appendChild(row);
    }
  }
  const catalogs=document.getElementById('autopilotCatalogRows');
  if(catalogs){
    catalogs.innerHTML='';
    const names=['Presentation Templates','Graphic Templates and Mockups','Video Templates','Website Themes'];
    names.forEach((name,index)=>{
      const row=document.createElement('tr');
      row.innerHTML=`<td><b>${name}</b><div class="muted">Observed catalog segment</div></td><td>${72-index*4}.4%</td><td>${78-index*3}.1%</td><td>Current Composition Index</td><td>91.8%</td><td><div class="actions"><button class="ghost">Why this score?</button><button class="secondary">Investigate</button></div></td>`;
      catalogs.appendChild(row);
    });
  }
  const directions=document.getElementById('productDirectionCards');
  if(directions){
    directions.innerHTML='';
    ['Presentation Sponsorship Direction','Editorial Portfolio Direction','Packaging Mockup Direction'].forEach((name,index)=>{
      const card=document.createElement('article');
      card.className='compare-card';
      card.innerHTML=`<h4>${name}</h4><div class="metric-list"><div class="metric"><b>${81-index*5}%</b><span>Opportunity</span></div><div class="metric"><b>${78-index*3}%</b><span>Confidence</span></div></div><div class="actions"><button class="secondary">View observed products</button><button class="ghost">Investigate</button></div>`;
      directions.appendChild(card);
    });
  }

  const matrix=document.getElementById('consensusMatrix');
  if(matrix){
    matrix.innerHTML=`<div class="consensus-matrix-wrap"><table class="consensus-matrix-table"><thead><tr><th>Signal</th><th>Public</th><th>Subscriber</th><th>Official API</th><th>Consensus</th><th>Ambiguity</th><th>Selection</th></tr></thead><tbody>${['Packaging Mockup','Editorial Social Media','Brand Identity','Presentation Sponsorship'].map((name,i)=>`<tr><td><b>${name}</b><div class="muted">product_type</div></td><td>${74+i}%</td><td>${81-i}%</td><td>${69+i}%</td><td>${78-i}%</td><td>${22+i}%</td><td>${72+i}%</td></tr>`).join('')}</tbody></table></div>`;
  }
  const pairs=document.getElementById('consensusPairHistory');
  if(pairs){pairs.innerHTML='<div class="pair-row"><div><b>Current Cross-Surface Comparison</b><div class="muted">Public ↔ Subscriber · Top 30</div></div><button class="ghost">View Pair</button></div>';}
  const strong=document.getElementById('consensusStrongSignals');
  if(strong){strong.innerHTML='<div class="consensus-signal"><b>Packaging Mockup</b><div class="consensus-signal-meta"><span>82%</span><span>Stable Consensus</span><span>B</span></div></div>';}
})();
"""


def capture_screenshot(cdp: CDP, output: Path) -> None:
    data = cdp.call(
        "Page.captureScreenshot",
        {"format": "png", "fromSurface": True, "captureBeyondViewport": False},
    ).get("data")
    if not data:
        raise RuntimeError("Screenshot data missing")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(base64.b64decode(data))


def check_viewport(
    root: Path,
    chromium: str,
    width: int,
    height: int,
    language: str,
    screenshot_dir: Path | None,
) -> dict[str, Any]:
    devtools_port = free_port()
    profile = tempfile.mkdtemp(prefix="msl-responsive-")
    command = [
        chromium,
        "--headless=new",
        "--no-sandbox",
        "--disable-gpu",
        "--disable-dev-shm-usage",
        "--remote-allow-origins=*",
        f"--remote-debugging-port={devtools_port}",
        f"--user-data-dir={profile}",
        f"--window-size={width},{height}",
        "about:blank",
    ]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    cdp: CDP | None = None
    try:
        page = wait_for_blank_page(devtools_port, process)
        cdp = CDP(page["webSocketDebuggerUrl"])
        cdp.call("Page.enable")
        cdp.call("Runtime.enable")
        cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": width,
                "height": height,
                "screenWidth": width,
                "screenHeight": height,
                "deviceScaleFactor": 1,
                "mobile": False,
            },
        )
        html = build_harness_html(root, language)
        cdp.call("Page.setDocumentContent", {"frameId": cdp.call("Page.getFrameTree")["frameTree"]["frame"]["id"], "html": html})
        translations = json.loads((root / f"internal/i18n/locales/{language}.json").read_text(encoding="utf-8"))
        cdp.evaluate(locale_bootstrap(translations, language))
        cdp.evaluate((root / "internal/web/assets/js/workspace.js").read_text(encoding="utf-8") + "\n//# sourceURL=workspace.js")
        cdp.evaluate(representative_content_script())
        cdp.evaluate("initializeWorkspace(); refreshWorkspaceTranslations(); prepareResponsiveTables();")
        time.sleep(0.35)
        report_raw = cdp.evaluate("JSON.stringify(responsiveCheckReport())")
        report = json.loads(report_raw)
        compact = json.loads(cdp.evaluate("setDisplayDensity('compact',{persist:false}); JSON.stringify(responsiveCheckReport())"))
        cdp.evaluate("setDisplayDensity('comfortable',{persist:false})")
        if width > 1024:
            interaction = json.loads(cdp.evaluate("toggleSidebar(); JSON.stringify({collapsed:document.body.classList.contains('sidebar-collapsed'),report:responsiveCheckReport()})"))
            cdp.evaluate("toggleSidebar()")
            navigation_ok = bool(interaction.get("collapsed"))
        else:
            interaction = json.loads(cdp.evaluate("toggleSidebar(true); JSON.stringify({open:document.body.classList.contains('sidebar-open'),report:responsiveCheckReport()})"))
            cdp.evaluate("closeMobileSidebar()")
            navigation_ok = bool(interaction.get("open"))
        report["interactions"] = {
            "navigationStateChanged": navigation_ok,
            "navigationOverflow": bool(interaction.get("report", {}).get("overflow")),
            "compactDensityOverflow": bool(compact.get("overflow")),
            "languageSelect": cdp.evaluate("document.getElementById('languageSelect')?.value || ''"),
        }
        report["telemetry"] = json.loads(cdp.evaluate("JSON.stringify((()=>{const p=document.getElementById('liveMarketMappingPanel');const log=document.getElementById('liveRecentLog');const stages=[...document.querySelectorAll('#liveStageTracker .telemetry-stage')];const rect=p?.getBoundingClientRect();let dialogFits=true;const dlg=document.getElementById('runLogDialog');if(dlg){try{dlg.showModal();const d=dlg.getBoundingClientRect();dialogFits=d.left>=-1&&d.right<=window.innerWidth+1&&d.top>=-1&&d.bottom<=window.innerHeight+1;dlg.close();}catch(_){}}return {visible:!!p&&!p.hidden&&p.offsetParent!==null,recentCount:log?log.children.length:0,stageCount:stages.length,panelFits:!!rect&&rect.left>=-1&&rect.right<=window.innerWidth+1,dialogFits};})())"))
        report["requestedWidth"] = width
        report["requestedHeight"] = height
        report["requestedLanguage"] = language
        if screenshot_dir is not None and (width, height) in {(1366, 768), (768, 1024)}:
            capture_screenshot(cdp, screenshot_dir / f"market-signal-lab-{language}-{width}x{height}.png")
        return report
    finally:
        if cdp is not None:
            try:
                cdp.close()
            except Exception:
                pass
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        shutil.rmtree(profile, ignore_errors=True)


def parse_viewports(values: list[str] | None) -> list[tuple[int, int]]:
    if not values:
        return VIEWPORTS
    result: list[tuple[int, int]] = []
    for value in values:
        normalized = value.lower().replace("×", "x")
        width_text, sep, height_text = normalized.partition("x")
        if not sep:
            raise ValueError(f"Invalid viewport: {value}")
        result.append((int(width_text), int(height_text)))
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--chromium", default=shutil.which("chromium") or "chromium")
    parser.add_argument("--viewport", action="append")
    parser.add_argument("--language", choices=LANGUAGES, action="append")
    parser.add_argument("--screenshots-dir", type=Path)
    args = parser.parse_args()

    root = args.root.resolve()
    viewports = parse_viewports(args.viewport)
    languages = args.language or list(LANGUAGES)
    reports: list[dict[str, Any]] = []
    failures = 0

    for language in languages:
        for width, height in viewports:
            try:
                report = check_viewport(root, args.chromium, width, height, language, args.screenshots_dir)
            except Exception as exc:
                failures += 1
                print(f"FAIL {language} {width}x{height}: {exc}", file=sys.stderr)
                continue
            reports.append(report)
            clipped = report.get("clipped") or []
            interactions = report.get("interactions") or {}
            failed = bool(
                report.get("overflow")
                or clipped
                or not interactions.get("navigationStateChanged")
                or interactions.get("navigationOverflow")
                or interactions.get("compactDensityOverflow")
                or interactions.get("languageSelect") != language
                or not (report.get("telemetry") or {}).get("visible")
                or (report.get("telemetry") or {}).get("recentCount") != 5
                or (report.get("telemetry") or {}).get("stageCount") != 11
                or not (report.get("telemetry") or {}).get("panelFits")
                or not (report.get("telemetry") or {}).get("dialogFits")
            )
            if failed:
                failures += 1
            print(
                f"{'FAIL' if failed else 'PASS'} {language} {width}x{height}: "
                f"scroll={report.get('scrollWidth')}/{report.get('viewportWidth')} clipped={len(clipped)}"
            )
            for item in clipped[:8]:
                print(f"  clipped: {item}")

    summary = {
        "root": str(root),
        "checks": len(reports),
        "failures": failures,
        "viewports": [f"{w}x{h}" for w, h in viewports],
        "languages": languages,
        "reports": reports,
    }
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
