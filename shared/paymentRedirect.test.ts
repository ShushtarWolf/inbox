import { describe, expect, it, vi } from 'vitest'
import {
  createSepTokenForm,
  gatewayStallError,
  leaveToPaymentGateway,
  parseSepSendToken,
  paymentHandoffFromRedirectUrl,
  sepOnlinePgUrl,
} from './paymentRedirect.ts'

describe('parseSepSendToken', () => {
  it('reads token from SEP GET SendToken URLs', () => {
    expect(parseSepSendToken('https://sep.shaparak.ir/OnlinePG/SendToken?token=abc%2B1'))
      .toBe('abc+1')
  })

  it('ignores test-gateway and relative app URLs', () => {
    expect(parseSepSendToken('/payments/test-gateway?ResNum=x')).toBeNull()
    expect(parseSepSendToken('https://inboxs.ir/payments/test-gateway?provider=sep&ResNum=INB1')).toBeNull()
  })
})

describe('paymentHandoffFromRedirectUrl', () => {
  it('maps SendToken GET to POST OnlinePG + Token', () => {
    expect(paymentHandoffFromRedirectUrl('https://sep.shaparak.ir/OnlinePG/SendToken?token=tok-abc')).toEqual({
      kind: 'sep-post',
      token: 'tok-abc',
      actionUrl: 'https://sep.shaparak.ir/OnlinePG/OnlinePG',
    })
  })

  it('keeps same-origin test gateway as assign', () => {
    expect(paymentHandoffFromRedirectUrl('/payments/test-gateway?ResNum=SIM1&amount=450000')).toEqual({
      kind: 'assign',
      url: '/payments/test-gateway?ResNum=SIM1&amount=450000',
    })
  })

  it('builds OnlinePG action from a custom SEP origin', () => {
    expect(sepOnlinePgUrl('https://sep.example.test/OnlinePG/SendToken?token=z'))
      .toBe('https://sep.example.test/OnlinePG/OnlinePG')
  })
})

describe('leaveToPaymentGateway', () => {
  it('auto-submits POST Token form for SEP', () => {
    const submitted: Array<{ action: string, token: string }> = []
    const fakeForm = {
      method: '',
      action: '',
      acceptCharset: '',
      style: { display: '' },
      children: [] as unknown[],
      appendChild(node: { name?: string, value?: string }) {
        this.children.push(node)
        return node
      },
      setAttribute() {},
      submit() {
        const tokenInput = this.children.find((child) => (child as { name?: string }).name === 'Token') as { value?: string }
        submitted.push({ action: this.action, token: String(tokenInput?.value || '') })
      },
    }
    const fakeInput = { type: '', name: '', value: '' }
    const doc = {
      body: { appendChild(node: unknown) { return node } },
      createElement(tag: string) {
        if (tag === 'form') return fakeForm
        return { ...fakeInput }
      },
    } as unknown as Document
    const assign = vi.fn()

    const kind = leaveToPaymentGateway(
      'https://sep.shaparak.ir/OnlinePG/SendToken?token=live-token',
      { document: doc, assign },
    )

    expect(kind).toBe('sep-post')
    expect(submitted).toEqual([{ action: 'https://sep.shaparak.ir/OnlinePG/OnlinePG', token: 'live-token' }])
    expect(assign).not.toHaveBeenCalled()
  })

  it('assigns non-SEP URLs without building a form', () => {
    const assign = vi.fn()
    const kind = leaveToPaymentGateway('/payments/test-gateway?ResNum=SIM', { assign })
    expect(kind).toBe('assign')
    expect(assign).toHaveBeenCalledWith('/payments/test-gateway?ResNum=SIM')
  })

  it('falls back to GET SendToken when document is missing', () => {
    const assign = vi.fn()
    const url = 'https://sep.shaparak.ir/OnlinePG/SendToken?token=x'
    expect(leaveToPaymentGateway(url, { assign })).toBe('assign')
    expect(assign).toHaveBeenCalledWith(url)
  })
})

describe('createSepTokenForm', () => {
  it('sets POST Token field', () => {
    const created: unknown[] = []
    const doc = {
      createElement(tag: string) {
        const el = {
          tagName: tag,
          type: '',
          name: '',
          value: '',
          method: '',
          action: '',
          acceptCharset: '',
          style: { display: '' },
          children: [] as unknown[],
          appendChild(child: unknown) {
            this.children.push(child)
            return child
          },
          setAttribute() {},
        }
        created.push(el)
        return el
      },
    } as unknown as Document
    const form = createSepTokenForm(doc, 'tok', 'https://sep.shaparak.ir/OnlinePG/OnlinePG')
    expect(form.method).toBe('POST')
    expect(form.action).toBe('https://sep.shaparak.ir/OnlinePG/OnlinePG')
    const input = (form as unknown as { children: Array<{ name: string, value: string, type: string }> }).children[0]
    expect(input).toMatchObject({ type: 'hidden', name: 'Token', value: 'tok' })
  })
})

describe('gatewayStallError', () => {
  it('exposes Farsi statusMessage for the sheet', () => {
    const err = gatewayStallError('اتصال به درگاه پرداخت برقرار نشد. دوباره تلاش کنید.')
    expect(err.data.statusMessage).toContain('درگاه')
    expect(err.name).toBe('GatewayRedirectStalledError')
  })
})
