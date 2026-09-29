#!/usr/bin/env python3
"""Generate docs/founders-meeting-fa.pdf from docs/founders-meeting-fa.html."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "docs" / "founders-meeting-fa.html"
PDF = ROOT / "docs" / "founders-meeting-fa.pdf"
LOGO = ROOT / "docs" / "inbox-founders-logo.png"
VAZIR = (
    ROOT
    / "node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2"
)


def main() -> None:
    if not HTML.exists():
        raise SystemExit(f"Missing HTML: {HTML}")
    if not LOGO.exists():
        raise SystemExit(f"Missing logo: {LOGO}")
    if not VAZIR.exists():
        raise SystemExit(f"Missing font: {VAZIR}")

    script = f"""
const {{ chromium }} = require('playwright');
const path = require('path');
(async () => {{
  const browser = await chromium.launch({{ headless: true }});
  const page = await browser.newPage();
  await page.goto({HTML.resolve().as_uri()!r}, {{ waitUntil: 'networkidle' }});
  await page.pdf({{
    path: {str(PDF)!r},
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: {{ top: '0', bottom: '0', left: '0', right: '0' }},
  }});
  await browser.close();
  console.log('Wrote', {str(PDF)!r});
}})().catch((err) => {{
  console.error(err);
  process.exit(1);
}});
"""
    result = subprocess.run(
        ["node", "-e", script],
        cwd=ROOT,
        capture_output=True,
        text=True,
        timeout=120,
    )
    if result.returncode != 0:
        sys.stderr.write(result.stderr or result.stdout)
        raise SystemExit(result.returncode)
    print(result.stdout.strip())
    print(f"Size: {PDF.stat().st_size} bytes")


if __name__ == "__main__":
    main()
