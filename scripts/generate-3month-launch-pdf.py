#!/usr/bin/env python3
"""Generate planning/3-month-launch.pdf — inbox brand book styling."""

from __future__ import annotations

import html
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_PDF = ROOT / "planning" / "3-month-launch.pdf"
OUT_HTML = ROOT / "planning" / ".3-month-launch-print.html"
VAZIR_WOFF2 = (
    ROOT
    / "node_modules/@fontsource-variable/vazirmatn/files/vazirmatn-arabic-wght-normal.woff2"
)
OUTFIT_WOFF2 = (
    ROOT / "node_modules/@fontsource-variable/outfit/files/outfit-latin-wght-normal.woff2"
)
LOGO = ROOT / "public/brand/inbox-logo-mark.svg"
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# Brand book — server/utils/palette.ts
C = {
    "primary": "#C41E1E",
    "primaryDark": "#4A1420",
    "gold": "#B68A3B",
    "cream": "#F4EFE9",
    "navy": "#2C2C2A",
    "gray500": "#6B6B67",
    "gray200": "#D4D2CE",
    "gray100": "#E8E6E2",
    "white": "#FFFFFF",
}

MONTHS = [
    {
        "title": "ماه ۱ — زیرساخت + پایلوت بهناز",
        "range": "۱۳ تیر – ۱۰ مرداد ۱۴۰۵",
        "rows": [
            ("۱", "ثبت merchant زرین‌پال", "۲۰ تیر", "۱–۲ هفته (اداری)", "۵–۱۰ م.ت ضمانت"),
            ("۲", "خط SMS + تأیید قالب", "۲۷ تیر", "۳–۷ روز (اداری)", "۵–۱۰ م.ت"),
            ("۳", "VPS ایران + دامنه .ir", "۲۰ تیر", "۴ ساعت", "~۲ م.ت/ماه"),
            ("۴", "مهاجرت Railway → VPS", "۲۷ تیر", "۸–۱۲ ساعت", "—"),
            ("۵", "Zarinpal live + callback", "۳ مرداد", "۱۶–۲۴ ساعت", "—"),
            ("۶", "SMS واقعی + قالب فارسی", "۳ مرداد", "۱۲–۱۶ ساعت", "—"),
            ("۷", "SMS بعد از پرداخت موفق", "۱۰ مرداد", "۴ ساعت", "—"),
            ("۸", "Sentry + بکاپ Postgres", "۱۰ مرداد", "۴ ساعت", "—"),
            ("۹", "آنبورد باشگاه بهناز", "۱۰ مرداد", "۴ ساعت", "—"),
            ("۱۰", "QA: رزرو → پرداخت → SMS", "۱۰ مرداد", "۸ ساعت", "—"),
            ("۱۱", "پایلوت داخلی بهناز (۵–۱۰ نفر)", "۱۰ مرداد", "۴ ساعت پشتیبانی", "فقط تست"),
        ],
        "output": "خروجی: پایلوت بهناز زنده — هنوز رزرو واقعی نیست",
    },
    {
        "title": "ماه ۲ — تثبیت + soft launch",
        "range": "۱۱ مرداد – ۷ شهریور ۱۴۰۵",
        "rows": [
            ("۱۲", "رفع باگ‌های پایلوت", "۱۷ مرداد", "۱۶ ساعت", "—"),
            ("۱۳", "SMTP زنده", "۲۴ مرداد", "۴ ساعت", "~۰.۳ م.ت/ماه"),
            ("۱۴", "refund / cancel تست‌شده", "۳۱ مرداد", "۸ ساعت", "—"),
            ("۱۵", "Google OAuth", "۷ شهریور", "۶ ساعت", "اختیاری"),
            ("۱۶", "PWA + تست موبایل", "۷ شهریور", "۴ ساعت", "—"),
            ("۱۷", "اینماد + صفحات legal", "۷ شهریور", "۴ ساعت + اداری", "~۰.۲ م.ت"),
            ("۱۸", "مدل قیمت (اشتراک/کارمزد)", "۳۱ مرداد", "جلسه ۲ ساعت", "—"),
            ("۱۹", "قرارداد استاندارد باشگاه", "۱۴ شهریور", "۸ ساعت (حقوقی)", "—"),
            ("۲۰", "لندینگ + QR رزرو", "۱۴ شهریور", "۸ ساعت", "—"),
            ("۲۱", "آنبورد باشگاه دوم", "۲۱ شهریور", "۶ ساعت", "—"),
            ("۲۲", "QA کامل FA/EN", "۲۱ شهریور", "۸ ساعت", "—"),
            ("۲۳", "آموزش پذیرش باشگاه", "۲۸ شهریور", "۴ ساعت", "—"),
            ("۲۴", "Soft launch", "۲۸ شهریور", "۴ ساعت", "—"),
        ],
        "output": "خروجی: ۲ باشگاه live — آماده رزرو عمومی",
    },
    {
        "title": "ماه ۳ — لانچ + اولین رزرو واقعی",
        "range": "۸ شهریور – ۵ مهر ۱۴۰۵",
        "rows": [
            ("۲۵", "اعلام عمومی", "۱۲ شهریور", "۸ ساعت (مارکتینگ)", "۵–۱۰ م.ت"),
            ("۲۶", "مانیتورینگ ۴۸ ساعت اول", "۱۴ شهریور", "۸ ساعت", "—"),
            ("۲۷", "پشتیبانی باگ لانچ", "۱۹ شهریور", "۱۶ ساعت (بافر)", "—"),
            ("۲۸", "جذب باشگاه ۳ و ۴", "۲۶ شهریور", "۱۲ ساعت", "—"),
            ("۲۹", "یادآوری SMS ۲۴h قبل", "۱۹ شهریور", "۸ ساعت", "اختیاری"),
            ("۳۰", "گزارش هفتگی رزرو/درآمد", "هر جمعه", "۲ ساعت/هفته", "—"),
            ("۳۱", "اولین رزرو واقعی (غیر تست بهناز)", "۲۱ شهریور", "— milestone", "هدف اصلی"),
            ("۳۲", "ثبت شرکت", "۲۸ شهریور", "اداری ۱–۲ هفته", "۱۰–۱۵ م.ت"),
            ("۳۳", "بازبینی ۳ ماهه + فاز ۲", "۵ مهر", "۴ ساعت", "—"),
        ],
        "output": "خروجی: اولین رزرو واقعی — ۳+ باشگاه — درآمد اول",
    },
]

MILESTONES = [
    ("Zarinpal + SMS live", "۳ مرداد"),
    ("پایلوت بهناز (تست)", "۱۰ مرداد"),
    ("Soft launch", "۲۸ شهریور"),
    ("اولین رزرو واقعی", "۲۱ شهریور", True),
    ("۳+ باشگاه فعال", "۲۶ شهریور"),
]

SUMMARY = [
    ("ماه ۱ — توسعه فنی", "~۸۰–۱۰۰ ساعت"),
    ("ماه ۲ — توسعه فنی", "~۶۰–۷۰ ساعت"),
    ("ماه ۳ — توسعه + پشتیبانی", "~۴۰–۵۰ ساعت"),
    ("جمع توسعه (۳ ماه)", "~۱۸۰–۲۲۰ ساعت"),
]


def esc(text: str) -> str:
    return html.escape(text, quote=True)


def table_rows(rows: list[tuple], *, milestone_col: int | None = None) -> str:
    out = []
    for i, row in enumerate(rows):
        cells = list(row)
        is_milestone = len(cells) > 2 and cells[-1] is True
        if is_milestone:
            cells = cells[:-1]
        tr_class = "milestone" if is_milestone else ("alt" if i % 2 else "")
        tds = "".join(f"<td>{esc(str(c))}</td>" for c in cells)
        out.append(f'<tr class="{tr_class}">{tds}</tr>')
    return "\n".join(out)


def task_table(rows: list[tuple]) -> str:
    body = []
    for i, (num, task, deadline, effort, note) in enumerate(rows):
        milestone = "milestone" if "رزرو واقعی" in task else ""
        alt = "alt" if i % 2 else ""
        body.append(
            f"""<tr class="{milestone} {alt}">
  <td class="num">{esc(num)}</td>
  <td class="task">{esc(task)}</td>
  <td class="deadline">{esc(deadline)}</td>
  <td class="effort">{esc(effort)}</td>
  <td class="note">{esc(note)}</td>
  <td class="check">☐</td>
</tr>"""
        )
    return "\n".join(body)


def build_html() -> str:
    vazir = VAZIR_WOFF2.as_uri()
    outfit = OUTFIT_WOFF2.as_uri()
    logo = LOGO.as_uri()

    month_blocks = []
    for m in MONTHS:
        month_blocks.append(
            f"""
<section class="month">
  <div class="month-head">
    <h2>{esc(m["title"])}</h2>
    <span class="month-range">{esc(m["range"])}</span>
  </div>
  <table>
    <thead>
      <tr>
        <th>#</th><th>کار</th><th>مهلت</th><th>زمان اجرا</th><th>هزینه / یادداشت</th><th>☐</th>
      </tr>
    </thead>
    <tbody>
      {task_table(m["rows"])}
    </tbody>
  </table>
  <p class="month-out">{esc(m["output"])}</p>
</section>"""
        )

    milestone_rows = []
    for item in MILESTONES:
        highlight = len(item) == 3 and item[2]
        cls = ' class="milestone"' if highlight else ""
        milestone_rows.append(
            f"<tr{cls}><td>{esc(item[0])}</td><td>{esc(item[1])}</td><td>☐</td></tr>"
        )

    return f"""<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>inbox — برنامه ۳ ماهه</title>
  <style>
    @font-face {{
      font-family: 'Vazirmatn';
      src: url('{vazir}') format('woff2');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }}
    @font-face {{
      font-family: 'Outfit';
      src: url('{outfit}') format('woff2');
      font-weight: 100 900;
      font-style: normal;
      font-display: swap;
    }}

    @page {{
      size: A4;
      margin: 14mm 12mm 16mm;
    }}

    * {{ box-sizing: border-box; }}

    body {{
      margin: 0;
      font-family: 'Vazirmatn', 'Outfit', system-ui, sans-serif;
      font-size: 10.5pt;
      line-height: 1.55;
      color: {C["navy"]};
      background: {C["white"]};
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }}

    .cover {{
      background: linear-gradient(145deg, {C["cream"]} 0%, {C["white"]} 55%);
      border: 1px solid {C["gray200"]};
      border-radius: 16px;
      padding: 22px 24px 20px;
      margin-bottom: 22px;
      page-break-after: avoid;
    }}

    .cover-top {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      margin-bottom: 14px;
    }}

    .logo {{
      width: 44px;
      height: 44px;
      flex-shrink: 0;
    }}

    .brand-tag {{
      font-family: 'Outfit', sans-serif;
      font-size: 11pt;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: {C["primary"]};
    }}

    h1 {{
      margin: 0 0 6px;
      font-size: 21pt;
      font-weight: 700;
      color: {C["primaryDark"]};
      line-height: 1.25;
    }}

    .subtitle {{
      margin: 0 0 10px;
      font-size: 11.5pt;
      color: {C["gray500"]};
    }}

    .meta {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }}

    .pill {{
      background: {C["white"]};
      border: 1px solid {C["gray200"]};
      border-radius: 999px;
      padding: 5px 12px;
      font-size: 9.5pt;
      color: {C["navy"]};
    }}

    .pill strong {{ color: {C["primary"]}; }}

    .intro {{
      margin: 0 0 18px;
      padding: 12px 14px;
      background: {C["cream"]};
      border-right: 4px solid {C["gold"]};
      border-radius: 10px;
      font-size: 10pt;
      color: {C["gray500"]};
    }}

    .month {{
      margin-bottom: 20px;
      break-inside: avoid-page;
    }}

    .month-head {{
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 8px;
      padding-bottom: 6px;
      border-bottom: 2px solid {C["primary"]};
    }}

    h2 {{
      margin: 0;
      font-size: 13pt;
      font-weight: 700;
      color: {C["primaryDark"]};
    }}

    .month-range {{
      font-size: 9pt;
      color: {C["gold"]};
      font-weight: 600;
      white-space: nowrap;
    }}

    table {{
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      font-size: 9.5pt;
      border: 1px solid {C["gray200"]};
      border-radius: 10px;
      overflow: hidden;
    }}

    thead th {{
      background: {C["primary"]};
      color: {C["white"]};
      font-weight: 600;
      text-align: right;
      padding: 8px 10px;
      border-bottom: 1px solid {C["primaryDark"]};
    }}

    tbody td {{
      padding: 7px 10px;
      vertical-align: top;
      border-bottom: 1px solid {C["gray200"]};
    }}

    tbody tr:last-child td {{ border-bottom: none; }}
    tbody tr.alt {{ background: {C["cream"]}; }}
    tbody tr.milestone {{
      background: rgba(182, 138, 59, 0.12);
      font-weight: 600;
    }}

    td.num {{ width: 28px; text-align: center; color: {C["primary"]}; font-weight: 700; }}
    td.deadline {{ width: 68px; white-space: nowrap; font-weight: 600; }}
    td.effort {{ width: 92px; color: {C["primaryDark"]}; }}
    td.note {{ color: {C["gray500"]}; font-size: 9pt; }}
    td.check {{ width: 28px; text-align: center; color: {C["gray500"]}; }}

    .month-out {{
      margin: 8px 2px 0;
      font-size: 9.5pt;
      color: {C["gray500"]};
      font-style: normal;
    }}

    .page-break {{ page-break-before: always; }}

    h3 {{
      margin: 0 0 10px;
      font-size: 12pt;
      color: {C["primaryDark"]};
      border-bottom: 1px solid {C["gray200"]};
      padding-bottom: 6px;
    }}

    .section {{ margin-bottom: 18px; }}

    .footer-note {{
      margin-top: 16px;
      font-size: 8.5pt;
      color: {C["gray500"]};
      text-align: center;
    }}
  </style>
</head>
<body>
  <div class="cover">
    <div class="cover-top">
      <img class="logo" src="{logo}" alt="inbox" />
      <span class="brand-tag">inbox · shushzerv</span>
    </div>
    <h1>برنامه ۳ ماهه تا لانچ</h1>
    <p class="subtitle">از پایلوت تا اولین رزرو واقعی (خارج از تست بهناز)</p>
    <div class="meta">
      <span class="pill"><strong>شروع:</strong> ۱۳ تیر ۱۴۰۵</span>
      <span class="pill"><strong>پایان هدف:</strong> ۵ مهر ۱۴۰۵</span>
      <span class="pill"><strong>توسعه:</strong> ~۱۸۰–۲۲۰ ساعت</span>
    </div>
  </div>

  <p class="intro">
    <strong>رزرو واقعی</strong> = ورزشکار/باشگاه خارج از دایره تست داخلی بهناز، با پرداخت زرین‌پال و SMS تأیید.
  </p>

  {''.join(month_blocks)}

  <div class="page-break"></div>

  <div class="section">
    <h3>Milestone‌ها</h3>
    <table>
      <thead><tr><th>هدف</th><th>مهلت</th><th>☐</th></tr></thead>
      <tbody>
        {''.join(milestone_rows)}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h3>جمع‌بندی زمان توسعه</h3>
    <table>
      <thead><tr><th>بخش</th><th>زمان</th></tr></thead>
      <tbody>
        {''.join(f'<tr class="{"alt" if i%2 else ""}"><td>{esc(a)}</td><td>{esc(b)}</td></tr>' for i,(a,b) in enumerate(SUMMARY))}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h3>بودجه ۳ ماهه (قابل تکمیل)</h3>
    <table>
      <thead><tr><th>قلم</th><th>ماه ۱</th><th>ماه ۲</th><th>ماه ۳</th><th>جمع</th></tr></thead>
      <tbody>
        {''.join(f'<tr class="{"alt" if i%2 else ""}"><td>{esc(r)}</td><td></td><td></td><td></td><td></td></tr>' for i,r in enumerate(["VPS + دامنه","SMS","Cursor","حقوق توسعه","تبلیغ","حقوقی / اینماد","جمع"]))}
      </tbody>
    </table>
  </div>

  <div class="section">
    <h3>درآمد هدف (قابل تکمیل)</h3>
    <table>
      <thead><tr><th>ماه</th><th>باشگاه فعال</th><th>رزرو</th><th>درآمد (ت.)</th></tr></thead>
      <tbody>
        <tr><td>۱ (تست)</td><td>۱</td><td>۰</td><td>۰</td></tr>
        <tr class="alt"><td>۲</td><td></td><td></td><td></td></tr>
        <tr><td>۳</td><td></td><td></td><td></td></tr>
      </tbody>
    </table>
  </div>

  <p class="footer-note">inbox brand book · Vazirmatn + Outfit · coach red #C41E1E · cream #F4EFE9</p>
</body>
</html>"""


def print_pdf(html_path: Path, pdf_path: Path) -> None:
    cmd = [
        CHROME,
        "--headless=new",
        "--disable-gpu",
        "--no-pdf-header-footer",
        f"--print-to-pdf={pdf_path}",
        html_path.as_uri(),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
    if result.returncode != 0:
        raise RuntimeError(f"Chrome PDF failed: {result.stderr or result.stdout}")


def main() -> None:
    if not VAZIR_WOFF2.exists():
        raise SystemExit(f"Missing font: {VAZIR_WOFF2}")
    OUT_PDF.parent.mkdir(parents=True, exist_ok=True)
    OUT_HTML.write_text(build_html(), encoding="utf-8")
    print_pdf(OUT_HTML, OUT_PDF)
    print(f"Wrote {OUT_PDF}")


if __name__ == "__main__":
    main()
