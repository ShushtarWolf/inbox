import { describe, expect, it } from 'vitest'
import { classifyExternalDisplay } from './externalDisplay'

describe('classifyExternalDisplay', () => {
  it('busy_single when one source BUSY', () => {
    const info = classifyExternalDisplay({ aloplay: 'BUSY', alovarzesh: 'FREE' })
    expect(info.kind).toBe('busy_single')
    expect(info.busySources).toEqual(['aloplay'])
  })

  it('busy_multi when two sources BUSY', () => {
    const info = classifyExternalDisplay({ aloplay: 'BUSY', alovarzesh: 'BUSY' })
    expect(info.kind).toBe('busy_multi')
    expect(info.busySources).toEqual(['aloplay', 'alovarzesh'])
  })

  it('uncertain when UNKNOWN without BUSY', () => {
    const info = classifyExternalDisplay({ aloplay: 'UNKNOWN', alovarzesh: 'FREE' })
    expect(info.kind).toBe('uncertain')
  })

  it('clear when both FREE', () => {
    expect(classifyExternalDisplay({ aloplay: 'FREE', alovarzesh: 'FREE' }).kind).toBe('clear')
  })
})
