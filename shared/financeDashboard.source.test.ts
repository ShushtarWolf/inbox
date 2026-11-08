import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const page = readFileSync(new URL('../app/pages/owner/finance/index.vue', import.meta.url), 'utf8')
const fa = JSON.parse(readFileSync(new URL('../i18n/locales/fa.json', import.meta.url), 'utf8')) as {
  owner: { financePage: Record<string, string> }
  athlete: Record<string, string>
}

describe('finance dashboard wiring', () => {
  it('keeps filters, full-set excel, and real payout actions', () => {
    expect(page).toContain('selectFinanceTransactions')
    expect(page).toContain('function downloadExcel')
    expect(page).toContain('visibleTransactions.value.map')
    expect(page).not.toContain('visibleTransactions.value.slice')
    expect(page).toContain('/api/owner/payments/${paymentId}/ack-cash-return')
    expect(page).toContain('submitWithdraw')
    expect(page).toContain('saveSheba')
  })

  it('gates tabs by the existing finance permissions and has no demo fixtures', () => {
    expect(page).toContain('showFinancePage')
    expect(page).toContain('fin-v4')
    expect(page).toContain('fin-grid2')
    expect(page).not.toContain('canva-photo-hero')
    expect(page).toContain('finance:reports')
    expect(page).toContain('finance:transactions')
    expect(page).toContain('finance:payouts')
    expect(page).toContain("ownerTab === 'payout'")
    expect(page).not.toContain('8400000')
    expect(page).not.toContain('3200000')
    expect(page).not.toContain('shebaDemo')
    expect(page).not.toContain('id="dtool"')
  })

  it('uses plain Farsi that keeps cash and online apart', () => {
    const copy = fa.owner.financePage
    expect(copy.pageTitle).toBe('امور مالی')
    expect(copy.walletHeroTitle).toContain('پول آنلاین')
    expect(copy.walletNotCashNote).toContain('پول نقد')
    expect(copy.bookCashInTill).toBe('نقد دریافتی ثبت‌شده')
    expect(copy.paymentBreakdownHint).toContain('تعداد')
    expect(fa.athlete.walletOnlineBalance).toContain('کیف پول')
    expect(fa.athlete.walletCashBookHint).toContain('کیف پول سایت نیست')
  })
})
