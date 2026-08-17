import { requireAdminSecret } from '../../../../../utils/adminAuth'
import { deleteWithdrawPaymentDocument } from '../../../../../utils/withdrawPaymentDocuments'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const id = getRouterParam(event, 'id')
  const docId = getRouterParam(event, 'docId')
  if (!id || !docId) throw createError({ statusCode: 400, statusMessage: 'id required' })

  return deleteWithdrawPaymentDocument({
    kind: 'club',
    requestId: id,
    documentId: docId,
  })
})
