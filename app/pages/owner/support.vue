<script setup lang="ts">
/** Canva home page (29): ops guide + club contact + platform ticket. */
import { openTicketId } from '#shared/supportTicket.ts'

definePageMeta({ layout: 'dashboard-owner', middleware: ['auth', 'role'], role: 'CLUB_ADMIN' , ssr: false})

type OwnerSettingsClub = {
  phone?: string | null
  whatsapp?: string | null
}

type OwnerSettingsResponse = {
  club?: OwnerSettingsClub
}

type OwnerSmsStatusResponse = {
  smsMode?: string
  smsPhase?: string
  multiReady?: boolean
}

const { t } = useI18n()
const { formatDate, formatPhone } = useFormatters()
const { fetchErrorMessage } = useFetchError()
const { data, pending, error, refresh } = await useAuthedFetch<OwnerSettingsResponse>('/api/owner/settings')
const { data: smsStatus, refresh: refreshSmsStatus } = await useAuthedFetch<OwnerSmsStatusResponse>('/api/owner/sms-status')
const { data: mine, refresh: refreshMine } = await useAuthedFetch<{
  tickets: {
    id: string
    status: string
    body: string
    createdAt: string
    messages: { id: string; body: string; fromAdmin: boolean; createdAt: string }[]
  }[]
}>('/api/support/mine')
useOwnerClubRefresh(() => {
  refresh()
  refreshSmsStatus()
})

const liveSms = computed(() =>
  smsStatus.value?.smsMode === 'live'
  && smsStatus.value?.smsPhase === 'MULTI'
  && Boolean(smsStatus.value?.multiReady),
)

const ticketBody = ref('')
const ticketError = ref('')
const ticketSuccess = ref('')
const sending = ref(false)
const forceNew = ref(false)

type TicketRow = NonNullable<typeof mine.value>['tickets'][number]

const continueTicketId = computed(() =>
  openTicketId(
    (mine.value?.tickets ?? []).map((row) => ({ id: row.id, status: row.status })),
    forceNew.value,
  ),
)

function threadMessages(row: TicketRow) {
  if (row.messages.length) return row.messages
  return [{ id: row.id, body: row.body, fromAdmin: false, createdAt: row.createdAt }]
}

function statusLabel(status: string) {
  const key = `admin.ticketStatus.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

async function submitTicket() {
  ticketError.value = ''
  ticketSuccess.value = ''
  if (ticketBody.value.trim().length < 10) {
    ticketError.value = t('owner.supportPage.ticketNeedBody')
    return
  }
  sending.value = true
  const continuing = continueTicketId.value
  try {
    if (continuing) {
      await $fetch(`/api/support/tickets/${continuing}/reply`, {
        method: 'POST',
        body: { body: ticketBody.value },
      })
    } else {
      await $fetch('/api/support/tickets', {
        method: 'POST',
        body: {
          body: ticketBody.value,
          pageUrl: import.meta.client ? window.location.href : '/owner/support',
        },
      })
      forceNew.value = false
    }
    ticketBody.value = ''
    ticketSuccess.value = t(continuing ? 'owner.supportPage.replyOk' : 'owner.supportPage.ticketOk')
    await refreshMine()
  } catch (err: unknown) {
    ticketError.value = fetchErrorMessage(err, t('owner.supportPage.ticketFail'))
  } finally {
    sending.value = false
  }
}
</script>

<template>
  <div class="venus-page-stack">
    <CanvaSubpageHeader to="/owner/calendar?more=1" :title="t('owner.support')" />

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <div class="canva-support-wide">
      <section class="space-y-3 text-start min-[431px]:border min-[431px]:border-brand-gray-200 min-[431px]:p-5" style="border-radius: var(--sz-canva-radius);">
        <h2 class="text-sm font-bold text-brand-gray-500">{{ t('owner.supportPage.operations') }}</h2>
        <ul class="list-disc space-y-2 pe-4 text-sm text-brand-navy marker:text-brand-gray-400">
          <li>{{ t('owner.supportPage.calendarHelp') }}</li>
          <li>{{ t('owner.supportPage.paymentHelp') }}</li>
          <li>{{ liveSms ? t('owner.supportPage.crmHelpLive') : t('owner.supportPage.crmHelp') }}</li>
        </ul>
      </section>

      <section class="space-y-2 text-start min-[431px]:border min-[431px]:border-brand-gray-200 min-[431px]:p-5" style="border-radius: var(--sz-canva-radius);">
        <h2 class="text-sm font-bold text-brand-gray-500">{{ t('owner.supportPage.ticketTitle') }}</h2>
        <p class="text-xs text-brand-gray-500">
          {{ continueTicketId ? t('owner.supportPage.continueHint') : t('owner.supportPage.ticketHint') }}
        </p>
        <button
          v-if="continueTicketId"
          type="button"
          class="text-xs font-bold text-brand-navy underline"
          @click="forceNew = true"
        >
          {{ t('owner.supportPage.newTicket') }}
        </button>
        <button
          v-else-if="forceNew"
          type="button"
          class="text-xs font-bold text-brand-navy underline"
          @click="forceNew = false"
        >
          {{ t('owner.supportPage.continueSame') }}
        </button>
        <form class="space-y-2" @submit.prevent="submitTicket">
          <textarea
            v-model="ticketBody"
            class="neo-input"
            rows="4"
            :placeholder="t('owner.supportPage.ticketPlaceholder')"
          />
          <p v-if="ticketError" class="text-xs font-bold text-brand-primary">{{ ticketError }}</p>
          <p v-else-if="ticketSuccess" class="text-xs font-bold text-brand-navy">{{ ticketSuccess }}</p>
          <button type="submit" class="canva-cta w-full" :disabled="sending">
            {{ sending ? t('common.loading') : t('common.send') }}
          </button>
        </form>
        <ul v-if="mine?.tickets?.length" class="mt-4 flex flex-col gap-4">
          <li
            v-for="row in mine.tickets"
            :key="row.id"
            class="border bg-white p-3 text-start"
            :class="continueTicketId === row.id ? 'border-brand-navy' : 'border-brand-gray-300'"
            style="border-radius: var(--sz-canva-radius);"
          >
            <p class="text-xs font-bold text-brand-navy">
              {{ statusLabel(row.status) }}
              · <span dir="ltr">{{ formatDate(row.createdAt) }}</span>
            </p>
            <p v-if="continueTicketId === row.id" class="mt-1 text-xs font-bold text-brand-primary">
              {{ t('owner.supportPage.currentThread') }}
            </p>
            <div class="mt-3 flex flex-col gap-2">
              <div
                v-for="msg in threadMessages(row)"
                :key="msg.id"
                class="border p-2 text-xs"
                :class="msg.fromAdmin ? 'border-brand-gray-200 bg-brand-gray-50' : 'border-transparent bg-brand-gray-50/40'"
                style="border-radius: 2px;"
              >
                <p class="font-bold text-brand-gray-500">
                  {{ msg.fromAdmin ? t('admin.ticketAdminReply') : t('owner.supportPage.you') }}
                  · <span dir="ltr">{{ formatDate(msg.createdAt) }}</span>
                </p>
                <p class="mt-1 whitespace-pre-wrap text-brand-navy">{{ msg.body }}</p>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section class="space-y-2 text-start min-[431px]:border min-[431px]:border-brand-gray-200 min-[431px]:p-5" style="border-radius: var(--sz-canva-radius);">
        <h2 class="text-sm font-bold text-brand-gray-500">{{ t('owner.supportPage.contactTitle') }}</h2>
        <p class="text-sm text-brand-navy">
          <span class="font-bold">{{ t('common.mobile') }}:</span>
          <bdi dir="ltr" class="ms-1 tabular-nums">{{ data?.club?.phone ? formatPhone(data.club.phone) : t('common.empty') }}</bdi>
        </p>
        <p class="text-sm text-brand-navy">
          <span class="font-bold">{{ t('common.whatsapp') }}:</span>
          <bdi dir="ltr" class="ms-1 tabular-nums">{{ data?.club?.whatsapp ? formatPhone(data.club.whatsapp) : t('common.empty') }}</bdi>
        </p>
        <p class="text-xs text-brand-gray-500">{{ t('owner.supportPage.contactNote') }}</p>
      </section>
      </div>
    </AppAsyncState>
  </div>
</template>
