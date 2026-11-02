import { runMoneyAuditAndAlert } from '../../../utils/moneyAudit'

export default defineEventHandler(async (event) => {
  requireAdminSecret(event)
  const query = getQuery(event)
  const notify = query.notify !== '0' && query.notify !== 'false'
  return runMoneyAuditAndAlert({ notify })
})
