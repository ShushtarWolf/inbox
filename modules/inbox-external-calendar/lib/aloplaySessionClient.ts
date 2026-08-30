import {
  aloPlayFetchJson,
  buildAloPlayAuthHeaders,
  buildAloPlayPublicHeaders,
  buildAuthenticationBody,
  buildIsExsistPath,
  parseAuthenticationResponse,
  sessionCacheTtlMs,
  type AloPlayCredentials,
  type AloPlaySession,
} from './aloplaySession'

export interface AloPlaySessionCache {
  read(): Promise<AloPlaySession | null>
  write(session: AloPlaySession, ttlMs: number): Promise<void>
  clear(): Promise<void>
}

export async function loginAloPlayWithFetch(
  fetchImpl: typeof fetch,
  credentials: AloPlayCredentials,
): Promise<{ session?: AloPlaySession; error?: string }> {
  try {
    await aloPlayFetchJson(fetchImpl, buildIsExsistPath(credentials), {
      headers: buildAloPlayPublicHeaders(),
    })
  } catch {
    // IsExsist is best-effort; password login is authoritative.
  }

  try {
    const response = await aloPlayFetchJson(fetchImpl, 'v1/Authentication', {
      method: 'POST',
      headers: buildAloPlayPublicHeaders(),
      body: buildAuthenticationBody(credentials),
    })
    if (response.status === 401 || response.status === 403) {
      return { error: `Authentication HTTP ${response.status}` }
    }
    const parsed = parseAuthenticationResponse(response.payload)
    if (!parsed.session) {
      return { error: parsed.error || 'Authentication failed' }
    }
    return parsed
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Authentication request failed',
    }
  }
}

export async function getOrCreateAloPlaySession(
  fetchImpl: typeof fetch,
  credentials: AloPlayCredentials,
  cache: AloPlaySessionCache,
): Promise<{ session?: AloPlaySession; error?: string }> {
  const cached = await cache.read()
  if (cached?.token) return { session: cached }

  const login = await loginAloPlayWithFetch(fetchImpl, credentials)
  if (!login.session) return login

  await cache.write(login.session, sessionCacheTtlMs(login.session))
  return login
}

export async function fetchAloPlayApiJson(
  fetchImpl: typeof fetch,
  path: string,
  query: Record<string, string | number>,
  opts: {
    requireAuth: boolean
    credentials: AloPlayCredentials | null
    cache: AloPlaySessionCache | null
  },
): Promise<{ payload: unknown | null; error?: string; usedAuth: boolean }> {
  if (opts.requireAuth && !opts.credentials) {
    return { payload: null, error: 'AloPlay session credentials are not configured', usedAuth: false }
  }

  const attempt = async (session: AloPlaySession | null, retried: boolean) => {
    const headers = session ? buildAloPlayAuthHeaders(session.token) : buildAloPlayPublicHeaders()
    const response = await aloPlayFetchJson(fetchImpl, path, { query, headers })
    if (
      session &&
      !retried &&
      opts.credentials &&
      opts.cache &&
      (response.status === 401 || response.status === 403)
    ) {
      await opts.cache.clear()
      const relogin = await loginAloPlayWithFetch(fetchImpl, opts.credentials)
      if (relogin.session) {
        await opts.cache.write(relogin.session, sessionCacheTtlMs(relogin.session))
        return attempt(relogin.session, true)
      }
      return {
        payload: null,
        error: relogin.error || `AloPlay ${path} HTTP ${response.status}`,
        usedAuth: true,
      }
    }
    if (!response.ok) {
      return {
        payload: null,
        error: `AloPlay ${path} HTTP ${response.status}`,
        usedAuth: Boolean(session),
      }
    }
    return { payload: response.payload, usedAuth: Boolean(session) }
  }

  if (opts.requireAuth && opts.credentials && opts.cache) {
    const sessionResult = await getOrCreateAloPlaySession(fetchImpl, opts.credentials, opts.cache)
    if (!sessionResult.session) {
      return { payload: null, error: sessionResult.error || 'AloPlay login failed', usedAuth: true }
    }
    return attempt(sessionResult.session, false)
  }

  return attempt(null, false)
}
