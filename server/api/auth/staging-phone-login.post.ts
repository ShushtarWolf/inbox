import { completeStagingPhoneLogin } from '../../utils/stagingPhoneLogin'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ phone?: string; returnTo?: string }>(event)
  return completeStagingPhoneLogin(event, body ?? {})
})