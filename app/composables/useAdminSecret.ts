const STORAGE_KEY = 'inbox-admin-secret'

export function useAdminSecret() {
  const secret = useState<string>('admin-secret', () => '')
  /** Set when an API rejects the secret (403) so the gate can show invalidSecret. */
  const secretRejected = useState<boolean>('admin-secret-rejected', () => false)
  const hydrated = useState<boolean>('admin-secret-hydrated', () => false)

  function setSecret(value: string) {
    secret.value = value.trim()
    if (secret.value) secretRejected.value = false
    if (import.meta.client) {
      if (secret.value) sessionStorage.setItem(STORAGE_KEY, secret.value)
      else sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  function clearSecret() {
    setSecret('')
  }

  /** Clear secret and mark gate to show invalid-secret copy (403 path). */
  function rejectSecret() {
    secretRejected.value = true
    secret.value = ''
    if (import.meta.client) sessionStorage.removeItem(STORAGE_KEY)
  }

  /** Intentional lock from nav logout — no invalid-secret banner. */
  function lockSecret() {
    secretRejected.value = false
    clearSecret()
  }

  function adminHeaders(): Record<string, string> {
    return secret.value ? { 'x-admin-secret': secret.value } : {}
  }

  async function adminFetch<T>(url: string, opts: { method?: string; body?: unknown } = {}) {
    try {
      return await $fetch<T>(url, {
        method: opts.method,
        body: opts.body,
        headers: adminHeaders(),
      })
    } catch (err: unknown) {
      const status = (err as { statusCode?: number })?.statusCode
      if (status === 403) rejectSecret()
      throw err
    }
  }

  onMounted(async () => {
    if (hydrated.value || !import.meta.client) return
    const alreadyInMemory = Boolean(secret.value)
    hydrated.value = true
    if (!secret.value) {
      const stored = sessionStorage.getItem(STORAGE_KEY) || ''
      if (stored) setSecret(stored)
    }
    // Only re-validate when restoring from sessionStorage (not after a live gate submit).
    if (!alreadyInMemory && secret.value) {
      try {
        await adminFetch('/api/admin/overview')
      } catch {
        // 403 handled by adminFetch → rejectSecret
      }
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
