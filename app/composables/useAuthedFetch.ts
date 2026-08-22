type PlainFetch = (
  url: string,
  opts?: { query?: Record<string, unknown> },
) => Promise<unknown>

type AuthedFetchOptions<T> = {
  key?: string
  query?: MaybeRefOrGetter<Record<string, unknown> | undefined>
  immediate?: boolean
  watch?: false | unknown
  lazy?: boolean
  server?: boolean
  default?: () => T | null
  transform?: (input: T) => T
}

/**
 * Authenticated fetch with an explicit response type.
 * Casts each fetch impl separately so Nitro typed-routes never unify (TS2321).
 */
export function useAuthedFetch<T>(
  url: string | (() => string),
  options: AuthedFetchOptions<T> = {},
) {
  const requestFetch: PlainFetch = import.meta.server
    ? (useRequestFetch() as unknown as PlainFetch)
    : ($fetch as unknown as PlainFetch)

  const {
    key,
    query,
    immediate,
    watch: watchSources,
    lazy,
    server,
    default: defaultFactory,
    transform,
  } = options

  const resolvedKey = key
    ?? (typeof url === 'string' ? `authed:${url}` : `authed:${Math.random().toString(36).slice(2)}`)

  const asyncOpts: Record<string, unknown> = {
    server: server ?? false,
  }
  if (immediate !== undefined) asyncOpts.immediate = immediate
  if (lazy !== undefined) asyncOpts.lazy = lazy
  if (defaultFactory !== undefined) asyncOpts.default = defaultFactory
  if (transform !== undefined) asyncOpts.transform = transform
  if (watchSources === false) {
    asyncOpts.watch = []
  }
  else if (watchSources !== undefined) {
    asyncOpts.watch = watchSources
  }
  else if (query) {
    asyncOpts.watch = [query]
  }
  else if (typeof url === 'function') {
    asyncOpts.watch = [url]
  }

  return useAsyncData<T>(
    resolvedKey,
    async () => {
      const resolvedUrl = typeof url === 'string' ? url : url()
      const q = query ? toValue(query) : undefined
      return await requestFetch(resolvedUrl, { query: q }) as T
    },
    asyncOpts as never,
  )
}
