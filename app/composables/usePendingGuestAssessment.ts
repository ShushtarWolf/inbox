import {
  buildWizardAnswersFromPending,
  clearPendingGuestSkillAssessment,
  readPendingGuestSkillAssessment,
} from '#shared/guestSkillAssessment.ts'

export function usePendingGuestAssessment() {
  const { loggedIn } = useAuth()
  const { t } = useI18n()
  const { fetchErrorMessage } = useFetchError()
  const savedNotice = useState<string | null>('guestSkillSavedNotice', () => null)
  const flushError = useState<string | null>('guestSkillFlushError', () => null)
  const flushing = ref(false)

  async function resolveSportId(slug: string): Promise<string | null> {
    const sports = await $fetch<Array<{ id: string, slug: string }>>('/api/sports')
    return sports.find((s) => s.slug === slug)?.id || null
  }

  async function flushPendingGuestAssessment() {
    if (!import.meta.client || !loggedIn.value || flushing.value) return false
    const pending = readPendingGuestSkillAssessment()
    if (!pending) return false

    flushing.value = true
    flushError.value = null
    try {
      const sportId = await resolveSportId(pending.sportSlug)
      if (!sportId) {
        flushError.value = t('skillAssess.sportNotFound')
        return false
      }
      await $fetch('/api/athlete/skill-ratings/assess', {
        method: 'POST',
        body: {
          sportId,
          answers: buildWizardAnswersFromPending(pending),
        },
      })
      clearPendingGuestSkillAssessment()
      savedNotice.value = t('skillAssess.pendingSaved')
      return true
    } catch (err) {
      flushError.value = fetchErrorMessage(err)
      return false
    } finally {
      flushing.value = false
    }
  }

  function dismissSavedNotice() {
    savedNotice.value = null
  }

  return {
    savedNotice,
    flushError,
    flushing,
    flushPendingGuestAssessment,
    dismissSavedNotice,
  }
}