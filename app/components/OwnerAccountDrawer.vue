<script setup lang="ts">
const props = defineProps<{
  open: boolean
  anchor?: HTMLElement | null
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { user, displayName, initials, avatarUrl, clubAvatarUrl, activeOwnerClub, logout } = useAuth()
const selectedClubId = useCookie<string | null>('owner_club_id', { sameSite: 'lax' })
const { localizedField } = useLocalizedField()

const panelRef = ref<HTMLElement | null>(null)
const closeBtnRef = ref<HTMLButtonElement | null>(null)
const panelStyle = ref<Record<string, string>>({})
const holdsBodyLock = ref(false)
const loggingOut = ref(false)
/** Backdrop dismiss only after the opening avatar tap finishes (AppModal pattern). */
const dismissArmed = ref(false)
const backdropGestureActive = ref(false)
let dismissArmTimer: ReturnType<typeof setTimeout> | null = null
let removeOpenGestureListeners: (() => void) | null = null
let ignorePointerReleaseUntil = 0
let restoreFocus: HTMLElement | null = null

const memberships = computed(() => user.value?.memberships || [])
const activeMembership = computed(
  () => memberships.value.find((m) => m.club.id === selectedClubId.value) || memberships.value[0],
)
const roleLabel = computed(() =>
  activeMembership.value?.role === 'OWNER' ? t('owner.account.roleManager') : t('owner.account.roleStaff'),
)
const drawerAvatarUrl = computed(() => clubAvatarUrl.value || avatarUrl.value)
const drawerTitle = computed(() =>
  activeOwnerClub.value
    ? (localizedField(activeOwnerClub.value, 'nameFa', 'nameEn') || displayName.value)
    : displayName.value,
)
const drawerInitials = computed(() => {
  if (!activeOwnerClub.value) return initials.value
  const name = drawerTitle.value
  const parts = name.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0]![0] || ''}${parts[1]![0] || ''}`.toUpperCase()
  return (name[0] || '?').toUpperCase()
})

const links = computed(() => [
  { to: localePath('/owner/settings'), label: t('owner.settings'), icon: 'settings' },
  { to: localePath('/owner/finance'), label: t('owner.account.transactions'), icon: 'receipt_long' },
  { to: localePath('/owner/support'), label: t('owner.support'), icon: 'headset_mic' },
])

const settingsPath = computed(() => localePath('/owner/settings'))

function onNavigate() {
  emit('close')
}

/** Club picker taps must not arm the backdrop dismiss path (iOS Safari). */
function onClubControlPointerDown() {
  backdropGestureActive.value = false
}

function clearDismissArmTimer() {
  if (dismissArmTimer != null) {
    clearTimeout(dismissArmTimer)
    dismissArmTimer = null
  }
}

function clearOpenGestureListeners() {
  removeOpenGestureListeners?.()
  removeOpenGestureListeners = null
}

function armDismiss() {
  if (!props.open) return
  dismissArmed.value = true
  backdropGestureActive.value = false
  clearDismissArmTimer()
  clearOpenGestureListeners()
}

function scheduleDismissArm() {
  clearDismissArmTimer()
  clearOpenGestureListeners()
  dismissArmed.value = false
  backdropGestureActive.value = false
  ignorePointerReleaseUntil = Date.now() + 50

  let armed = false
  const tryArm = () => {
    if (armed || !props.open) return
    armed = true
    armDismiss()
  }

  const onPointerReleased = () => {
    if (Date.now() < ignorePointerReleaseUntil) return
    requestAnimationFrame(() => {
      requestAnimationFrame(tryArm)
    })
  }

  window.addEventListener('pointerup', onPointerReleased, true)
  window.addEventListener('pointercancel', onPointerReleased, true)
  window.addEventListener('mouseup', onPointerReleased, true)
  window.addEventListener('touchend', onPointerReleased, true)

  removeOpenGestureListeners = () => {
    window.removeEventListener('pointerup', onPointerReleased, true)
    window.removeEventListener('pointercancel', onPointerReleased, true)
    window.removeEventListener('mouseup', onPointerReleased, true)
    window.removeEventListener('touchend', onPointerReleased, true)
  }

  dismissArmTimer = setTimeout(tryArm, 400)
}

function onBackdropPointerDown(event: PointerEvent) {
  if (!dismissArmed.value) {
    backdropGestureActive.value = false
    return
  }
  const panel = panelRef.value
  if (panel && event.target instanceof Node && panel.contains(event.target)) {
    backdropGestureActive.value = false
    return
  }
  backdropGestureActive.value = true
}

function onBackdropClick() {
  if (loggingOut.value) return
  if (!dismissArmed.value || !backdropGestureActive.value) {
    backdropGestureActive.value = false
    return
  }
  backdropGestureActive.value = false
  emit('close')
}

async function handleLogout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await logout()
  } catch {
    loggingOut.value = false
  }
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

function attachViewportListeners() {
  window.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('resize', onViewportChange)
  window.visualViewport?.addEventListener('scroll', onViewportChange)
}

function detachViewportListeners() {
  window.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('resize', onViewportChange)
  window.visualViewport?.removeEventListener('scroll', onViewportChange)
}

function acquireLock() {
  if (holdsBodyLock.value) return
  acquireModalBodyLock()
  holdsBodyLock.value = true
}

function releaseLock() {
  if (!holdsBodyLock.value) return
  releaseModalBodyLock()
  holdsBodyLock.value = false
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
    acquireLock()
    restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    scheduleDismissArm()
    attachViewportListeners()
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
    clearDismissArmTimer()
    clearOpenGestureListeners()
    detachViewportListeners()
    dismissArmed.value = false
    backdropGestureActive.value = false
    loggingOut.value = false
    resizeObserver?.disconnect()
    resizeObserver = null
    releaseLock()
    restoreFocus?.focus()
    restoreFocus = null
  }
}, { flush: 'post' })

watch(() => props.anchor, () => {
  if (props.open) positionPanel()
})

onMounted(() => {
  if (!import.meta.client) return
  document.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  if (!import.meta.client) return
  clearDismissArmTimer()
  clearOpenGestureListeners()
  detachViewportListeners()
  document.removeEventListener('keydown', onKeydown)
  resizeObserver?.disconnect()
  releaseLock()
})
</script>

<template>
  <Teleport to="body">
    <Transition name="venus-modal">
      <!--
        Overlay stays fixed inset-0 (never sized via visualViewport).
        Panel position may use visualViewport for placement only.
      -->
      <div
        v-if="open"
        class="canva-account-drawer-overlay"
        role="presentation"
        data-account-drawer-overlay
        @pointerdown="onBackdropPointerDown"
        @click="onBackdropClick"
      >
        <!-- Dedicated backdrop (decorative). Panel uses separate fixed positioning. -->
        <div class="pointer-events-none absolute inset-0" aria-hidden="true" />
        <aside
          ref="panelRef"
          class="canva-account-drawer"
          role="dialog"
          aria-modal="true"
          :aria-label="t('owner.account.title')"
          :style="panelStyle"
          @pointerdown.stop
          @click.stop
        >
          <div class="canva-account-drawer-head">
            <div class="canva-owner-avatar canva-owner-avatar-lg" aria-hidden="true">
              <img v-if="drawerAvatarUrl" :src="drawerAvatarUrl" alt="" class="h-full w-full object-cover">
              <span v-else>{{ drawerInitials }}</span>
            </div>
            <div class="min-w-0 flex-1 text-start">
              <p class="truncate text-sm font-bold text-brand-navy">{{ drawerTitle }}</p>
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

          <label
            v-if="memberships.length > 1"
            class="canva-account-drawer-clubs"
            data-account-drawer-club
            @pointerdown.stop="onClubControlPointerDown"
          >
            <span class="text-[11px] font-bold text-brand-gray-500">{{ t('owner.account.myClubs') }}</span>
            <select
              v-model="selectedClubId"
              class="canva-cal-club-select mt-1"
              @pointerdown.stop="onClubControlPointerDown"
              @mousedown="onClubControlPointerDown"
              @touchstart.stop="onClubControlPointerDown"
            >
              <option v-for="item in memberships" :key="item.club.id" :value="item.club.id">
                {{ localizedField(item.club, 'nameFa', 'nameEn') }}
              </option>
            </select>
          </label>
          <NuxtLink
            v-else
            :to="settingsPath"
            class="canva-account-drawer-clubs canva-account-drawer-club-link block text-start text-sm font-bold text-brand-navy transition hover:bg-brand-primary-soft"
            data-account-drawer-club
            @click="onNavigate"
          >
            {{ t('owner.account.myClubs') }}
            <span class="mt-1 block text-xs font-bold text-brand-gray-500">
              {{ activeMembership?.club ? localizedField(activeMembership.club, 'nameFa', 'nameEn') : '—' }}
            </span>
          </NuxtLink>

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
            <button
              type="button"
              class="canva-account-menu-item canva-account-menu-logout"
              :disabled="loggingOut"
              @click.stop.prevent="handleLogout"
            >
              <span class="canva-account-menu-icon">
                <AppIcon name="logout" size="sm" />
              </span>
              <span class="canva-account-menu-label">{{ t('athlete.logoutAccount') }}</span>
            </button>
          </nav>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>
