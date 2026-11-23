<script setup lang="ts">
const props = withDefaults(defineProps<{
  compact?: boolean
  showAddClub?: boolean
}>(), {
  compact: false,
  showAddClub: true,
})

const { t } = useI18n()
const {
  memberships,
  selectedClubId,
  switching,
  showSwitcher,
  clubOptionLabel,
  onSelectChange,
  addClubPath,
} = useOwnerClubSwitcher()

const canShow = computed(() => showSwitcher.value || props.showAddClub)
</script>

<template>
  <div v-if="canShow" class="owner-club-switcher" :class="compact ? 'owner-club-switcher--compact' : ''">
    <span class="venus-icon-wrap venus-icon-wrap-sm bg-brand-primary-soft text-brand-primary shrink-0">
      <AppIcon name="storefront" size="sm" />
    </span>
    <div class="flex min-w-0 flex-1 flex-col gap-1 text-xs font-bold text-brand-gray-600">
      <template v-if="showSwitcher">
        <label :for="compact ? 'owner-club-switcher-compact' : 'owner-club-switcher'">{{ t('owner.activeClub') }}</label>
        <select
          :id="compact ? 'owner-club-switcher-compact' : 'owner-club-switcher'"
          :value="selectedClubId || ''"
          class="neo-select"
          :disabled="switching"
          @change="onSelectChange(($event.target as HTMLSelectElement).value)"
        >
          <option v-for="item in memberships" :key="item.club.id" :value="item.club.id">
            {{ clubOptionLabel(item) }}
          </option>
        </select>
      </template>
      <NuxtLink
        v-if="showAddClub"
        :to="addClubPath"
        class="text-start text-xs font-bold text-brand-primary no-underline"
      >
        {{ t('owner.addClubCta') }}
      </NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.owner-club-switcher {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  margin: 0.75rem 1rem;
  padding: 0.75rem;
  border: 1px solid rgba(44, 44, 42, 0.08);
  background: #fff;
}
.owner-club-switcher--compact {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
}
</style>