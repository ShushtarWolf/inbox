import {
  resolveAloPlayCredentials,
  sessionCacheTtlMs,
  type AloPlayCredentials,
  type AloPlaySession,
} from '../../../../lib/aloplaySession'
import {
  fetchAloPlayApiJson,
  getOrCreateAloPlaySession,
  loginAloPlayWithFetch,
  type AloPlaySessionCache,
} from '../../../../lib/aloplaySessionClient'
import { readCached, writeCached } from '../cache'

const SESSION_CACHE_KEY = 'ext-cal:aloplay-session'

function createSessionCache(): AloPlaySessionCache {
  return {
    async read() {
      return readCached<AloPlaySession>(SESSION_CACHE_KEY)
    },
    async write(session, ttlMs) {
      await writeCached(SESSION_CACHE_KEY, session, ttlMs)
    },
    async clear() {
      const storage = useStorage('cache')
      await storage.removeItem(SESSION_CACHE_KEY)
    },
  }
}

export async function getAloPlaySession(): Promise<AloPlaySession | null> {
  const credentials = resolveAloPlayCredentials()
  if (!credentials) return null
  const result = await getOrCreateAloPlaySession(fetch, credentials, createSessionCache())
  return result.session ?? null
}

export async function clearAloPlaySession(): Promise<void> {
  await createSessionCache().clear()
}

export async function loginAloPlay(
  credentials: AloPlayCredentials,
): Promise<{ session?: AloPlaySession; error?: string }> {
  return loginAloPlayWithFetch(fetch, credentials)
}

export async function fetchAloPlayWithSession(
  path: string,
  query: Record<string, string | number>,
  opts: { requireAuth?: boolean } = {},
): Promise<{ payload: unknown | null; error?: string; usedAuth: boolean }> {
  const credentials = resolveAloPlayCredentials()
  return fetchAloPlayApiJson(fetch, path, query, {
    requireAuth: opts.requireAuth ?? false,
    credentials,
    cache: credentials ? createSessionCache() : null,
  })
}

export { sessionCacheTtlMs }
