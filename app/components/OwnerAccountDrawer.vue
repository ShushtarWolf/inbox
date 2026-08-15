<script setup lang="ts">
const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { user, displayName, initials, avatarUrl, logout } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const { localizedField } = useLocalizedField()

const memberships = computed(() => user.value?.memberships || [])
const activeMembership = computed(
  () => memberships.value.find((m) => m.club.id === selectedClubId.value) || memberships.value[0],
)
const roleLabel = computed(() =>
  activeMembership.value?.role === 'OWNER' ? t('owner.account.roleManager') : t('owner.account.roleStaff'),
)

const links = computed(() => [
  { to: localePath('/owner/settings'), label: t('owner.account.myProfile'), icon: 'person' },
  { to: localePath('/owner/finance'), label: t('owner.account.transactions'), icon: 'receipt_long' },
  { to: localePath('/owner/settings'), label: t('owner.settings'), icon: 'settings' },
  { to: localePath('/owner/support'), label: t('owner.support'), icon: 'headset_mic' },
])

function onNavigate() {
  emit('close')
}

async function handleLogout() {
  emit('close')
  await logout()
}

function onKeydown(event: KeyboardEvent) {
  if (props.open && event.key === 'Escape') {
    event.preventDefault()
    emit('close')
  }
}

watch(() => props.open, (isOpen) => {
  if (!import.meta.client) return
  document.body.style.overflow = isOpen ? 'hidden' : ''
})

onMounted(() => {
  if (import.meta.client) document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (import.meta.client) {
    document.removeEventListener('keydown', onKeydown)
    document.body.style.overflow = ''
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="canva-account-drawer-overlay"
      role="presentation"
      @click.self="emit('close')"
    >
      <aside
        class="canva-account-drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="t('owner.account.title')"
        @click.stop
      >
        <div class="canva-account-drawer-head">
          <div class="canva-owner-avatar canva-owner-avatar-lg" aria-hidden="true">
            <img v-if="avatarUrl" :src="avatarUrl" alt="" class="h-full w-full object-cover">
            <span v-else>{{ initials }}</span>
          </div>
          <div class="min-w-0 text-start">
            <p class="truncate text-sm font-bold text-brand-navy">{{ displayName }}</p>
            <p class="mt-0.5 text-xs font-bold text-brand-gray-500">{{ roleLabel }}</p>
          </div>
        </div>

        <label v-if="memberships.length > 1" class="canva-account-drawer-clubs">
          <span class="text-[11px] font-bold text-brand-gray-500">{{ t('owner.account.myClubs') }}</span>
          <select v-model="selectedClubId" class="canva-cal-club-select mt-1">
            <option v-for="item in memberships" :key="item.club.id" :value="item.club.id">
              {{ localizedField(item.club, 'nameFa', 'nameEn') }}
            </option>
          </select>
        </label>
        <p v-else class="canva-account-drawer-clubs text-start text-sm font-bold text-brand-navy">
          {{ t('owner.account.myClubs') }}
          <span class="mt-1 block text-xs font-bold text-brand-gray-500">
            {{ activeMembership?.club ? localizedField(activeMembership.club, 'nameFa', 'nameEn') : '—' }}
          </span>
        </p>

        <nav class="canva-dash-menu !mt-0 !shadow-none">
          <NuxtLink
            v-for="item in links"
            :key="item.label"
            :to="item.to"
            class="canva-dash-menu-item"
            @click="onNavigate"
          >
            <span class="canva-dash-menu-icon">
              <AppIcon :name="item.icon" size="sm" />
            </span>
            <span class="flex-1">{{ item.label }}</span>
          </NuxtLink>
          <button type="button" class="canva-dash-menu-item !text-brand-primary" @click="handleLogout">
            <span class="canva-dash-menu-icon">
              <AppIcon name="logout" size="sm" />
            </span>
            <span class="flex-1">{{ t('athlete.logoutAccount') }}</span>
          </button>
        </nav>
      </aside>
    </div>
  </Teleport>
</template>
