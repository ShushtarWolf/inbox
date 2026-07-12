export function schedulerStubResult(pending: number) {
  return {
    processed: 0,
    pending,
    note: 'Scheduler stub — campaigns remain SCHEDULED until a worker is added',
  }
}

/** Stub scheduler — live gateway delivery and cron worker not implemented. */
export async function processScheduledCampaigns() {
  const pending = await prisma.campaign.count({ where: { status: 'SCHEDULED' } })
  return schedulerStubResult(pending)
}
