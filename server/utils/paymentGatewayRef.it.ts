/**
 * Disposable Postgres only. Point DATABASE_URL at a local database that already
 * has `prisma migrate deploy` applied. Never use a production URL.
 *
 *   DATABASE_URL=postgresql://inbox_it:inbox_it@127.0.0.1:5432/inbox_payment_it \
 *     npx vitest run --config vitest.money.config.ts server/utils/paymentGatewayRef.it.ts
 */
import { Prisma } from '@prisma/client'
import { afterAll, describe, expect, it } from 'vitest'
import { claimPaymentPaid } from './paymentClaim'
import { prisma } from './prisma'

const created: string[] = []

async function makePayment(data: {
  status?: 'PENDING_ONLINE' | 'FAILED' | 'REFUNDED' | 'PAID'
  metadataJson?: string
  providerRef?: string
}) {
  const row = await prisma.payment.create({
    data: {
      amount: 100_000,
      method: 'IPG',
      status: data.status || 'PENDING_ONLINE',
      provider: 'sep',
      providerRef: data.providerRef,
      metadataJson: data.metadataJson,
    },
  })
  created.push(row.id)
  return row
}

describe('payment gatewayRef on isolated Postgres', () => {
  afterAll(async () => {
    if (created.length) {
      await prisma.moneyJob.deleteMany({ where: { paymentId: { in: created } } })
      await prisma.payment.deleteMany({ where: { id: { in: created } } })
    }
    await prisma.$disconnect()
  })

  it('rejects a second payment that reuses a bank RefNum', async () => {
    const first = await makePayment({ providerRef: `INB-${Date.now()}-a` })
    const second = await makePayment({ providerRef: `INB-${Date.now()}-b` })
    await prisma.payment.update({ where: { id: first.id }, data: { gatewayRef: 'shared-bank-ref' } })
    await expect(prisma.payment.update({
      where: { id: second.id },
      data: { gatewayRef: 'shared-bank-ref' },
    })).rejects.toMatchObject({ code: 'P2002' })
  })

  it('claims PAID from PENDING and refuses to overwrite REFUNDED', async () => {
    const pending = await makePayment({ providerRef: `INB-pay-${Date.now()}` })
    const refunded = await makePayment({ status: 'REFUNDED', providerRef: `INB-ref-${Date.now()}` })

    const paid = await prisma.$transaction((tx) => claimPaymentPaid(tx, pending.id, {
      gatewayRef: `bank-${pending.id}`,
      metadataJson: JSON.stringify({ refNum: `bank-${pending.id}`, verifiedAmountRials: 1_000_000 }),
    }))
    expect(paid.claimed).toBe(true)
    expect(paid.payment.status).toBe('PAID')
    expect(paid.payment.gatewayRef).toBe(`bank-${pending.id}`)

    const again = await prisma.$transaction((tx) => claimPaymentPaid(tx, pending.id, {
      gatewayRef: `bank-${pending.id}`,
      metadataJson: paid.payment.metadataJson || '{}',
    }))
    expect(again.claimed).toBe(false)
    expect(again.payment.status).toBe('PAID')

    const blocked = await prisma.$transaction((tx) => claimPaymentPaid(tx, refunded.id, {
      gatewayRef: `bank-${refunded.id}`,
      metadataJson: '{}',
    }))
    expect(blocked.claimed).toBe(false)
    expect(blocked.payment.status).toBe('REFUNDED')
    expect(blocked.payment.gatewayRef).toBeNull()
  })

  it('backfill keeps a unique historical ref and leaves duplicates null', async () => {
    const uniqueRef = `hist-${Date.now()}-only`
    const dupRef = `hist-${Date.now()}-dup`
    const only = await makePayment({
      status: 'PAID',
      metadataJson: JSON.stringify({ refNum: uniqueRef }),
      providerRef: `INB-${uniqueRef}`,
    })
    const dupA = await makePayment({
      status: 'PAID',
      metadataJson: JSON.stringify({ refNum: dupRef }),
      providerRef: `INB-${dupRef}-a`,
    })
    const dupB = await makePayment({
      status: 'PAID',
      metadataJson: JSON.stringify({ refNum: dupRef }),
      providerRef: `INB-${dupRef}-b`,
    })

    await prisma.$executeRaw`
      WITH extracted AS (
        SELECT
          id,
          NULLIF(BTRIM(substring("metadataJson" from '"refNum"[[:space:]]*:[[:space:]]*"([^"]+)"')), '') AS ref
        FROM "Payment"
        WHERE provider = 'sep' AND "metadataJson" IS NOT NULL AND "gatewayRef" IS NULL
      ),
      unique_refs AS (
        SELECT ref FROM extracted WHERE ref IS NOT NULL GROUP BY ref HAVING COUNT(*) = 1
      )
      UPDATE "Payment" AS p
      SET "gatewayRef" = e.ref
      FROM extracted AS e
      JOIN unique_refs AS u ON u.ref = e.ref
      WHERE p.id = e.id AND p."gatewayRef" IS NULL
    `

    const rows = await prisma.payment.findMany({
      where: { id: { in: [only.id, dupA.id, dupB.id] } },
      select: { id: true, gatewayRef: true },
    })
    const byId = new Map(rows.map((row) => [row.id, row.gatewayRef]))
    expect(byId.get(only.id)).toBe(uniqueRef)
    expect(byId.get(dupA.id)).toBeNull()
    expect(byId.get(dupB.id)).toBeNull()
  })

  it('a parallel claim of the same RefNum cannot both succeed', async () => {
    const a = await makePayment({ providerRef: `INB-race-a-${Date.now()}` })
    const b = await makePayment({ providerRef: `INB-race-b-${Date.now()}` })
    const ref = `race-${Date.now()}`
    const results = await Promise.allSettled([
      prisma.$transaction((tx) => claimPaymentPaid(tx, a.id, {
        gatewayRef: ref,
        metadataJson: JSON.stringify({ refNum: ref }),
      })),
      prisma.$transaction((tx) => claimPaymentPaid(tx, b.id, {
        gatewayRef: ref,
        metadataJson: JSON.stringify({ refNum: ref }),
      })),
    ])
    const fulfilled = results.filter((row) => row.status === 'fulfilled')
    const rejected = results.filter((row) => row.status === 'rejected')
    expect(fulfilled).toHaveLength(1)
    expect(rejected).toHaveLength(1)
    const reason = (rejected[0] as PromiseRejectedResult).reason
    expect(reason).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    expect((reason as { code?: string }).code).toBe('P2002')
    const winners = await prisma.payment.count({ where: { gatewayRef: ref, status: 'PAID' } })
    expect(winners).toBe(1)
  })
})
