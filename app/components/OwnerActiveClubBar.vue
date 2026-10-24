<script setup lang="ts">
/** Design rclubcard — active club context on owner subpages (CRM, settings, …). */
const { t } = useI18n()
const { localizedField } = useLocalizedField()
const { user } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })

const memberships = computed(() => user.value?.memberships || [])

watch(
  memberships,
  (list) => {
    if (!list.length) return
    if (!selectedClubId.value || !list.some((m) => m.club.id === selectedClubId.value)) {
      selectedClubId.value = list[0]!.club.id
    }
  },
  { immediate: true },
)

const activeMembership = computed(() =>
  memberships.value.find((m) => m.club.id === selectedClubId.value) || memberships.value[0],
)

const clubName = computed(() =>
  activeMembership.value
    ? localizedField(activeMembership.value.club, 'nameFa', 'nameEn')
    : t('owner.pendingClubFallback'),
)

const showSwitcher = computed(() => memberships.value.length > 1)
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
        <select id="owner-active-club-bar-select" v-model="selectedClubId" class="owner-rclubcard-select">
          <option v-for="item in memberships" :key="item.club.id" :value="item.club.id">
            {{ localizedField(item.club, 'nameFa', 'nameEn') }}
          </option>
        </select>
      </template>
      <b v-else class="owner-rclubcard-name">{{ clubName }}</b>
    </div>
    <AppIcon v-if="showSwitcher" name="expand_more" size="sm" class="owner-rclubcard-chevron shrink-0 text-brand-gray-600" aria-hidden="true" />
  </div>
</template>
