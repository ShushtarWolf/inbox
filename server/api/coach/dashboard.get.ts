import { addDaysToIsoDate } from '#shared/localDate.ts'
import { getWalletWithdrawableBalance } from '../../utils/wallet'

function monthKey(isoDate: string) {
  return isoDate.slice(0, 7)
}

function addMonthsKey(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number)
  const d = new Date(Date.UTC(y!, m! - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default defineEventHandler(async (event) => {
  assertCoachProductEnabled(event)
  const user = await requireRole(event, 'COACH')
  const coach = await prisma.coach.findUnique({
    where: { userId: user.id },
    include: { club: { select: { nameFa: true, nameEn: true } } },
  })
  if (!coach) throw createError({ statusCode: 404, statusMessage: 'Coach profile not found' })

  const today = todayDateStr()
  const thisMonth = monthKey(today)

  const sessions = await prisma.coachSession.findMany({
    where: { coachId: coach.id, date: today },
    include: {
      athlete: { select: { name: true, phone: true } },
      courtBooking: {
        include: {
          slot: {
            include: {
              court: {
                include: { club: { select: { nameFa: true, nameEn: true } } },
              },
            },
          },
        },
      },
    },
    orderBy: { startTime: 'asc' },
  })

  const upcomingSessions = await prisma.coachSession.findMany({
    where: { coachId: coach.id, date: { gt: today }, status: { not: 'CANCELLED' } },
    include: { athlete: { select: { name: true, phone: true } } },
    orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    take: 8,
  })

  const since90 = addDaysToIsoDate(today, -90)
  const recentSessions = await prisma.coachSession.findMany({
    where: {
      coachId: coach.id,
      status: { not: 'CANCELLED' },
      date: { gte: since90 },
    },
    select: { athleteId: true, date: true, price: true, paymentStatus: true },
  })

  const activeStudents = new Set(recentSessions.map((s) => s.athleteId)).size

  const monthSessions = await prisma.coachSession.findMany({
    where: {
      coachId: coach.id,
      status: { not: 'CANCELLED' },
      date: { startsWith: thisMonth },
    },
    select: { price: true, paymentStatus: true },
  })
  const monthlyRevenue = monthSessions.reduce((sum, s) => sum + (s.price || 0), 0)

  const prevMonth = addMonthsKey(thisMonth, -1)
  const prevMonthSessions = await prisma.coachSession.findMany({
    where: {
      coachId: coach.id,
      status: { not: 'CANCELLED' },
      date: { startsWith: prevMonth },
    },
    select: { price: true },
  })
  const prevMonthlyRevenue = prevMonthSessions.reduce((sum, s) => sum + (s.price || 0), 0)
  const monthlyRevenueDeltaPct = prevMonthlyRevenue > 0
    ? Math.round(((monthlyRevenue - prevMonthlyRevenue) / prevMonthlyRevenue) * 100)
    : null

  const revenueMonths: Array<{ key: string; amount: number }> = []
  for (let i = 5; i >= 0; i -= 1) {
    const key = addMonthsKey(thisMonth, -i)
    revenueMonths.push({ key, amount: 0 })
  }
  const sixMonthStart = `${revenueMonths[0]!.key}-01`
  const paidInRange = await prisma.coachSession.findMany({
    where: {
      coachId: coach.id,
      status: { not: 'CANCELLED' },
      date: { gte: sixMonthStart },
    },
    select: { date: true, price: true },
  })
  for (const row of paidInRange) {
    const k = monthKey(row.date)
    const bucket = revenueMonths.find((m) => m.key === k)
    if (bucket) bucket.amount += row.price || 0
  }

  const sessionDatesThisMonth = [
    ...new Set(
      (
        await prisma.coachSession.findMany({
          where: {
            coachId: coach.id,
            status: { not: 'CANCELLED' },
            date: { startsWith: thisMonth },
          },
          select: { date: true },
        })
      ).map((s) => s.date),
    ),
  ]

  const withdrawableBalance = await getWalletWithdrawableBalance(user.id)
  const recentWithdraws = await prisma.userWithdrawRequest.findMany({
    where: { userId: user.id, status: { in: ['PAID', 'PENDING'] } },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { amount: true, createdAt: true, status: true },
  })

  return {
    coach: {
      id: coach.id,
      isBookable: coach.isBookable,
      approvalStatus: coach.approvalStatus,
      approvalNote: coach.approvalNote,
    },
    sessions,
    upcomingSessions,
    stats: {
      todayCount: sessions.length,
      upcomingCount: upcomingSessions.length,
      activeStudents,
      monthlyRevenue,
      monthlyRevenueDeltaPct,
      pendingSettlement: withdrawableBalance,
    },
    revenueMonths,
    sessionDatesThisMonth,
    recentWithdraws,
  }
})
