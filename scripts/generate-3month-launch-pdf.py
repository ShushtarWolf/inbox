#!/usr/bin/env python3
"""Generate planning/3-month-launch.pdf — inbox 3-month launch plan (FA, RTL)."""

from pathlib import Path

import arabic_reshaper
from bidi.algorithm import get_display
from fpdf import FPDF

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "planning" / "3-month-launch.pdf"
FONT = "/System/Library/Fonts/Supplemental/Arial Unicode.ttf"


def fa(text: str) -> str:
    if not text:
        return ""
    return get_display(arabic_reshaper.reshape(text))


MONTHS = [
    {
        "title": "ماه ۱ — زیرساخت + پایلوت بهناز (۱۳ تیر – ۱۰ مرداد ۱۴۰۵)",
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
        "title": "ماه ۲ — تثبیت + soft launch (۱۱ مرداد – ۷ شهریور ۱۴۰۵)",
        "rows": [
            ("۱۲", "رفع باگ‌های پایلوت", "۱۷ مرداد", "۱۶ ساعت", "—"),
            ("۱۳", "SMTP زنده", "۲۴ مرداد", "۴ ساعت", "~۰.۳ م.ت/ماه"),
            ("۱۴", "refund / cancel تست‌شده", "۳۱ مرداد", "۸ ساعت", "—"),
            ("۱۵", "Google OAuth", "۷ شهریور", "۶ ساعت", "۰ (اختیاری)"),
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
        "title": "ماه ۳ — لانچ + اولین رزرو واقعی (۸ شهریور – ۵ مهر ۱۴۰۵)",
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
    ("اولین رزرو واقعی", "۲۱ شهریور"),
    ("۳+ باشگاه فعال", "۲۶ شهریور"),
]

SUMMARY = [
    ("ماه ۱ — توسعه فنی", "~۸۰–۱۰۰ ساعت"),
    ("ماه ۲ — توسعه فنی", "~۶۰–۷۰ ساعت"),
    ("ماه ۳ — توسعه + پشتیبانی", "~۴۰–۵۰ ساعت"),
    ("جمع توسعه (۳ ماه)", "~۱۸۰–۲۲۰ ساعت"),
]


class PlanPDF(FPDF):
    def footer(self):
        self.set_y(-12)
        self.set_font("ArialUni", size=8)
        self.cell(0, 8, fa(f"صفحه {self.page_no()}"), align="C")


def render_table(pdf: PlanPDF, headers: list[str], rows: list[tuple], col_widths: list[float]):
    pdf.set_font("ArialUni", size=8)
    pdf.set_fill_color(196, 30, 30)
    pdf.set_text_color(255, 255, 255)
    for i, h in enumerate(headers):
        pdf.cell(col_widths[i], 7, fa(h), border=1, fill=True, align="C")
    pdf.ln()

    pdf.set_text_color(0, 0, 0)
    fill = False
    for row in rows:
        if pdf.get_y() > 270:
            pdf.add_page()
            pdf.set_font("ArialUni", size=8)
        if fill:
            pdf.set_fill_color(244, 239, 233)
        else:
            pdf.set_fill_color(255, 255, 255)
        x0, y0 = pdf.get_x(), pdf.get_y()
        heights = []
        lines_per_cell = []
        for j, cell in enumerate(row):
            pdf.set_xy(x0 + sum(col_widths[:j]), y0)
            lines = pdf.multi_cell(col_widths[j], 5, fa(cell), border=0, split_only=True)
            lines_per_cell.append(lines)
            heights.append(len(lines) * 5)
        row_h = max(max(heights), 6)
        if y0 + row_h > 280:
            pdf.add_page()
            y0 = pdf.get_y()
        for j, cell in enumerate(row):
            pdf.set_xy(x0 + sum(col_widths[:j]), y0)
            pdf.multi_cell(col_widths[j], 5, fa(cell), border=1, fill=fill, align="R")
            pdf.set_xy(x0 + sum(col_widths[:j]), y0)
            pdf.cell(col_widths[j], row_h, "", border=1, fill=fill)
        pdf.set_xy(x0, y0 + row_h)
        fill = not fill


def main():
    OUT.parent.mkdir(parents=True, exist_ok=True)

    pdf = PlanPDF(orientation="P", unit="mm", format="A4")
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_font("ArialUni", "", FONT)
    pdf.add_page()

    pdf.set_font("ArialUni", size=16)
    pdf.cell(0, 12, fa("inbox — برنامه ۳ ماهه تا لانچ"), ln=True, align="C")
    pdf.set_font("ArialUni", size=10)
    pdf.cell(0, 8, fa("از پایلوت تا اولین رزرو واقعی (خارج از تست بهناز)"), ln=True, align="C")
    pdf.cell(0, 6, fa("شروع: ۱۳ تیر ۱۴۰۵  |  پایان هدف: ۵ مهر ۱۴۰۵"), ln=True, align="C")
    pdf.ln(4)

    pdf.set_font("ArialUni", size=9)
    pdf.multi_cell(
        0,
        5,
        fa(
            "تعریف رزرو واقعی: ورزشکار/باشگاه خارج از دایره تست داخلی بهناز — "
            "با پرداخت زرین‌پال و SMS تأیید."
        ),
        align="R",
    )
    pdf.ln(3)

    headers = ["#", "کار", "مهلت", "زمان اجرا", "هزینه / یادداشت"]
    widths = [10, 52, 22, 38, 38]

    for month in MONTHS:
        pdf.set_font("ArialUni", size=11)
        pdf.set_text_color(196, 30, 30)
        pdf.cell(0, 8, fa(month["title"]), ln=True, align="R")
        pdf.set_text_color(0, 0, 0)
        pdf.ln(1)
        render_table(pdf, headers, month["rows"], widths)
        pdf.set_font("ArialUni", size=9)
        pdf.set_text_color(80, 80, 80)
        pdf.cell(0, 6, fa(month["output"]), ln=True, align="R")
        pdf.set_text_color(0, 0, 0)
        pdf.ln(4)

    pdf.add_page()
    pdf.set_font("ArialUni", size=12)
    pdf.cell(0, 10, fa("Milestone‌ها"), ln=True, align="R")
    render_table(
        pdf,
        ["هدف", "مهلت", "انجام شد ☐"],
        [(m, d, "☐") for m, d in MILESTONES],
        [80, 40, 30],
    )
    pdf.ln(6)

    pdf.set_font("ArialUni", size=12)
    pdf.cell(0, 10, fa("جمع‌بندی زمان توسعه"), ln=True, align="R")
    render_table(pdf, ["بخش", "زمان"], SUMMARY, [100, 60])
    pdf.ln(6)

    pdf.set_font("ArialUni", size=12)
    pdf.cell(0, 10, fa("بودجه ۳ ماهه (قابل تکمیل)"), ln=True, align="R")
    render_table(
        pdf,
        ["قلم", "ماه ۱", "ماه ۲", "ماه ۳", "جمع"],
        [
            ("VPS + دامنه", "", "", "", ""),
            ("SMS", "", "", "", ""),
            ("Cursor", "", "", "", ""),
            ("حقوق توسعه", "", "", "", ""),
            ("تبلیغ", "", "", "", ""),
            ("حقوقی / اینماد", "", "", "", ""),
            ("جمع", "", "", "", ""),
        ],
        [36, 28, 28, 28, 28],
    )
    pdf.ln(4)

    pdf.set_font("ArialUni", size=12)
    pdf.cell(0, 10, fa("درآمد هدف (قابل تکمیل)"), ln=True, align="R")
    render_table(
        pdf,
        ["ماه", "باشگاه فعال", "رزرو", "درآمد (ت.)"],
        [
            ("۱ (تست)", "۱", "۰", "۰"),
            ("۲", "", "", ""),
            ("۳", "", "", ""),
        ],
        [30, 40, 40, 50],
    )

    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
