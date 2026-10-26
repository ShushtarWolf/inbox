import assert from 'node:assert/strict'
import { normalizeTod, slotMatchesTod, todHourRange } from './timeOfDay.ts'

assert.equal(normalizeTod('evening'), 'evening')
assert.equal(normalizeTod('nope'), '')
assert.deepEqual(todHourRange('afternoon'), { start: 12, end: 17 })
assert.equal(slotMatchesTod('15:00', 'afternoon'), true)
assert.equal(slotMatchesTod('18:00', 'afternoon'), false)
assert.equal(slotMatchesTod('20:30', 'evening'), true)
assert.equal(slotMatchesTod('10:00', ''), true)
console.log('timeOfDay.test.ts: ok')
