import { requireAdminSecret } from '../../../../utils/adminAuth'
import {
  attachWithdrawPaymentDocument,
  readPaymentDocumentUpload,
} from '../../../../utils/withdrawPaymentDocuments'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'id required' })

  const file = await readPaymentDocumentUpload(event)
  const document = await attachWithdrawPaymentDocument({
    kind: 'athlete',
    requestId: id,
    ...file,
  })
  return { document }
})
