import { expireUnfilledOpenMatches } from '../../../utils/openMatches'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  return expireUnfilledOpenMatches()
})