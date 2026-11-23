<script setup lang="ts">
/** Design rclubcard — active club context on owner subpages (CRM, settings, …). */
const props = withDefaults(defineProps<{
  showAddClub?: boolean
}>(), {
  showAddClub: true,
})

const { t } = useI18n()
const { localizedField } = useLocalizedField()
const {
  memberships,
  selectedClubId,
  activeMembership,
  showSwitcher,
  clubOptionLabel,
  onSelectChange,
  switching,
  addClubPath,
} = useOwnerClubSwitcher()

const clubName = computed(() =>
  activeMembership.value
    ? localizedField(activeMembership.value.club, 'nameFa', 'nameEn')
    : t('owner.pendingClubFallback'),
)
</script>

<template>
  <div v-if="activeMembership" class="owner-rclubcard">
    <span class="owner-rclubcard-icon" aria-hidden="true">
      <AppIcon name="storefront" size="sm" />
    </span>
    <div class="min-w-0 flex-1 text-start">
      <small class="owner-rclubcard-eyebrow">{{ t('owner.activeClub') }}</small>
      <template v-if="showSwitcher">
        <label class="sr-only" for="owner-active-club-bar-select">{{ t('owner.activeClub') }}</label>
        <select
          id="owner-active-club-bar-select"
          :value="selectedClubId || ''"
          class="owner-rclubcard-select"
          :disabled="switching"
          @change="onSelectChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="item in memberships" :key="item.club.id" :value="item.club.id">
            {{ clubOptionLabel(item) }}
          </option>
        </select>
      </template>
      <b v-else class="owner-rclubcard-name">{{ clubName }}</b>
    </div>
    <AppIcon v-if="showSwitcher" name="expand_more" size="sm" class="owner-rclubcard-chevron shrink-0 text-brand-gray-600" aria-hidden="true" />
    <NuxtLink
      v-if="props.showAddClub"
      :to="addClubPath"
      class="owner-rclubcard-add ms-auto text-[10px] font-bold text-brand-primary no-underline"
    >
      {{ t('owner.addClubCtaShort') }}
    </NuxtLink>
  </div>
</template>
