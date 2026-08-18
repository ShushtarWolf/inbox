<script setup lang="ts">
const props = defineProps<{
  open: boolean
  anchor?: HTMLElement | null
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { user, displayName, initials, avatarUrl, logout } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const { localizedField } = useLocalizedField()

const panelRef = ref<HTMLElement | null>(null)
const closeBtnRef = ref<HTMLButtonElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
let restoreFocus: HTMLElement | null = null

const memberships = computed(() => user.value?.memberships || [])
const activeMembership = computed(
  () => memberships.value.find((m) => m.club.id === selectedClubId.value) || memberships.value[0],
)
const roleLabel = computed(() =>
  activeMembership.value?.role === 'OWNER' ? t('owner.account.roleManager') : t('owner.account.roleStaff'),
)

const links = computed(() => [
  { to: localePath('/owner/settings'), label: t('owner.settings'), icon: 'settings' },
  { to: localePath('/owner/finance'), label: t('owner.account.transactions'), icon: 'receipt_long' },
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

function viewportBox() {
  const vv = window.visualViewport
  return {
    width: vv?.width ?? document.documentElement.clientWidth,
    height: vv?.height ?? document.documentElement.clientHeight,
    left: vv?.offsetLeft ?? 0,
    top: vv?.offsetTop ?? 0,
  }
}

function isRtl() {
  const dir = document.documentElement.getAttribute('dir')
    || getComputedStyle(document.documentElement).direction
  return dir === 'rtl'
}

function resolveAnchor(): HTMLElement | null {
  const candidates = [props.anchor, document.querySelector<HTMLElement>('button[aria-expanded="true"]')]
  for (const el of candidates) {
    if (!el) continue
    const rect = el.getBoundingClientRect()
    if (rect.width > 0 && rect.height > 0) return el
  }
  return null
}

function positionPanel() {
  if (!import.meta.client) return
  const panel = panelRef.value
  const margin = 12
  const vp = viewportBox()
  const width = Math.min(Math.max(panel?.offsetWidth || 0, 296), vp.width - margin * 2)
  const height = panel?.offsetHeight || 240
  const anchor = resolveAnchor()

  let top = vp.top + margin
  let left = isRtl() ? vp.left + margin : vp.left + vp.width - width - margin

  if (anchor) {
    const rect = anchor.getBoundingClientRect()
    top = rect.bottom + 8
    const growLeft = rect.left + rect.width / 2 > vp.left + vp.width / 2
    left = growLeft ? rect.right - width : rect.left
    if (top + Math.min(height, vp.height - margin * 2) > vp.top + vp.height - margin) {
      top = Math.max(vp.top + margin, rect.top - Math.min(height, vp.height - margin * 2) - 8)
    }
  }

  left = Math.min(Math.max(left, vp.left + margin), vp.left + vp.width - width - margin)
  top = Math.min(
    Math.max(top, vp.top + margin),
    vp.top + vp.height - Math.min(height, vp.height - margin * 2) - margin,
  )

  panelStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    right: 'auto',
    width: `${Math.round(width)}px`,
    maxWidth: `calc(100vw - ${margin * 2}px)`,
  }
}

function onViewportChange() {
  if (props.open) positionPanel()
}

let resizeObserver: ResizeObserver | null = null

function attachPanelObserver() {
  resizeObserver?.disconnect()
  if (!panelRef.value || typeof ResizeObserver === 'undefined') return
  resizeObserver = new ResizeObserver(() => positionPanel())
  resizeObserver.observe(panelRef.value)
}

watch(() => props.open, async (isOpen) => {
  if (!import.meta.client) return
  if (isOpen) {
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    await nextTick()
    attachPanelObserver()
    positionPanel()
    requestAnimationFrame(() => {
      positionPanel()
      requestAnimationFrame(() => {
        positionPanel()
        closeBtnRef.value?.focus()
      })
    })
  }
  else {
    resizeObserver?.disconnect()
    resizeObserver = null
    restoreFocus?.focus()
    restoreFocus = null
  }
})

watch(() => props.anchor, () => {
  if (props.open) positionPanel()
})

onMounted(() => {
  if (!import.meta.client) return
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('resize', onViewportChange)
  window.addEventListener('scroll', onViewportChange, true)
})

onUnmounted(() => {
  if (!import.meta.client) return
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('resize', onViewportChange)
  window.removeEventListener('scroll', onViewportChange, true)
  resizeObserver?.disconnect()
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
        ref="panelRef"
        class="canva-account-drawer"
        role="dialog"
        aria-modal="true"
        :aria-label="t('owner.account.title')"
        :style="panelStyle"
        @click.stop
      >
        <div class="canva-account-drawer-head">
          <div class="canva-owner-avatar canva-owner-avatar-lg" aria-hidden="true">
            <img v-if="avatarUrl" :src="avatarUrl" alt="" class="h-full w-full object-cover">
            <span v-else>{{ initials }}</span>
          </div>
          <div class="min-w-0 flex-1 text-start">
            <p class="truncate text-sm font-bold text-brand-navy">{{ displayName }}</p>
            <p class="mt-0.5 text-xs font-bold text-brand-gray-500">{{ roleLabel }}</p>
          </div>
          <button
            ref="closeBtnRef"
            type="button"
            class="canva-account-drawer-close"
            :aria-label="t('common.close')"
            @click="emit('close')"
          >
            <AppIcon name="close" size="sm" />
          </button>
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

        <nav class="canva-account-menu">
          <NuxtLink
            v-for="item in links"
            :key="item.label"
            :to="item.to"
            class="canva-account-menu-item"
            :title="item.label"
            @click="onNavigate"
          >
            <span class="canva-account-menu-icon">
              <AppIcon :name="item.icon" size="sm" />
            </span>
            <span class="canva-account-menu-label">{{ item.label }}</span>
          </NuxtLink>
          <button type="button" class="canva-account-menu-item canva-account-menu-logout" @click="handleLogout">
            <span class="canva-account-menu-icon">
              <AppIcon name="logout" size="sm" />
            </span>
            <span class="canva-account-menu-label">{{ t('athlete.logoutAccount') }}</span>
          </button>
        </nav>
      </aside>
    </div>
  </Teleport>
</template>
