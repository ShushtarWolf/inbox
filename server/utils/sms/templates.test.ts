import { describe, expect, it } from 'vitest'
import { renderOtpSms, renderSmsTemplate } from './templates'

describe('SMS templates', () => {
  it('renders OTP with iOS code: line and Android WebOTP last line', () => {
    expect(renderOtpSms('123456')).toBe(
      ['code: 123456', 'کد تایید اینباکس', '@inboxs.ir #123456'].join('\n'),
    )
  })

  it('uses NUXT_PUBLIC_SITE_URL host in the WebOTP line', () => {
    const prev = process.env.NUXT_PUBLIC_SITE_URL
    process.env.NUXT_PUBLIC_SITE_URL = 'https://staging.example.com/'
    expect(renderOtpSms('654321')).toContain('@staging.example.com #654321')
    if (prev === undefined) delete process.env.NUXT_PUBLIC_SITE_URL
    else process.env.NUXT_PUBLIC_SITE_URL = prev
  })

  it('renders booking / reset / club / campaign bodies', () => {
    expect(renderSmsTemplate('BOOKING_CONFIRMED', { date: '1404/01/01', time: '10:00' })).toContain('رزرو تایید شد')
    expect(renderSmsTemplate('PASSWORD_RESET', { resetUrl: 'https://example.com/r' })).toContain('https://example.com/r')
    expect(renderSmsTemplate('PASSWORD_RESET', { resetCode: '654321' })).toContain('654321')
    expect(renderSmsTemplate('CLUB_APPROVED', { clubName: 'Behnaz' })).toContain('Behnaz')
    expect(renderSmsTemplate('CAMPAIGN', { message: 'سلام باشگاه' })).toBe('سلام باشگاه')
  })

  it('includes club + date/time in booking and waitlist templates', () => {
    expect(
      renderSmsTemplate('BOOKING_CONFIRMED', {
        clubName: 'بهناز',
        date: '1404/01/01',
        startTime: '10:00',
      }),
    ).toBe('رزرو تایید شد «بهناز» — ۱۴۰۴/۰۱/۰۱ ساعت ۱۰:۰۰\nاینباکس')
    expect(
      renderSmsTemplate('BOOKING_CANCELLED', {
        clubName: 'بهناز',
        date: '1404/01/01',
        startTime: '10:00',
      }),
    ).toBe(
      [
        'رزرو لغو شد',
        '',
        '۱۴۰۴/۰۱/۰۱ ساعت ۱۰:۰۰',
        '',
        'Inboxs',
      ].join('\n'),
    )
    expect(
      renderSmsTemplate('BOOKING_PAID', {
        clubName: 'بهناز',
        date: '1404/01/01',
        startTime: '10:00',
      }),
    ).toBe('پرداخت رزرو ثبت شد «بهناز» — ۱۴۰۴/۰۱/۰۱ ساعت ۱۰:۰۰. اینباکس')
    expect(
      renderSmsTemplate('OWNER_BOOKING_PAID', {
        clubName: 'بهناز',
        guestName: 'علی رضایی',
        guestPhone: '09121234567',
        amountPaid: 500000,
        date: '1404/01/01',
        startTime: '10:00',
        endTime: '11:00',
        courtName: 'زمین ۱',
        trackingCode: '1057128',
      }),
    ).toBe(
      'پرداخت رزرو | علی رضایی (۰۹۱۲۱۲۳۴۵۶۷) | ۵۰۰٬۰۰۰ تومان | ۱۴۰۴/۰۱/۰۱ از ۱۰:۰۰ تا ۱۱:۰۰ | زمین ۱ | اینباکس',
    )
    expect(
      renderSmsTemplate('OWNER_BOOKING_CONFIRMED', {
        clubName: 'بهناز',
        guestName: 'علی رضایی',
        guestPhone: '09121234567',
        trackingCode: '1057128',
        orderUrl: 'https://inboxs.ir/r/abc',
        sessions: [
          { courtName: 'زمین ۱', date: '1404/01/01', startTime: '10:00', endTime: '11:00' },
          { courtName: 'زمین ۱', date: '1404/01/01', startTime: '11:00', endTime: '12:00' },
          { courtName: 'زمین ۲', date: '1404/01/02', startTime: '18:00', endTime: '19:00' },
        ],
      }),
    ).toBe(
      [
        'Inboxs | سفارش جدید ۱۰۵۷۱۲۸',
        '',
        'باشگاه: «بهناز»',
        'خریدار: علی رضایی',
        'شماره تماس: ۰۹۱۲۱۲۳۴۵۶۷',
        '',
        'مشخصات:',
        'زمین ۱ | ۱۴۰۴/۰۱/۰۱ | ۱۰:۰۰ تا ۱۱:۰۰',
        'زمین ۱ | ۱۴۰۴/۰۱/۰۱ | ۱۱:۰۰ تا ۱۲:۰۰',
        'زمین ۲ | ۱۴۰۴/۰۱/۰۲ | ۱۸:۰۰ تا ۱۹:۰۰',
        '',
        'مشاهده جزئیات سفارش:',
        'https://inboxs.ir/r/abc',
        '',
        'Inboxs',
      ].join('\n'),
    )
    expect(
      renderSmsTemplate('OWNER_BOOKING_CANCELLED', {
        guestName: 'علی رضایی',
        guestPhone: '09121234567',
        date: '1404/01/01',
        startTime: '10:00',
        courtName: 'زمین ۱',
      }),
    ).toBe(
      [
        'Inboxs | لغو رزرو',
        '',
        'علی رضایی (۰۹۱۲۱۲۳۴۵۶۷)',
        '',
        '۱۴۰۴/۰۱/۰۱ ساعت ۱۰:۰۰',
        'زمین ۱',
        '',
        'Inboxs',
      ].join('\n'),
    )
    expect(
      renderSmsTemplate('WAITLIST_SLOT_AVAILABLE', {
        clubName: 'بهناز',
        date: '1404/01/01',
        startTime: '18:00',
      }),
    ).toBe(
      [
        'نوبت آزاد شد',
        '',
        'باشگاه: «بهناز»',
        '۱۴۰۴/۰۱/۰۱ ساعت ۱۸:۰۰',
        '',
        'سریع رزرو کنید.',
        '',
        'Inboxs',
      ].join('\n'),
    )
  })

  it('includes court, payment status, and location on booking confirmed', () => {
    expect(
      renderSmsTemplate('BOOKING_CONFIRMED', {
        clubName: 'بهناز',
        date: '1404/01/01',
        startTime: '10:00',
        courtName: 'زمین ۱',
        paymentPaid: false,
        address: 'سعادت‌آباد',
        mapsUrl: 'https://maps.google.com/?q=35.7,51.4',
      }),
    ).toBe(
      [
        'رزرو تایید شد «بهناز» — ۱۴۰۴/۰۱/۰۱ ساعت ۱۰:۰۰',
        'زمین: زمین ۱',
        'وضعیت پرداخت: پرداخت نشده',
        'سعادت‌آباد',
        'https://maps.google.com/?q=35.7,51.4',
        'اینباکس',
      ].join('\n'),
    )
    expect(
      renderSmsTemplate('BOOKING_CONFIRMED', {
        clubName: 'بهناز',
        date: '1404/01/01',
        startTime: '10:00',
        paymentPaid: true,
      }),
    ).toContain('وضعیت پرداخت: پرداخت شده')
    expect(
      renderSmsTemplate('BOOKING_CONFIRMED', {
        clubName: 'بهناز',
        date: '1404/01/01',
        startTime: '18:00',
        endTime: '20:00',
      }),
    ).toContain('از ۱۸:۰۰ تا ۲۰:۰۰')
    expect(
      renderSmsTemplate('BOOKING_CONFIRMED', {
        clubName: 'بهناز',
        date: '2026-08-14',
        startTime: '18:00',
        endTime: '20:00',
        courtName: 'زمین ۱',
        paymentPaid: false,
        address: 'آدرس باشگاه',
        mapsUrl: 'https://maps.google.com/?q=lat,lng',
        guestName: 'علی رضایی',
        trackingCode: '1057128',
      }),
    ).toBe(
      [
        'علی رضایی عزیز',
        'رزرو شما با موفقیت ثبت شد.',
        '',
        'باشگاه: «بهناز»',
        '',
        'مشخصات رزرو:',
        'زمین ۱ | ۱۴۰۵/۰۵/۲۳ | ۱۸:۰۰ تا ۲۰:۰۰',
        '',
        'کد سفارش: ۱۰۵۷۱۲۸',
        '',
        'مشاهده جزئیات رزرو، قوانین، حساب‌وکتاب و لوکیشن:',
        'https://inboxs.ir/athlete/bookings',
        'Inboxs',
      ].join('\n'),
    )
  })

  it('renders owner-desk confirmation like a pay receipt SMS', () => {
    expect(
      renderSmsTemplate('BOOKING_CONFIRMED', {
        guestName: 'حمید افقه',
        clubName: 'دانشگاه علم وصنعت',
        date: '2026-08-14',
        startTime: '08:00',
        endTime: '09:00',
        courtName: 'زمین ۳',
        trackingCode: '1057128',
        payPin: 'ab12cd9x',
        paymentPaid: false,
      }),
    ).toBe(
      [
        'حمید افقه عزیز',
        'رزرو شما با موفقیت ثبت شد.',
        '',
        'باشگاه: «دانشگاه علم وصنعت»',
        '',
        'مشخصات رزرو:',
        'زمین ۳ | ۱۴۰۵/۰۵/۲۳ | ۰۸:۰۰ تا ۰۹:۰۰',
        '',
        'کد سفارش: ۱۰۵۷۱۲۸',
        '',
        'مشاهده جزئیات رزرو، قوانین، حساب‌وکتاب و لوکیشن:',
        'https://inboxs.ir/athlete/bookings',
        'Inboxs',
      ].join('\n'),
    )
    expect(
      renderSmsTemplate('BOOKING_CANCELLED', {
        guestName: 'حمید افقه',
        courtName: 'زمین ۳',
        date: '2026-08-14',
        startTime: '09:00',
        endTime: '10:00',
        trackingCode: '1057128',
      }),
    ).toBe(
      [
        'رزرو حمید افقه لغو شد',
        '',
        'زمین ۳ | ۱۴۰۵/۰۵/۲۳ از ۰۹:۰۰ تا ۱۰:۰۰ | کد ۱۰۵۷۱۲۸',
        '',
        'Inboxs',
      ].join('\n'),
    )
  })

  it('renders compact admin alert templates', () => {
    expect(
      renderSmsTemplate('ADMIN_BOOKING_CONFIRMED', {
        clubName: 'بهناز',
        guestName: 'علی',
        guestPhone: '09121234567',
        date: '2026-08-14',
        startTime: '10:00',
        courtName: 'زمین ۱',
      }),
    ).toContain('رزرو جدید')
    expect(
      renderSmsTemplate('ADMIN_BOOKING_PAID', {
        clubName: 'بهناز',
        guestName: 'علی',
        amountPaid: 500000,
        date: '2026-08-14',
        startTime: '10:00',
      }),
    ).toContain('پرداخت رزرو')
    expect(
      renderSmsTemplate('ADMIN_BOOKING_CANCELLED', {
        clubName: 'بهناز',
        guestName: 'علی',
        date: '2026-08-14',
        startTime: '10:00',
      }),
    ).toContain('لغو رزرو')
    expect(
      renderSmsTemplate('ADMIN_WITHDRAW_REQUEST', {
        kind: 'club',
        clubName: 'بهناز',
        amount: 1000000,
        sheba: 'IR123456789012345678901234',
      }),
    ).toContain('برداشت باشگاه')
    expect(
      renderSmsTemplate('ADMIN_CLUB_APPLICATION', {
        clubName: 'باشگاه نو',
        city: 'تهران',
        contactName: 'سیامک',
        contactPhone: '09124777927',
      }),
    ).toContain('درخواست باشگاه')
    expect(
      renderSmsTemplate('ADMIN_WALLET_TOPUP', {
        userName: 'ورزشکار',
        userPhone: '09121234567',
        amount: 200000,
      }),
    ).toContain('شارژ کیف پول')
  })

  it('renders a short owner daily SMS with the calendar URL and no booking list', () => {
    expect(
      renderSmsTemplate('OWNER_DAILY_RESERVATIONS', {
        calendarUrl: 'https://inboxs.ir/owner/calendar',
        clubName: 'بهناز',
        lines: [{ court: 'زمین ۱', start: '09:00', guest: 'علی رضایی' }],
      }),
    ).toBe(
      [
        'صاحب باشگاه عزیز',
        '',
        'شما از سایت Inboxs رزرو دارید.',
        '',
        'https://inboxs.ir/owner/calendar',
        '',
        'Inboxs',
      ].join('\n'),
    )
  })

  it('defaults the owner calendar URL to NUXT_PUBLIC_SITE_URL or inboxs.ir', () => {
    const prev = process.env.NUXT_PUBLIC_SITE_URL
    delete process.env.NUXT_PUBLIC_SITE_URL
    expect(renderSmsTemplate('OWNER_DAILY_RESERVATIONS', {})).toContain('https://inboxs.ir/owner/calendar')
    process.env.NUXT_PUBLIC_SITE_URL = 'https://example.test/'
    expect(renderSmsTemplate('OWNER_DAILY_RESERVATIONS', {})).toContain('https://example.test/owner/calendar')
    if (prev === undefined) delete process.env.NUXT_PUBLIC_SITE_URL
    else process.env.NUXT_PUBLIC_SITE_URL = prev
  })

  it('renders package court confirmation with dashboard link', () => {
    expect(
      renderSmsTemplate('BOOKING_CONFIRMED', {
        kind: 'package',
        guestName: 'علی رضایی',
        packageName: 'صبح‌های زوج',
        clubName: 'بهناز',
        courtName: 'زمین ۱',
        trackingCode: '1057128',
        sessions: [
          { courtName: 'زمین ۱', date: '2026-08-14', startTime: '09:00', endTime: '10:00' },
          { courtName: 'زمین ۱', date: '2026-08-16', startTime: '09:00', endTime: '10:00' },
        ],
      }),
    ).toBe(
      [
        'علی رضایی عزیز',
        'رزرو شما با موفقیت ثبت شد.',
        '',
        'باشگاه: «بهناز»',
        '',
        'مشخصات رزرو:',
        'زمین ۱ | ۱۴۰۵/۰۵/۲۳ | ۰۹:۰۰ تا ۱۰:۰۰',
        'زمین ۱ | ۱۴۰۵/۰۵/۲۵ | ۰۹:۰۰ تا ۱۰:۰۰',
        '',
        'کد سفارش: ۱۰۵۷۱۲۸',
        '',
        'مشاهده جزئیات رزرو، قوانین، حساب‌وکتاب و لوکیشن:',
        'https://inboxs.ir/athlete/bookings',
        'Inboxs',
      ].join('\n'),
    )
  })

  it('lists multi-session season rows for guest confirmed SMS', () => {
    expect(
      renderSmsTemplate('BOOKING_CONFIRMED', {
        guestName: 'سارا',
        clubName: 'بهناز',
        trackingCode: '998877',
        sessions: [
          { courtName: 'زمین ۱', date: '2026-08-14', startTime: '18:00', endTime: '19:00' },
          { courtName: 'زمین ۲', date: '2026-08-16', startTime: '10:00', endTime: '11:00' },
          { courtName: 'زمین ۱', date: '2026-08-21', startTime: '18:00', endTime: '19:00' },
        ],
      }),
    ).toBe(
      [
        'سارا عزیز',
        'رزرو شما با موفقیت ثبت شد.',
        '',
        'باشگاه: «بهناز»',
        '',
        'مشخصات رزرو:',
        'زمین ۱ | ۱۴۰۵/۰۵/۲۳ | ۱۸:۰۰ تا ۱۹:۰۰',
        'زمین ۲ | ۱۴۰۵/۰۵/۲۵ | ۱۰:۰۰ تا ۱۱:۰۰',
        'زمین ۱ | ۱۴۰۵/۰۵/۳۰ | ۱۸:۰۰ تا ۱۹:۰۰',
        '',
        'کد سفارش: ۹۹۸۸۷۷',
        '',
        'مشاهده جزئیات رزرو، قوانین، حساب‌وکتاب و لوکیشن:',
        'https://inboxs.ir/athlete/bookings',
        'Inboxs',
      ].join('\n'),
    )
    expect(
      renderSmsTemplate('BOOKING_CONFIRMED', {
        guestName: 'بهناز تعبدی',
        clubName: 'علم و صنعت',
        date: '2026-08-14',
        startTime: '18:00',
        endTime: '19:00',
        paymentPaid: true,
        trackingCode: '1057128',
        receiptUrl: 'https://inboxs.ir/r/abc',
      }),
    ).toBe(
      [
        'بهناز تعبدی عزیز',
        'رزرو شما با موفقیت ثبت شد.',
        '',
        'باشگاه: «علم و صنعت»',
        '',
        'مشخصات رزرو:',
        '۱۴۰۵/۰۵/۲۳ | ۱۸:۰۰ تا ۱۹:۰۰',
        '',
        'کد سفارش: ۱۰۵۷۱۲۸',
        '',
        'مشاهده جزئیات رزرو، قوانین، حساب‌وکتاب و لوکیشن:',
        'https://inboxs.ir/athlete/bookings',
        'Inboxs',
      ].join('\n'),
    )
  })
})
