import {
  clampSkillRating,
  type SkillQuestionnaireAnswers,
  type SkillWizardAnswers,
} from './skillRating.ts'

export type AssessmentOption = {
  label: string
  description: string
  /** 0 (beginner) … 3 (advanced) for scoring */
  weight: number
}

export type AssessmentQuestion = {
  id: string
  kind: 'base' | 'sport'
  title: string
  options: AssessmentOption[]
}

/** Sports with tailored Q4–Q6; everything else uses `general`. */
export const SKILL_ASSESSMENT_SPORT_KEYS = [
  'padel',
  'tennis',
  'badminton',
  'squash',
  'football',
  'futsal',
  'volleyball',
  'basketball',
  'table-tennis',
  'pickleball',
  'general',
] as const

/** SEO / public funnel — tailored sports only (no `general`). */
export const PUBLIC_SKILL_ASSESSMENT_SLUGS = SKILL_ASSESSMENT_SPORT_KEYS.filter(
  (key): key is Exclude<SkillAssessmentSportKey, 'general'> => key !== 'general',
)

export function isPublicSkillAssessmentSlug(
  slug: string,
): slug is Exclude<SkillAssessmentSportKey, 'general'> {
  return (PUBLIC_SKILL_ASSESSMENT_SLUGS as readonly string[]).includes(slug.trim().toLowerCase())
}

export type SkillAssessmentSportKey = (typeof SKILL_ASSESSMENT_SPORT_KEYS)[number]

export function resolveAssessmentSportKey(slug: string): SkillAssessmentSportKey {
  const key = slug.trim().toLowerCase()
  if ((SKILL_ASSESSMENT_SPORT_KEYS as readonly string[]).includes(key) && key !== 'general') {
    return key as SkillAssessmentSportKey
  }
  return 'general'
}

const expOptions = (sportLabel: string): AssessmentOption[] => [
  { label: 'تازه شروع کرده‌ام', description: `کمتر از ۶ ماه با ${sportLabel} کار کرده‌ام`, weight: 0 },
  { label: 'چند سال تجربه دارم', description: 'بین ۶ ماه تا ۳ سال به‌صورت منظم بازی می‌کنم', weight: 1 },
  { label: 'بازیکن باتجربه‌ام', description: '۳ تا ۷ سال سابقه جدی در این ورزش', weight: 2 },
  { label: 'سال‌ها حرفه‌ای یا نیمه‌حرفه‌ای', description: 'بیش از ۷ سال یا سابقه تیم/مربی', weight: 3 },
]

const freqOptions: AssessmentOption[] = [
  { label: 'گاه‌به‌گاه', description: 'کمتر از ۴ بازی در ماه', weight: 0 },
  { label: 'منظم', description: 'حدود ۴ تا ۸ بازی در ماه', weight: 1 },
  { label: 'فعال', description: '۹ تا ۱۶ بازی در ماه', weight: 2 },
  { label: 'خیلی فعال', description: 'بیش از ۱۶ بازی یا تمرین هفتگی', weight: 3 },
]

const compOptions = (sportLabel: string): AssessmentOption[] => [
  { label: 'فقط تفریحی', description: `بازی دوستانه ${sportLabel} بدون مسابقه رسمی`, weight: 0 },
  { label: 'مسابقات محلی', description: 'تورنمنت باشگاهی یا محله‌ای', weight: 1 },
  { label: 'لیگ یا تیم', description: 'عضو تیم یا شرکت در لیگ منطقه‌ای', weight: 2 },
  { label: 'مربی‌گری یا کاپیتانی', description: 'مربی، کاپیتان یا مسابقات سطح بالا', weight: 3 },
]

function baseQuestions(sportLabel: string): AssessmentQuestion[] {
  return [
    { id: 'experience', kind: 'base', title: `چقدر با ${sportLabel} کار کرده‌اید؟`, options: expOptions(sportLabel) },
    { id: 'frequency', kind: 'base', title: 'چند بار در ماه بازی یا تمرین می‌کنید؟', options: freqOptions },
    { id: 'competition', kind: 'base', title: 'پس‌زمینه مسابقه یا تیم شما چیست؟', options: compOptions(sportLabel) },
  ]
}

const SPORT_LABELS_FA: Record<SkillAssessmentSportKey, string> = {
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
  general: 'این ورزش',
}

const SPORT_SPECIFIC: Record<SkillAssessmentSportKey, AssessmentQuestion[]> = {
  padel: [
    {
      id: 'padel-glass',
      kind: 'sport',
      title: 'بازی با دیوار و شیشه (ریباند) را چطور ارزیابی می‌کنید؟',
      options: [
        { label: 'تازه‌کار', description: 'اغلب توپ بعد از برخورد گم می‌شود', weight: 0 },
        { label: 'پایه', description: 'دیوار پشت را گاهی استفاده می‌کنم', weight: 1 },
        { label: 'ماهر', description: 'شیشه و دیوار را در رالی کنترل می‌کنم', weight: 2 },
        { label: 'حرفه‌ای', description: 'بازگشت تهاجمی از شیشه/دیوار جزو بازی من است', weight: 3 },
      ],
    },
    {
      id: 'padel-volley',
      kind: 'sport',
      title: 'والی و بانده‌یا (فلت شبکه) را چطور انجام می‌دهید؟',
      options: [
        { label: 'خیلی کم', description: 'ترجیح بازی از خط عقب', weight: 0 },
        { label: 'گاهی', description: 'والی ساده در شبکه', weight: 1 },
        { label: 'خوب', description: 'والی و بانده‌یا برای فشار', weight: 2 },
        { label: 'سلاح اصلی', description: 'کنترل شبکه و پوچ حرفه‌ای', weight: 3 },
      ],
    },
    {
      id: 'padel-position',
      kind: 'sport',
      title: 'جایگیری دوبل و هماهنگی با هم‌تیمی؟',
      options: [
        { label: 'نامنظم', description: 'هنوز چرخش و جای خالی را نمی‌دانم', weight: 0 },
        { label: 'اولیه', description: 'ایستادن شبکه/عقب را می‌شناسم', weight: 1 },
        { label: 'هماهنگ', description: 'چرخش و پوشش هم‌تیمی را انجام می‌دهم', weight: 2 },
        { label: 'تاکتیکی', description: 'خواندن بازی و بستن زوایا', weight: 3 },
      ],
    },
  ],
  tennis: [
    {
      id: 'tennis-serve',
      kind: 'sport',
      title: 'سرویس و شروع امتیاز را چطور می‌بینید؟',
      options: [
        { label: 'ناپایدار', description: 'سرویس داخل سخت است', weight: 0 },
        { label: 'پایه', description: 'سرویس ساده داخل می‌رود', weight: 1 },
        { label: 'قوی', description: 'سرویس اول قابل اتکا و گاهی امتیاز', weight: 2 },
        { label: 'سلاح', description: 'سرویس برای حمله و کنترل بازی', weight: 3 },
      ],
    },
    {
      id: 'tennis-ground',
      kind: 'sport',
      title: 'ضربات زمینی و رالی از خط عقب؟',
      options: [
        { label: 'کوتاه', description: 'رالی طولانی سخت است', weight: 0 },
        { label: 'متوسط', description: 'فورهند/بک‌هند پایه', weight: 1 },
        { label: 'پایدار', description: 'رالی منسجم و جهت‌دار', weight: 2 },
        { label: 'تهاجمی', description: 'زاویه، اسپین و تمپو بالا', weight: 3 },
      ],
    },
    {
      id: 'tennis-net',
      kind: 'sport',
      title: 'بازی شبکه و امتیاز تمام‌کن؟',
      options: [
        { label: 'به‌ندرت', description: 'ترجیح خط عقب', weight: 0 },
        { label: 'گاهی', description: 'اسماش و والی ساده', weight: 1 },
        { label: 'فعال', description: 'آمدن به شبکه در فرصت مناسب', weight: 2 },
        { label: 'تهاجمی', description: 'والی پوچ و پوینت در شبکه', weight: 3 },
      ],
    },
  ],
  badminton: [
    {
      id: 'bad-clear',
      kind: 'sport',
      title: 'کلیر، دراپ و کنترل فاصله را چطور انجام می‌دهید؟',
      options: [
        { label: 'پایه', description: 'کلیر کوتاه یا پرت', weight: 0 },
        { label: 'متوسط', description: 'کلیر و دراپ ساده', weight: 1 },
        { label: 'خوب', description: 'فاصله‌گذاری و دراپ دقیق', weight: 2 },
        { label: 'ماهر', description: 'کلیر تهاجمی و دراپ برگردان', weight: 3 },
      ],
    },
    {
      id: 'bad-smash',
      kind: 'sport',
      title: 'اسماش و دفاع جلو شبکه؟',
      options: [
        { label: 'ضعیف', description: 'اسماش کنترل‌شده ندارم', weight: 0 },
        { label: 'ساده', description: 'اسماش گاهی امتیاز', weight: 1 },
        { label: 'قوی', description: 'اسماش و دفاع راکت بالا', weight: 2 },
        { label: 'تهاجمی', description: 'ترکیب اسماش و پوچ', weight: 3 },
      ],
    },
    {
      id: 'bad-footwork',
      kind: 'sport',
      title: 'پاهای سریع و جابه‌جایی در زمین؟',
      options: [
        { label: 'کند', description: 'به توپ دیر می‌رسم', weight: 0 },
        { label: 'در حال یادگیری', description: 'شافل پایه', weight: 1 },
        { label: 'سریع', description: 'پوشش چهارگوشه خوب', weight: 2 },
        { label: 'چابک', description: 'بازگشت سریع پس از حمله', weight: 3 },
      ],
    },
  ],
  squash: [
    {
      id: 'squash-length',
      kind: 'sport',
      title: 'کنترل طول و ارتفاع توپ روی دیوار؟',
      options: [
        { label: 'پرت', description: 'دیوار خط یا سرویس خارج', weight: 0 },
        { label: 'پایه', description: 'رالی ساده می‌گیرم', weight: 1 },
        { label: 'کنترل', description: 'طول و پهنا را هدف می‌گیرم', weight: 2 },
        { label: 'فشرده', description: 'فشار مداوم و خط تنگ', weight: 3 },
      ],
    },
    {
      id: 'squash-boast',
      kind: 'sport',
      title: 'بوست، لوب و بازی تهاجمی؟',
      options: [
        { label: 'نمی‌زنم', description: 'فقط رالی مستقیم', weight: 0 },
        { label: 'گاهی', description: 'بوست ساده', weight: 1 },
        { label: 'در تاکتیک', description: 'بوست و لوب برای فضا', weight: 2 },
        { label: 'سلاح', description: 'ترکیب بوست/دراپ حرفه‌ای', weight: 3 },
      ],
    },
    {
      id: 'squash-fitness',
      kind: 'sport',
      title: 'توان بازی فشرده و بازی خواندن؟',
      options: [
        { label: 'خسته‌کننده', description: 'رالی طولانی سخت است', weight: 0 },
        { label: 'متوسط', description: 'چند رالی پرفشار', weight: 1 },
        { label: 'خوب', description: 'تمپو بالا را نگه می‌دارم', weight: 2 },
        { label: 'عالی', description: 'خواندن حریف زیر فشار', weight: 3 },
      ],
    },
  ],
  football: [
    {
      id: 'fb-touch',
      kind: 'sport',
      title: 'تماس اول و کنترل توپ؟',
      options: [
        { label: 'ضعیف', description: 'توپ از پا می‌پرد', weight: 0 },
        { label: 'پایه', description: 'کنترل ساده', weight: 1 },
        { label: 'ماهر', description: 'تماس اول در حرکت', weight: 2 },
        { label: 'حرفه‌ای', description: 'کنترل تحت فشار', weight: 3 },
      ],
    },
    {
      id: 'fb-position',
      kind: 'sport',
      title: 'جایگیری و خواندن بازی تیمی؟',
      options: [
        { label: 'نامنظم', description: 'اغلب از پوزیشن جا می‌مانم', weight: 0 },
        { label: 'پایه', description: 'نقش ساده را می‌دانم', weight: 1 },
        { label: 'خوب', description: 'جابه‌جایی همراه تیم', weight: 2 },
        { label: 'رهبر', description: 'سازماندهی خط و پرس', weight: 3 },
      ],
    },
    {
      id: 'fb-tempo',
      kind: 'sport',
      title: 'تمپو، پاس‌کاری و بازی ترکیبی؟',
      options: [
        { label: 'انفرادی', description: 'بیشتر توپ را نگه می‌دارم', weight: 0 },
        { label: 'ساده', description: 'پاس کوتاه امن', weight: 1 },
        { label: 'ترکیبی', description: 'یک‌دو و تغییر جنبه', weight: 2 },
        { label: 'تهاجمی', description: 'گلزنی و پاس کلیدی', weight: 3 },
      ],
    },
  ],
  futsal: [
    {
      id: 'fut-touch',
      kind: 'sport',
      title: 'کنترل سریع در فضای تنگ؟',
      options: [
        { label: 'پایین', description: 'ضربه اول ناپایدار', weight: 0 },
        { label: 'متوسط', description: 'کنترل دیوار/کنج', weight: 1 },
        { label: 'سریع', description: 'چرخش زیر فشار', weight: 2 },
        { label: 'برجسته', description: 'تماس اول برای حمله', weight: 3 },
      ],
    },
    {
      id: 'fut-pivot',
      kind: 'sport',
      title: 'پیوت، دریبل و فضاسازی ۵ نفره؟',
      options: [
        { label: 'کم', description: 'بیشتر پاس می‌دهم', weight: 0 },
        { label: 'پایه', description: 'دریبل ساده', weight: 1 },
        { label: 'فعال', description: 'پیوت و عبور', weight: 2 },
        { label: 'حل‌کننده', description: 'شکستن فشردگی', weight: 3 },
      ],
    },
    {
      id: 'fut-press',
      kind: 'sport',
      title: 'پرس تیمی و بازی سریع؟',
      options: [
        { label: 'آهسته', description: 'بازگشت دفاعی کند', weight: 0 },
        { label: 'هماهنگ گاهی', description: 'پرس ساده', weight: 1 },
        { label: 'فشرده', description: 'پرس زنجیره‌ای', weight: 2 },
        { label: 'تهاجمی', description: 'پرس کل تیم و ضدحمله', weight: 3 },
      ],
    },
  ],
  volleyball: [
    {
      id: 'vb-serve',
      kind: 'sport',
      title: 'سرویس و شروع رالی؟',
      options: [
        { label: 'خطا زیاد', description: 'سرویس داخل سخت', weight: 0 },
        { label: 'ساده', description: 'سرویس زیر دست', weight: 1 },
        { label: 'تهاجمی', description: 'سرویس شناور یا پرش', weight: 2 },
        { label: 'امتیازآور', description: 'سرویس برای امتیاز مستقیم', weight: 3 },
      ],
    },
    {
      id: 'vb-receive',
      kind: 'sport',
      title: 'پاسور و دریافت اول؟',
      options: [
        { label: 'ضعیف', description: 'دریافت به Setter نمی‌رسد', weight: 0 },
        { label: 'پایه', description: 'پاس ساده', weight: 1 },
        { label: 'پایدار', description: 'دریافت سیستماتیک', weight: 2 },
        { label: 'دقیق', description: 'پاسور زیر فشار', weight: 3 },
      ],
    },
    {
      id: 'vb-attack',
      kind: 'sport',
      title: 'ضربه پشیزنی و دفاع روی تور؟',
      options: [
        { label: 'به‌ندرت', description: 'بیشتر پاس/دفاع', weight: 0 },
        { label: 'گاهی', description: 'ضربه ساده', weight: 1 },
        { label: 'تهاجمی', description: 'چرخش و ضربه قوی', weight: 2 },
        { label: 'حل‌کننده', description: 'امتیاز در ضربات کلیدی', weight: 3 },
      ],
    },
  ],
  basketball: [
    {
      id: 'bb-shot',
      kind: 'sport',
      title: 'شوت و بازی دور خط سه‌امتیازی؟',
      options: [
        { label: 'ناپایدار', description: 'شوت آزاد ضعیف', weight: 0 },
        { label: 'پایه', description: 'شوت نزدیک سبد', weight: 1 },
        { label: 'متنوع', description: 'mid-range و گاهی سه‌امتیازی', weight: 2 },
        { label: 'قابل اتکا', description: 'شوت کلیدی در فشار', weight: 3 },
      ],
    },
    {
      id: 'bb-handle',
      kind: 'sport',
      title: 'دریبل، عبور و تصمیم حمله؟',
      options: [
        { label: 'محدود', description: 'دست غالب فقط', weight: 0 },
        { label: 'پایه', description: 'دریبل و پاس ساده', weight: 1 },
        { label: 'خلاق', description: 'عبور و پلی‌میکینگ', weight: 2 },
        { label: 'ستاره', description: 'حل یکبه‌یک و پاس کلیدی', weight: 3 },
      ],
    },
    {
      id: 'bb-defense',
      kind: 'sport',
      title: 'دفاع فردی و کمک دفاعی؟',
      options: [
        { label: 'ضعیف', description: 'ردیابی سخت است', weight: 0 },
        { label: 'پایه', description: 'ایستادن درست', weight: 1 },
        { label: 'فعال', description: 'کمک و بستن نفوذ', weight: 2 },
        { label: 'برجسته', description: 'دفاع سراسری و پرس', weight: 3 },
      ],
    },
  ],
  'table-tennis': [
    {
      id: 'tt-rally',
      kind: 'sport',
      title: 'رالی پایدار و کنترل میز کوتاه؟',
      options: [
        { label: 'کوتاه', description: 'چند ضربه نگه نمی‌دارم', weight: 0 },
        { label: 'ساده', description: 'رالی پایه', weight: 1 },
        { label: 'پایدار', description: 'تمپو و چرخش', weight: 2 },
        { label: 'فشرده', description: 'فشار مداوم و زوایا', weight: 3 },
      ],
    },
    {
      id: 'tt-spin',
      kind: 'sport',
      title: 'اسپین سرویس و دریافت؟',
      options: [
        { label: 'بدون اسپین', description: 'سرویس تخت', weight: 0 },
        { label: 'پایه', description: 'بک‌اسپین/تاپ‌اسپین ساده', weight: 1 },
        { label: 'ماهر', description: 'خواندن اسپین حریف', weight: 2 },
        { label: 'پیشرفته', description: 'سرویس پنهان و سوم توپ', weight: 3 },
      ],
    },
    {
      id: 'tt-attack',
      kind: 'sport',
      title: 'ضربه حلقه و حمله نزدیک میز؟',
      options: [
        { label: 'دفاعی', description: 'بیشتر بلوک', weight: 0 },
        { label: 'گاهی حمله', description: 'لوپ ساده', weight: 1 },
        { label: 'تهاجمی', description: 'فلیپ و ضربه سریع', weight: 2 },
        { label: 'تمام‌کن', description: 'حل رالی در ۳–۵ ضربه', weight: 3 },
      ],
    },
  ],
  pickleball: [
    {
      id: 'pk-dink',
      kind: 'sport',
      title: 'دینک و بازی نزدیک شبکه؟',
      options: [
        { label: 'تازه', description: 'دینک ناپایدار', weight: 0 },
        { label: 'پایه', description: 'دینک ساده', weight: 1 },
        { label: 'ماهر', description: 'دینک و پوچ', weight: 2 },
        { label: 'تهاجمی', description: 'کنترل kitchen', weight: 3 },
      ],
    },
    {
      id: 'pk-drive',
      kind: 'sport',
      title: 'درایو، سوم‌شات و سرویس؟',
      options: [
        { label: 'ضعیف', description: 'سرویس داخل سخت', weight: 0 },
        { label: 'متوسط', description: 'سوم‌شات قابل اتکا', weight: 1 },
        { label: 'قوی', description: 'درایو و سرویس عمیق', weight: 2 },
        { label: 'برتر', description: 'سرویس برای امتیاز', weight: 3 },
      ],
    },
    {
      id: 'pk-doubles',
      kind: 'sport',
      title: 'هماهنگی دوبل و جایگیری؟',
      options: [
        { label: 'نامنظم', description: 'چرخش را بلد نیستم', weight: 0 },
        { label: 'پایه', description: 'ایستادن کنار هم', weight: 1 },
        { label: 'هماهنگ', description: 'چرخش و پوشش', weight: 2 },
        { label: 'تاکتیکی', description: 'بستن خطوط و استک', weight: 3 },
      ],
    },
  ],
  general: [
    {
      id: 'gen-tech',
      kind: 'sport',
      title: 'سطح تکنیک فردی شما در این ورزش؟',
      options: [
        { label: 'در حال یادگیری', description: 'حرکات پایه را می‌آموزم', weight: 0 },
        { label: 'متوسط', description: 'تکنیک قابل قبول در بازی', weight: 1 },
        { label: 'خوب', description: 'اجرای پایدار مهارت‌ها', weight: 2 },
        { label: 'پیشرفته', description: 'تکنیک تحت فشار', weight: 3 },
      ],
    },
    {
      id: 'gen-tactic',
      kind: 'sport',
      title: 'درک تاکتیک و تصمیم در بازی؟',
      options: [
        { label: 'اولیه', description: 'فقط بازی می‌کنم', weight: 0 },
        { label: 'پایه', description: 'نقش ساده را می‌دانم', weight: 1 },
        { label: 'خوب', description: 'خواندن حریف و هم‌تیمی', weight: 2 },
        { label: 'رهبر', description: 'هدایت تمپو و تاکتیک', weight: 3 },
      ],
    },
    {
      id: 'gen-physical',
      kind: 'sport',
      title: 'آمادگی جسمانی مرتبط با این ورزش؟',
      options: [
        { label: 'کم', description: 'خسته می‌شوم', weight: 0 },
        { label: 'متوسط', description: 'یک بازی کامل', weight: 1 },
        { label: 'خوب', description: 'چند بازی یا تمرین', weight: 2 },
        { label: 'عالی', description: 'استقامت و سرعت بالا', weight: 3 },
      ],
    },
  ],
}

export function getSkillAssessmentQuestionnaire(sportSlug: string): AssessmentQuestion[] {
  const key = resolveAssessmentSportKey(sportSlug)
  const label = SPORT_LABELS_FA[key]
  return [...baseQuestions(label), ...SPORT_SPECIFIC[key]]
}

export function validateWizardChoices(sportSlug: string, choices: number[]): boolean {
  if (!Array.isArray(choices) || choices.length !== 6) return false
  const questions = getSkillAssessmentQuestionnaire(sportSlug)
  for (let i = 0; i < 6; i++) {
    const idx = choices[i]
    const q = questions[i]
    if (!q || !Number.isInteger(idx) || idx < 0 || idx >= q.options.length) return false
  }
  return true
}

export function computeRatingFromWizard(sportSlug: string, choices: number[]): {
  rating: number
  confidence: number
} {
  const questions = getSkillAssessmentQuestionnaire(sportSlug)
  let sum = 0
  let max = 0
  for (let i = 0; i < 6; i++) {
    const q = questions[i]!
    const idx = Math.min(Math.max(0, choices[i] ?? 0), q.options.length - 1)
    const opt = q.options[idx]!
    sum += opt.weight
    max += Math.max(...q.options.map((o) => o.weight))
  }
  const norm = max > 0 ? sum / max : 0.35
  const rating = clampSkillRating(1.25 + norm * 5.15)
  return { rating, confidence: 0.32 }
}

/** Map wizard to legacy fields + embed wizard for history metadata. */
export function buildQuestionnaireFromWizard(wizard: SkillWizardAnswers): SkillQuestionnaireAnswers {
  const { rating } = computeRatingFromWizard(wizard.sportSlug, wizard.choices)
  const experienceYears = Math.round(rating)
  const matchesPerMonth = Math.round(2 + wizard.choices[1]! * 4)
  const techniqueSelf = Math.min(5, Math.max(1, 1 + wizard.choices[3]!))
  const tacticsSelf = Math.min(5, Math.max(1, 1 + wizard.choices[4]!))
  return {
    experienceYears,
    matchesPerMonth,
    techniqueSelf,
    tacticsSelf,
    wizard,
  }
}

export function parseSkillAssessmentAnswers(
  raw: unknown,
): { sportSlug: string, answers: SkillQuestionnaireAnswers } | null {
  if (!raw || typeof raw !== 'object') return null
  const body = raw as SkillQuestionnaireAnswers
  if (body.wizard && body.wizard.version === 2) {
    if (!validateWizardChoices(body.wizard.sportSlug, body.wizard.choices)) return null
    return {
      sportSlug: body.wizard.sportSlug,
      answers: buildQuestionnaireFromWizard(body.wizard),
    }
  }
  const { experienceYears, matchesPerMonth, techniqueSelf, tacticsSelf } = body
  if (
    [experienceYears, matchesPerMonth, techniqueSelf, tacticsSelf].some((v) => typeof v !== 'number' || !Number.isFinite(v))
  ) {
    return null
  }
  return {
    sportSlug: 'general',
    answers: {
      experienceYears,
      matchesPerMonth,
      techniqueSelf,
      tacticsSelf,
    },
  }
}

const LEVEL_PLAY_DESCRIPTION_FA: { max: number, text: string }[] = [
  { max: 2, text: 'بازی تفریحی و یادگیری قوانین؛ رالی کوتاه و تمرکز روی تماس اول با توپ.' },
  { max: 2.8, text: 'می‌توانید بازی منظم داشته باشید و در مسابقات سطح پایین شرکت کنید.' },
  { max: 3.6, text: 'بازیکن میانه باشگاه؛ تکنیک و تاکتیک پایدار در بازی‌های هم‌سطح.' },
  { max: 4.4, text: 'در تورنمنت‌های محلی رقابت می‌کنید و نقاط ضعف را سریع اصلاح می‌کنید.' },
  { max: 5.2, text: 'سطح بالای باشگاه؛ تمپو بازی را کنترل و حریف هم‌تراز را تحت فشار می‌گذارید.' },
  { max: 6, text: 'بازیکن پیشرفته با تاکتیک دقیق؛ در لیگ یا تیم‌های جدی حضور دارید.' },
  { max: 7.1, text: 'نزدیک به سطح حرفه‌ای یا مربی؛ کیفیت بازی در بالاترین رده باشگاهی.' },
]

export function skillLevelPlayDescriptionFa(rating: number): string {
  const r = clampSkillRating(rating)
  const row = LEVEL_PLAY_DESCRIPTION_FA.find((band) => r < band.max)
    || LEVEL_PLAY_DESCRIPTION_FA[LEVEL_PLAY_DESCRIPTION_FA.length - 1]!
  return row.text
}