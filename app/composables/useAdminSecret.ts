const STORAGE_KEY = 'inbox-admin-secret'

export function useAdminSecret() {
  const secret = useState<string>('admin-secret', () => '')
  /** Set when an API rejects the secret (403) so the gate can show invalidSecret. */
  const secretRejected = useState<boolean>('admin-secret-rejected', () => false)
  const hydrated = useState<boolean>('admin-secret-hydrated', () => false)

  function setSecret(value: string) {
    secret.value = value.trim()
    if (secret.value) secretRejected.value = false
    // Memory-only: never persist to sessionStorage (same-origin XSS could steal it).
    if (import.meta.client) {
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore quota / private mode
      }
    }
  }

  function clearSecret() {
    setSecret('')
  }

  /** Clear secret and mark gate to show invalid-secret copy (403 path). */
  function rejectSecret() {
    secretRejected.value = true
    secret.value = ''
    if (import.meta.client) {
      try {
        sessionStorage.removeItem(STORAGE_KEY)
      } catch {
        // ignore
      }
    }
  }

  /** Intentional lock from nav logout — no invalid-secret banner. */
  function lockSecret() {
    secretRejected.value = false
    clearSecret()
  }

  function adminHeaders(): Record<string, string> {
    return secret.value ? { 'x-admin-secret': secret.value } : {}
  }

  async function adminFetch<T>(url: string, opts: { method?: string; body?: unknown; headers?: Record<string, string> } = {}) {
    try {
      return await $fetch<T>(url, {
        method: opts.method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | undefined,
        body: opts.body as Record<string, unknown> | undefined,
        headers: { ...adminHeaders(), ...opts.headers },
      })
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 403) rejectSecret()
      throw err
    }
  }

  onMounted(() => {
    if (hydrated.value || !import.meta.client) return
    hydrated.value = true
    // Drop any legacy persisted secret from older builds.
    try {
      sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // ignore
    }
  })

  return {
    secret,
    secretRejected,
    setSecret,
    clearSecret,
    rejectSecret,
    lockSecret,
    adminHeaders,
    adminFetch,
  }
}
