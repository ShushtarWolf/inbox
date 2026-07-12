#!/usr/bin/env node
/**
 * Generates planning/3-month-launch.pdf (RTL Persian launch plan).
 * Requires: python3, fpdf2, arabic-reshaper, python-bidi
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pyScript = join(__dirname, 'generate-3month-launch-pdf.py')
const result = spawnSync('python3', [pyScript], { stdio: 'inherit' })
process.exit(result.status ?? 1)
