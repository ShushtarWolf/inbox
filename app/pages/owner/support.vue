<script setup lang="ts">
/** Canva home page (29): ops guide + club contact + platform ticket. */
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
const { formatDate } = useFormatters()
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
  try {
    await $fetch('/api/support/tickets', {
      method: 'POST',
      body: {
        body: ticketBody.value,
        pageUrl: import.meta.client ? window.location.href : '/owner/support',
      },
    })
    ticketBody.value = ''
    ticketSuccess.value = t('owner.supportPage.ticketOk')
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
        <p class="text-xs text-brand-gray-500">{{ t('owner.supportPage.ticketHint') }}</p>
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
        <ul v-if="mine?.tickets?.length" class="mt-3 space-y-2">
          <li
            v-for="row in mine.tickets"
            :key="row.id"
            class="border border-brand-gray-200 p-3 text-start text-xs"
            style="border-radius: var(--sz-canva-radius);"
          >
            <p class="font-bold text-brand-navy">{{ statusLabel(row.status) }} · <span dir="ltr">{{ formatDate(row.createdAt) }}</span></p>
            <p class="mt-1 text-brand-gray-700">{{ row.body }}</p>
            <p
              v-for="msg in row.messages.filter((m) => m.fromAdmin)"
              :key="msg.id"
              class="mt-2 border-t border-brand-gray-100 pt-2 text-brand-navy"
            >
              {{ t('admin.ticketAdminReply') }}: {{ msg.body }}
            </p>
          </li>
        </ul>
      </section>

      <section class="space-y-2 text-start min-[431px]:border min-[431px]:border-brand-gray-200 min-[431px]:p-5" style="border-radius: var(--sz-canva-radius);">
        <h2 class="text-sm font-bold text-brand-gray-500">{{ t('owner.supportPage.contactTitle') }}</h2>
        <p class="text-sm text-brand-navy">
          <span class="font-bold">{{ t('common.mobile') }}:</span>
          <bdi dir="ltr" class="ms-1 tabular-nums">{{ data?.club?.phone || t('common.empty') }}</bdi>
        </p>
        <p class="text-sm text-brand-navy">
          <span class="font-bold">{{ t('common.whatsapp') }}:</span>
          <bdi dir="ltr" class="ms-1 tabular-nums">{{ data?.club?.whatsapp || t('common.empty') }}</bdi>
        </p>
        <p class="text-xs text-brand-gray-500">{{ t('owner.supportPage.contactNote') }}</p>
      </section>
      </div>
    </AppAsyncState>
  </div>
</template>
