#!/usr/bin/env node
/**
 * Read-only CLI for series over-credit inventory (no writes).
 *   node --import tsx scripts/scan-series-over-credit-inventory.ts
 */
import { scanSeriesOverCreditInventory } from '../server/utils/scanSeriesOverCreditInventory.ts'

const onlyOver = process.argv.includes('--all') ? false : true
const limitArg = process.argv.find((a) => a.startsWith('--limit='))
const limit = limitArg ? Number(limitArg.split('=')[1]) : 200

const result = await scanSeriesOverCreditInventory({ limit, onlyOver })
console.log(JSON.stringify(result, null, 2))