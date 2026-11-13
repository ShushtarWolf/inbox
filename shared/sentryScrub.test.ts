import { describe, expect, it } from 'vitest'
import { scrubSentryEvent, shouldDropSentryEvent } from './sentryScrub'

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

    expect(event?.request?.headers?.Cookie).toBe('[Filtered]')
    expect(event?.request?.headers?.Authorization).toBe('[Filtered]')
    expect(event?.request?.headers?.['X-Admin-Secret']).toBe('[Filtered]')
    expect(event?.request?.headers?.['content-type']).toBe('application/json')
    expect(event?.request?.cookies).toBeUndefined()
  })

  it('returns event unchanged when request is missing', () => {
    const event = { message: 'x' }
    expect(scrubSentryEvent(event)).toBe(event)
  })

  it('drops expected OTP / rate-limit rejects', () => {
    expect(
      scrubSentryEvent({
        exception: { values: [{ type: 'Error', value: 'OTP expired or missing' }] },
      }),
    ).toBeNull()
    expect(
      shouldDropSentryEvent({
        exception: { values: [{ type: 'Error', value: 'errors.rateLimited' }] },
      }),
    ).toBe(true)
  })

  it('drops scanner Page not found probes', () => {
    expect(
      scrubSentryEvent({
        exception: { values: [{ type: 'Error', value: 'Page not found: /.env' }] },
      }),
    ).toBeNull()
    expect(
      shouldDropSentryEvent({
        tags: [{ key: 'path', value: '/wp-login.php' }],
        exception: { values: [{ type: 'Error', value: 'Page not found: /wp-login.php' }] },
      }),
    ).toBe(true)
  })

  it('keeps real product errors', () => {
    const event = {
      exception: { values: [{ type: 'Error', value: 'CLUB_NOT_ACTIVE' }] },
      tags: [{ key: 'path', value: '/api/owner/calendar-sources' }],
    }
    expect(scrubSentryEvent(event)).toBe(event)
  })
})
