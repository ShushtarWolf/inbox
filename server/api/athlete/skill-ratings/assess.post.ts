import { parseSkillAssessmentAnswers, skillLevelPlayDescriptionFa } from '#shared/skillAssessment.ts'
import { skillLevelLabelFa } from '#shared/skillRating.ts'
import { submitSkillAssessment } from '../../../utils/skillRating'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    sportId?: string
    answers?: unknown
  }>(event)

  if (!body.sportId) throw createError({ statusCode: 400, statusMessage: 'sportId required' })
  if (!body.answers) throw createError({ statusCode: 400, statusMessage: 'answers required' })

  const parsed = parseSkillAssessmentAnswers(body.answers)
  if (!parsed) throw createError({ statusCode: 400, statusMessage: 'Invalid assessment answers' })

  const updated = await submitSkillAssessment({
    userId: user.id,
    sportId: body.sportId,
    answers: parsed.answers,
  })

  return {
    sportId: updated.sportId,
    rating: updated.rating,
    confidence: updated.confidence,
    assessmentStatus: updated.assessmentStatus,
    labelFa: skillLevelLabelFa(updated.rating),
    playDescriptionFa: skillLevelPlayDescriptionFa(updated.rating),
  }
})