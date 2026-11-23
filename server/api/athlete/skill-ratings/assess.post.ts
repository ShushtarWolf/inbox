import type { SkillQuestionnaireAnswers } from '#shared/skillRating.ts'
import { skillLevelLabelFa } from '#shared/skillRating.ts'
import { submitSkillAssessment } from '../../../utils/skillRating'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const body = await readBody<{
    sportId?: string
    answers?: SkillQuestionnaireAnswers
  }>(event)

  if (!body.sportId) throw createError({ statusCode: 400, statusMessage: 'sportId required' })
  if (!body.answers) throw createError({ statusCode: 400, statusMessage: 'answers required' })

  const updated = await submitSkillAssessment({
    userId: user.id,
    sportId: body.sportId,
    answers: body.answers,
  })

  return {
    sportId: updated.sportId,
    rating: updated.rating,
    confidence: updated.confidence,
    assessmentStatus: updated.assessmentStatus,
    labelFa: skillLevelLabelFa(updated.rating),
  }
})