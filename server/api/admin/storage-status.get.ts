/** Safe storage diagnostics — never returns S3 access/secret keys. */
export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const status = getStorageStatus()
  return { ok: true, ...status }
})
