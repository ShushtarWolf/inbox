export function usePilotFlags() {
  const config = useRuntimeConfig()
  const pilotNoCoach = computed(() => Boolean(config.public.pilotNoCoach))
  const competitionsEnabled = computed(() => Boolean(config.public.competitionsEnabled))
  const competitionsPilotClubSlug = computed(() => {
    const slug = String(config.public.competitionsPilotClubSlug || '').trim()
    return slug || null
  })

  function competitionsVisibleForClub(clubSlug: string | null | undefined) {
    if (!competitionsEnabled.value) return false
    if (!competitionsPilotClubSlug.value) return true
    return Boolean(clubSlug?.trim()) && clubSlug!.trim() === competitionsPilotClubSlug.value
  }

  return {
    pilotNoCoach,
    competitionsEnabled,
    competitionsPilotClubSlug,
    competitionsVisibleForClub,
  }
}
