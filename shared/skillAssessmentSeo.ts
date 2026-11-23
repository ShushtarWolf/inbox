import { serializeJsonLd } from './jsonLd.ts'
import { isPublicSkillAssessmentSlug, PUBLIC_SKILL_ASSESSMENT_SLUGS } from './skillAssessment.ts'
import { SKILL_LEVEL_LABELS_FA } from './skillRating.ts'

const SPORT_LABELS_FA: Record<string, string> = {
  padel: 'پدل',
  tennis: 'تنیس',
  badminton: 'بدمینتون',
  squash: 'اسکواش',
  football: 'فوتبال',
  futsal: 'فوتسال',
  volleyball: 'والیبال',
  basketball: 'بسکتبال',
  'table-tennis': 'پینگ‌پنگ',
  pickleball: 'پیکل‌بال',
}

export function publicSkillNameFa(slug: string): string {
  if (!isPublicSkillAssessmentSlug(slug)) return 'ورزش'
  return SPORT_LABELS_FA[slug] || slug
}

export function skillAssessmentHubTitle(): string {
  return 'تعیین سطح آنلاین ورزشی رایگان | اینباکس'
}

export function skillAssessmentHubDescription(): string {
  return 'ارزیابی رایگان سطح مهارت ۱ تا ۷ برای پدل، تنیس، فوتبال و ۷ رشته دیگر — ۶ سوال کوتاه، نتیجه فوری، ذخیره در پروفایل و پیدا کردن هم‌بازی هم‌سطح در اینباکس.'
}

export function skillAssessmentSportTitle(slug: string): string {
  const name = publicSkillNameFa(slug)
  return `تعیین سطح آنلاین ${name} رایگان | اینباکس`
}

export function skillAssessmentSportDescription(slug: string): string {
  const name = publicSkillNameFa(slug)
  return `تعیین سطح ${name} با ۶ سوال تخصصی — مقیاس ۱ تا ۷، نتیجه آنی و رایگان. سطح خود را ذخیره کنید و هم‌بازی هم‌سطح پیدا کنید.`
}

export function skillAssessmentSportH1(slug: string): string {
  return `تعیین سطح آنلاین ${publicSkillNameFa(slug)} رایگان`
}

export function levelGuideRows() {
  return SKILL_LEVEL_LABELS_FA.map((row) => ({
    min: row.min,
    max: row.max,
    label: row.label,
  }))
}

export function skillAssessmentHubFaq() {
  return [
    {
      question: 'تعیین سطح آنلاین اینباکس چیست؟',
      answer: 'یک ارزیابی ۶ سوالی رایگان است که سطح مهارت شما را روی مقیاس ۱ تا ۷ (شبیه Playtomic) تخمین می‌زند و برای هم‌بازی و رزرو زمین قابل استفاده است.',
    },
    {
      question: 'آیا برای ارزیابی باید وارد حساب شوم؟',
      answer: 'خیر. می‌توانید بدون ورود سوالات را جواب دهید و نتیجه را ببینید. برای ذخیره سطح در پروفایل و پیدا کردن هم‌بازی، یک‌بار وارد می‌شوید.',
    },
    {
      question: 'چه ورزش‌هایی پشتیبانی می‌شود؟',
      answer: 'پدل، تنیس، بدمینتون، اسکواش، فوتبال، فوتسال، والیبال، بسکتبال، پینگ‌پنگ و پیکل‌بال — هر کدام سوالات فنی اختصاصی دارند.',
    },
    {
      question: 'سطح بعد از ارزیابی چقدر دقیق است؟',
      answer: 'اولین نتیجه «اطمینان اولیه» است و با بازی‌های واقعی و امتیاز هم‌بازی‌ها دقیق‌تر می‌شود.',
    },
  ]
}

export function skillAssessmentSportFaq(slug: string) {
  const name = publicSkillNameFa(slug)
  return [
    {
      question: `تعیین سطح ${name} چقدر طول می‌کشد؟`,
      answer: 'حدود ۶۰ تا ۹۰ ثانیه — ۶ سوال با گزینه‌های آماده، بدون نیاز به ویدیو یا مربی.',
    },
    {
      question: `مقیاس ۱ تا ۷ برای ${name} یعنی چه؟`,
      answer: '۱ مبتدی و ۷ نزدیک حرفه‌ای است؛ برچسب فارسی (مثلاً متوسط یا پیشرفته) کنار عدد نمایش داده می‌شود.',
    },
    {
      question: 'بعد از تعیین سطح چه کار کنم؟',
      answer: 'سطح را در پروفایل ذخیره کنید و از بخش هم‌بازی، بازی‌های هم‌سطح را پیدا کنید.',
    },
  ]
}

export function buildSkillAssessmentBreadcrumbJsonLd(siteBase: string, items: Array<{ name: string, path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${siteBase}${item.path}`,
    })),
  }
}

export function buildFaqPageJsonLd(siteBase: string, pagePath: string, faq: Array<{ question: string, answer: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
    url: `${siteBase}${pagePath}`,
  }
}

export function buildSkillAssessmentWebPageJsonLd(opts: {
  siteBase: string
  path: string
  name: string
  description: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: opts.name,
    description: opts.description,
    url: `${opts.siteBase}${opts.path}`,
    inLanguage: 'fa-IR',
    isPartOf: { '@type': 'WebSite', name: 'inbox', url: opts.siteBase },
  }
}

export function serializeSkillAssessmentHeadScripts(
  siteBase: string,
  path: string,
  name: string,
  description: string,
  faq: Array<{ question: string, answer: string }>,
  breadcrumbs: Array<{ name: string, path: string }>,
) {
  return [
    serializeJsonLd(buildSkillAssessmentWebPageJsonLd({ siteBase, path, name, description })),
    serializeJsonLd(buildFaqPageJsonLd(siteBase, path, faq)),
    serializeJsonLd(buildSkillAssessmentBreadcrumbJsonLd(siteBase, breadcrumbs)),
  ]
}

export { PUBLIC_SKILL_ASSESSMENT_SLUGS, isPublicSkillAssessmentSlug }