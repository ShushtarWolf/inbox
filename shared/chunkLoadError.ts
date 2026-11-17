/** True when a client-side error is from a missing/stale Vite route or CSS chunk (common after deploy). */
export function isStaleChunkLoadError(error: {
  message?: string
  statusMessage?: string
} | null | undefined): boolean {
  const raw = [error?.message, error?.statusMessage].filter(Boolean).join('\n')
  if (!raw) return false
  return (
    /Loading chunk [\w-]+ failed/i.test(raw)
    || /Failed to fetch dynamically imported module/i.test(raw)
    || /Importing a module script failed/i.test(raw)
    || /error loading dynamically imported module/i.test(raw)
    || /Unable to preload CSS/i.test(raw)
    || /ChunkLoadError/i.test(raw)
  )
}