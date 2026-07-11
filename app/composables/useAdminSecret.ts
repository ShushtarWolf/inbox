const STORAGE_KEY = 'inbox-admin-secret'

export function useAdminSecret() {
  const secret = useState<string>('admin-secret', () => '')

  onMounted(() => {
    if (!secret.value && import.meta.client) {
      secret.value = sessionStorage.getItem(STORAGE_KEY) || ''
    }
  })

  function setSecret(value: string) {
    secret.value = value.trim()
    if (import.meta.client) {
      if (secret.value) sessionStorage.setItem(STORAGE_KEY, secret.value)
      else sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  function clearSecret() {
    setSecret('')
  }

  function adminHeaders(): Record<string, string> {
    return secret.value ? { 'x-admin-secret': secret.value } : {}
  }

  async function adminFetch<T>(url: string, opts: { method?: string; body?: unknown } = {}) {
    return $fetch<T>(url, {
      method: opts.method,
      body: opts.body,
      headers: adminHeaders(),
    })
  }

  return { secret, setSecret, clearSecret, adminHeaders, adminFetch }
}
