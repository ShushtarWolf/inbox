import { buildAthleteSkillProfile } from '../../utils/athleteSkillProfile'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  return buildAthleteSkillProfile(user.id)
})