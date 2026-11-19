import { describe, expect, it } from 'vitest'
import { isStaleChunkLoadError } from './chunkLoadError'

describe('isStaleChunkLoadError', () => {
  it('detects Vite dynamic import failures', () => {
    expect(isStaleChunkLoadError({
      message: 'Failed to fetch dynamically imported module: https://inboxs.ir/_nuxt/Clubs.abcd.js',
    })).toBe(true)
  })

  it('detects legacy webpack chunk messages', () => {
    expect(isStaleChunkLoadError({ message: 'Loading chunk 42 failed.' })).toBe(true)
  })

  it('detects Safari module script errors', () => {
    expect(isStaleChunkLoadError({ message: 'Importing a module script failed.' })).toBe(true)
  })

  it('ignores generic server 500 copy', () => {
    expect(isStaleChunkLoadError({
      statusCode: 500,
      message: 'Internal Server Error',
    } as { message?: string })).toBe(false)
  })

  it('ignores empty errors', () => {
    expect(isStaleChunkLoadError(undefined)).toBe(false)
    expect(isStaleChunkLoadError({})).toBe(false)
  })
})