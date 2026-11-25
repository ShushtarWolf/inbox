import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { staticPageRoutes, resolveDynamicRoutes } from './lib/routes.mjs'

const TOOL = path.dirname(fileURLToPath(import.meta.url))
const base = process.env.BASE_URL || 'http://localhost:3000'
const staticAdmin = staticPageRoutes().filter((r) => r.path.startsWith('/admin'))
const dynamicAdmin = (await resolveDynamicRoutes(base)).filter((r) => r.path.startsWith('/admin'))
const all = [...staticAdmin, ...dynamicAdmin]
fs.writeFileSync(path.join(TOOL, 'admin-routes.json'), JSON.stringify(all, null, 2))
console.log(all.map((r) => r.path).join('\n'))
