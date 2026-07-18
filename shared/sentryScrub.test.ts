import { describe, expect, it } from 'vitest'
import { scrubSentryEvent } from './sentryScrub'

describe('scrubSentryEvent', () => {
  it('redacts sensitive headers case-insensitively', () => {
    const event = scrubSentryEvent({
      request: {
        headers: {
          Cookie: 'session=abc',
          Authorization: 'Bearer secret',
          'X-Admin-Secret': 'ops-secret',
          'content-type': 'application/json',
        },
        cookies: { session: 'abc' },
      },
    })

    expect(event.request?.headers?.Cookie).toBe('[Filtered]')
    expect(event.request?.headers?.Authorization).toBe('[Filtered]')
    expect(event.request?.headers?.['X-Admin-Secret']).toBe('[Filtered]')
    expect(event.request?.headers?.['content-type']).toBe('application/json')
    expect(event.request?.cookies).toBeUndefined()
  })

  it('returns event unchanged when request is missing', () => {
    const event = { message: 'x' }
    expect(scrubSentryEvent(event)).toBe(event)
  })
})
