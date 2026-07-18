export function usePilotFlags() {
  const config = useRuntimeConfig()
  const pilotNoCoach = computed(() => Boolean(config.public.pilotNoCoach))
  return { pilotNoCoach }
}
