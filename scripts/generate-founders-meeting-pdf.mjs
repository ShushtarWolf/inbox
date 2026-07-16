/**
 * Generates docs/founders-meeting-fa.pdf (RTL Persian founders meeting brief).
 * Requires: python3, playwright chromium
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pyScript = join(__dirname, 'generate-founders-meeting-pdf.py')
const result = spawnSync('python3', [pyScript], { stdio: 'inherit' })
process.exit(result.status ?? 1)
