import { randomBytes } from 'node:crypto'

export function slugify(value: string) {
  const base = value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  return (base || 'club').slice(0, 40)
}

export async function uniqueClubSlug(name: string) {
  const base = slugify(name)
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const suffix = attempt === 0 ? randomBytes(3).toString('hex') : randomBytes(4).toString('hex')
    const slug = `${base}-${suffix}`
    const existing = await prisma.club.findUnique({ where: { slug } })
    if (!existing) return slug
  }
  return `${base}-${randomBytes(6).toString('hex')}`
}
