import type { UseFetchOptions } from 'nuxt/app'

export function useAuthedFetch<T>(url: string | (() => string), options: UseFetchOptions<T> = {}) {
  const requestFetch = import.meta.server ? useRequestFetch() : $fetch

  return useFetch<T>(url, {
    ...options,
    $fetch: requestFetch,
  })
}
