const DEFAULT_TTL_MS = 45_000

interface CacheEntry<T> {
  expiresAt: number
  value: T
}

export async function readCached<T>(key: string): Promise<T | null> {
  const storage = useStorage('cache')
  const entry = await storage.getItem<CacheEntry<T>>(key)
  if (!entry || entry.expiresAt <= Date.now()) return null
  return entry.value
}

export async function writeCached<T>(key: string, value: T, ttlMs = DEFAULT_TTL_MS): Promise<void> {
  const storage = useStorage('cache')
  await storage.setItem(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  } satisfies CacheEntry<T>)
}

export const EXTERNAL_CALENDAR_CACHE_TTL_MS = DEFAULT_TTL_MS
