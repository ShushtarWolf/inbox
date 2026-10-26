<script setup lang="ts">
type DisplayStatus = 'paid' | 'unpaid' | 'done' | 'cancelled'

defineProps<{
  item: {
    id: string
    status: string
    title: string
    subtitle: string
    address: string
    phone: string
    timeLabel: string
    price: number
    image?: string
    equipmentLines: string[]
    seasonLabel: string
  }
  displayStatus: DisplayStatus
  statusLabel: string
  statusNote: string
  statusBadgeClass: string
  weekdayLine: string
  payAtClubNote?: string
  honestyNote?: string
  zeroRefundNote?: string
  clubRules?: string
  actionError?: string
  paying: boolean
  confirmingCancel: boolean
  cancelPending: boolean
  showPayOnline: boolean
  showPayWallet: boolean
  showReschedule: boolean
  showCancel: boolean
  showRebook: boolean
  rebookTo?: string
  cancelConfirmBody: string
  payOnlineLabel: string
}>()

const emit = defineEmits<{
  pay: [useWallet: boolean]
  reschedule: []
  cancelAsk: []
  cancelYes: []
  cancelNo: []
}>()

const { t } = useI18n()
const { formatCurrency, formatPhone, formatFaDigits } = useFormatters()
</script>

<template>
  <div class="canva-history-detail space-y-3 text-start">
    <div class="canva-history-banner">
      <img
        :src="item.image || '/placeholders/club.svg'"
        alt=""
        class="canva-history-banner-media pointer-events-none"
      >
      <div class="canva-history-banner-txt">
        <h3>{{ item.title }}</h3>
        <small v-if="item.address">
          <AppIcon name="location_on" size="sm" />
          {{ formatFaDigits(item.address) }}
        </small>
      </div>
    </div>

    <p
      class="canva-history-sh-note"
      :class="{
        'canva-history-sh-note-warn': displayStatus === 'unpaid',
        'canva-history-sh-note-ok': displayStatus === 'paid',
      }"
    >
      {{ statusNote }}
      <template v-if="item.status !== 'CANCELLED' && payAtClubNote">
        {{ payAtClubNote }}
      </template>
      <template v-if="item.status !== 'CANCELLED' && honestyNote">
        {{ honestyNote }}
      </template>
    </p>

    <div class="canva-history-sh-rows">
      <div class="canva-history-sh-row">
        <span>{{ t('athlete.historyRowDate') }}</span>
        <b>{{ weekdayLine }}</b>
      </div>
      <div class="canva-history-sh-row">
        <span>{{ t('athlete.historyRowTime') }}</span>
        <b class="tabular-nums">{{ item.timeLabel }}</b>
      </div>
      <div v-if="item.subtitle" class="canva-history-sh-row">
        <span>{{ t('athlete.historyRowCourt') }}</span>
        <b>{{ item.subtitle }}</b>
      </div>
      <div v-if="item.equipmentLines.length || item.seasonLabel" class="canva-history-sh-row">
        <span>{{ t('athlete.historyRowExtras') }}</span>
        <b>{{ [...item.equipmentLines, item.seasonLabel].filter(Boolean).join('، ') }}</b>
      </div>
      <div class="canva-history-sh-row">
        <span>{{ t('athlete.historyRowPayment') }}</span>
        <b>
          <span class="canva-history-badge" :class="statusBadgeClass">{{ statusLabel }}</span>
        </b>
      </div>
      <div v-if="item.phone" class="canva-history-sh-row">
        <span>{{ t('athlete.historyRowPhone') }}</span>
        <b>
          <a :href="`tel:${item.phone}`"><bdi dir="ltr" class="tabular-nums">{{ formatPhone(item.phone) }}</bdi></a>
        </b>
      </div>
      <div class="canva-history-sh-row">
        <span>{{ t('athlete.historyTotal') }}</span>
        <b class="tabular-nums">{{ formatCurrency(item.price) }}</b>
      </div>
    </div>

    <div v-if="clubRules">
      <h4 class="mb-1 text-[12.5px] font-bold text-brand-navy">{{ t('clubs.policies') }}</h4>
      <p class="text-[11.5px] leading-loose text-brand-gray-600">{{ clubRules }}</p>
    </div>

    <p
      v-if="item.status !== 'CANCELLED' && zeroRefundNote"
      class="canva-history-sh-note canva-history-sh-note-warn"
    >
      {{ zeroRefundNote }}
    </p>

    <p v-if="actionError" class="canva-flash-error text-start text-xs">{{ actionError }}</p>

    <template v-if="confirmingCancel">
      <p class="canva-history-sh-note canva-history-sh-note-warn">{{ cancelConfirmBody }}</p>
      <div class="canva-history-sh-actions">
        <button
          type="button"
          class="canva-gate-btn-primary"
          :class="{ 'canva-cta-busy': cancelPending }"
          :aria-busy="cancelPending"
          @click="emit('cancelYes')"
        >
          {{ cancelPending ? t('common.loading') : t('booking.confirmYes') }}
        </button>
        <button type="button" class="canva-gate-btn-secondary" :disabled="cancelPending" @click="emit('cancelNo')">
          {{ t('booking.confirmNo') }}
        </button>
      </div>
    </template>
    <div v-else class="canva-history-sh-actions">
      <button
        v-if="showPayOnline"
        type="button"
        class="canva-gate-btn-primary"
        :class="{ 'canva-cta-busy': paying }"
        :aria-busy="paying"
        @click="emit('pay', false)"
      >
        {{ payOnlineLabel }}
      </button>
      <button
        v-if="showPayWallet"
        type="button"
        class="canva-gate-btn-secondary"
        :disabled="paying"
        @click="emit('pay', true)"
      >
        {{ t('booking.payWithWallet') }}
      </button>
      <button
        v-if="showReschedule"
        type="button"
        class="canva-gate-btn-secondary"
        @click="emit('reschedule')"
      >
        {{ t('booking.reschedule') }}
      </button>
      <button
        v-if="showCancel"
        type="button"
        class="canva-history-btn-outline"
        @click="emit('cancelAsk')"
      >
        {{ t('athlete.historyCancel') }}
      </button>
      <NuxtLink
        v-if="showRebook && rebookTo"
        :to="rebookTo"
        class="canva-gate-btn-primary text-center"
      >
        {{ t('athlete.historyRebook') }}
      </NuxtLink>
    </div>
  </div>
</template>
