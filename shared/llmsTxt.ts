import { GEO_SPORT_HUBS } from './geoSportHubs.ts'
import { joinWithAnd } from './courtSlotSelection.ts'

export type LlmsClubLine = {
  slug: string
  nameFa: string
  city?: string | null
  district?: string | null
  /** Localized sport labels already resolved (e.g. پدل، تنیس). */
  sports?: string[]
}

export type LlmsCoachLine = {
  path: string
  nameFa: string
  city?: string | null
}

export type BuildLlmsTxtInput = {
  siteUrl?: string
  clubs?: LlmsClubLine[]
  coaches?: LlmsCoachLine[]
}

function siteBase(url?: string) {
  return String(url || 'https://inboxs.ir').replace(/\/$/, '') || 'https://inboxs.ir'
}

function clubFactLine(club: LlmsClubLine): string {
  const sports = [...new Set((club.sports || []).map((s) => s.trim()).filter(Boolean))]
  const sportPart = sports.length ? joinWithAnd(sports) : 'ورزش‌های اعلام‌شده'
  const city = club.city?.trim() || ''
  const district = club.district?.trim() || ''
  const place = city && district ? `${city}، محله ${district}` : city || district || 'ایران'
  return `باشگاه ${sportPart} در ${place}؛ سانس آزاد را ببینید و آنلاین رزرو کنید`
}

function coachFactLine(coach: LlmsCoachLine): string {
  const city = coach.city?.trim() || 'ایران'
  return `مربی قابل رزرو در ${city}؛ جلسه را در اینباکس رزرو کنید`
}

function mdLink(label: string, href: string, blurb: string) {
  return `- [${label}](${href}): ${blurb}`
}

/**
 * Curated Markdown for /llms.txt — brand facts + hubs + live ACTIVE catalog.
 */
export function buildLlmsTxt(input: BuildLlmsTxtInput = {}): string {
  const base = siteBase(input.siteUrl)
  const clubs = input.clubs || []
  const coaches = input.coaches || []

  const lines: string[] = [
    '# inbox (اینباکس)',
    '',
    '> اینباکس پلتفرم رزرو آنلاین زمین پدل و تنیس در ایران است. ورزشکاران باشگاه و سانس آزاد را پیدا می‌کنند و رزرو ثبت می‌کنند؛ باشگاه‌ها تقویم و ظرفیت را مدیریت می‌کنند.',
    '',
    '## چیستی اینباکس',
    '',
    'اینباکس = پلتفرم رزرو آنلاین پدل/تنیس. دامنه رسمی https://inboxs.ir است — نه seastudio و نه دامنه‌های مشابه.',
    'نرم‌افزار وب به زبان فارسی (fa-IR) کار می‌کند: ورزشکاران باشگاه و سانس آزاد را پیدا می‌کنند و رزرو می‌زنند؛ صاحبان باشگاه تقویم و ظرفیت را مدیریت می‌کنند.',
    '',
    '## برای چه کسانی است',
    '',
    '- ورزشکاران پدل و تنیس که می‌خواهند باشگاه و سانس آزاد را آنلاین ببینند و رزرو کنند.',
    '- صاحبان باشگاه که می‌خواهند تقویم، ظرفیت و رزروها را از پنل مالک مدیریت کنند.',
    '',
    '## چطور رزرو کنم',
    '',
    `۱. از [صفحه اصلی](${base}/) یا [باشگاه‌ها](${base}/clubs) باشگاه را پیدا کنید.`,
    `۲. برای تهران می‌توانید مستقیم به [زمین پدل تهران](${base}/clubs/tehran/padel) یا [زمین تنیس تهران](${base}/clubs/tehran/tennis) بروید.`,
    '۳. تاریخ و سانس آزاد را انتخاب کنید، با موبایل وارد شوید و رزرو را تأیید کنید.',
    `۴. قیمت سانس را باشگاه تعیین می‌کند؛ جزئیات در [قیمت‌ها](${base}/pricing) آمده است.`,
    '',
    '## برای صاحبان باشگاه',
    '',
    `اگر صاحب باشگاه هستید، از [درخواست ثبت باشگاه](${base}/clubs/apply) درخواست بدهید تا پس از بررسی، باشگاه برای رزرو آنلاین فعال شود.`,
    '',
    '## صفحات کلیدی',
    '',
    mdLink('صفحه اصلی', `${base}/`, 'رزرو زمین پدل و تنیس، جستجوی شهر/تاریخ، باشگاه‌های پیشنهادی'),
    mdLink('باشگاه‌ها', `${base}/clubs`, 'فهرست باشگاه‌های فعال برای رزرو آنلاین'),
    mdLink('درباره اینباکس', `${base}/about`, 'معرفی پلتفرم و نقش باشگاه‌ها'),
    mdLink('قیمت‌ها', `${base}/pricing`, 'شفافیت قیمت سانس و هزینه‌های احتمالی'),
    mdLink('تماس', `${base}/contact`, 'پشتیبانی و ارتباط با اپراتور'),
    mdLink('سیاست لغو', `${base}/cancellation`, 'قواعد کلی لغو و استرداد'),
    mdLink('حریم خصوصی', `${base}/privacy`, 'داده‌های شخصی و حقوق کاربر'),
    mdLink('شرایط استفاده', `${base}/terms`, 'شرایط حساب و رزرو'),
    mdLink('ثبت باشگاه', `${base}/clubs/apply`, 'درخواست پیوستن باشگاه به اینباکس'),
    '',
    '## شهر و ورزش',
    '',
  ]

  for (const hub of GEO_SPORT_HUBS) {
    if (hub.sportSlug === 'padel') {
      lines.push(
        mdLink(
          'زمین پدل تهران',
          `${base}${hub.path}`,
          'باشگاه‌های پدل تهران؛ سانس آزاد را ببینید و آنلاین رزرو کنید',
        ),
      )
    }
    else if (hub.sportSlug === 'tennis') {
      lines.push(
        mdLink(
          'زمین تنیس تهران',
          `${base}${hub.path}`,
          'باشگاه‌های تنیس تهران؛ سانس آزاد را ببینید و آنلاین رزرو کنید',
        ),
      )
    }
  }

  lines.push('', '## باشگاه‌ها', '')
  if (clubs.length) {
    for (const club of clubs) {
      const name = club.nameFa.trim() || club.slug
      lines.push(mdLink(name, `${base}/clubs/${club.slug}`, clubFactLine(club)))
    }
  }
  else {
    lines.push(`- باشگاه‌های فعال در [فهرست باشگاه‌ها](${base}/clubs) نمایش داده می‌شوند.`)
  }

  if (coaches.length) {
    lines.push('', '## مربیان', '')
    for (const coach of coaches) {
      const name = coach.nameFa.trim() || coach.path
      const href = coach.path.startsWith('http') ? coach.path : `${base}${coach.path.startsWith('/') ? '' : '/'}${coach.path}`
      lines.push(mdLink(name, href, coachFactLine(coach)))
    }
  }

  lines.push(
    '',
    '## درباره',
    '',
    '- Name: inbox / اینباکس',
    '- Type: WebApplication',
    '- Category: Sports court booking (padel, tennis)',
    '- Primary locale: fa-IR',
    '- Contact: support@inboxs.ir',
    '',
    '## Optional',
    '',
    mdLink('شکایات', `${base}/complaints`, 'ثبت شکایت درباره خدمت یا رزرو'),
    mdLink('نقشه سایت', `${base}/sitemap.xml`, 'فهرست URLهای قابل ایندکس'),
    '',
  )

  return `${lines.join('\n').trim()}\n`
}
