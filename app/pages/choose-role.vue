<script setup lang="ts">
import type { PlatformRole } from '#shared/roles.ts'

definePageMeta({ middleware: ['auth'], layout: false, ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { formatPhone } = useFormatters()
const { openRegister } = useAuthFlow()
const {
  user,
  fetch,
  heldRoles,
  roleCardState,
  chooseRole,
  canOfferCoach,
  canOfferOwner,
  showNewRoleSection,
} = usePlatformRoles()

/** Open register sheet in-place — /register/* uses guest middleware and bounces logged-in users. */
function applyCoach() {
  openRegister({ role: 'COACH', returnTo: localePath('/coach') })
}

function applyOwner() {
  openRegister({ role: 'CLUB_ADMIN', returnTo: localePath('/owner') })
}

const loading = ref(true)

onMounted(async () => {
  await fetch()
  loading.value = false
  // Single usable role → skip picker (safety for bookmarks / old redirects).
  if (heldRoles.value.length <= 1) {
    const only = (heldRoles.value[0] || 'ATHLETE') as PlatformRole
    await chooseRole(only)
  }
})

const cards = computed(() => {
  const order: PlatformRole[] = ['ATHLETE', 'COACH', 'CLUB_ADMIN']
  return order
    .filter((role) => heldRoles.value.includes(role))
    .map((role) => ({
      role,
      state: roleCardState(role),
      title: t(`auth.chooseRole.${role}.title`),
      hint: t(`auth.chooseRole.${role}.hint`),
      letter: t(`auth.chooseRole.${role}.letter`),
    }))
})

async function onPick(role: PlatformRole) {
  await chooseRole(role)
}
</script>

<template>
  <div class="canva-auth-sheet flex min-h-dvh flex-col">
    <div class="mx-auto flex w-full max-w-[440px] flex-1 items-center px-4 py-8">
      <div class="canva-result-sheet w-full p-0">
        <div class="canva-auth-header">
          <InboxBrandLockup home-link height-class="h-7" />
          <NuxtLink :to="localePath('/')" class="text-xs font-bold text-brand-gray-600">
            {{ t('common.close') }}
          </NuxtLink>
        </div>

        <div class="canva-auth-body">
          <p class="text-center text-xs font-bold text-[#b68a3b]">{{ t('auth.chooseRole.eyebrow') }}</p>
          <h1 class="text-center text-xl font-bold text-brand-navy">
            {{ t('auth.chooseRole.title') }}
          </h1>
          <p class="text-center text-sm leading-relaxed text-brand-gray-600">
            {{ t('auth.chooseRole.subtitle') }}
          </p>

          <div
            v-if="user?.phone"
            class="inline-flex w-full items-center justify-center gap-2 border border-brand-gray-200 bg-white px-3 py-2 text-xs font-bold text-brand-navy"
            style="border-radius: 2px;"
          >
            <span class="inline-block h-2 w-2 bg-emerald-600" aria-hidden="true" />
            <bdi dir="ltr" class="tabular-nums">{{ formatPhone(user.phone) }}</bdi>
          </div>

          <div v-if="loading" class="py-4">
            <AppVenusSpinner size="sm" :label="t('common.loading')" />
          </div>

          <div v-else class="space-y-3">
            <button
              v-for="card in cards"
              :key="card.role"
              type="button"
              class="flex w-full items-center gap-3 border border-brand-gray-200 bg-white p-3.5 text-start transition hover:border-brand-primary"
              style="border-radius: 2px;"
              :class="card.state === 'pending' ? 'border-dashed opacity-95' : ''"
              @click="onPick(card.role)"
            >
              <div
                class="flex h-11 w-11 shrink-0 items-center justify-center text-lg font-black"
                :class="{
                  'bg-[#c41e1e] text-white': true,
                }"
                style="border-radius: 2px;"
              >
                {{ card.letter }}
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-extrabold text-brand-navy">{{ card.title }}</p>
                <p class="mt-0.5 text-[11px] leading-relaxed text-brand-gray-600">{{ card.hint }}</p>
              </div>
              <span
                class="shrink-0 text-[10px] font-extrabold"
                style="border-radius: 2px;"
                :class="card.state === 'live'
                  ? 'bg-emerald-50 px-2 py-1 text-emerald-800'
                  : 'bg-amber-50 px-2 py-1 text-amber-900'"
              >
                {{ card.state === 'live' ? t('auth.chooseRole.badgeLive') : t('auth.chooseRole.badgePending') }}
              </span>
            </button>
          </div>

          <template v-if="!loading && showNewRoleSection()">
            <div class="border-t border-brand-gray-200 pt-4" />
            <p class="text-xs font-extrabold text-brand-navy">{{ t('auth.chooseRole.newRoleTitle') }}</p>
            <div class="mt-3 flex flex-col gap-2">
              <button
                v-if="canOfferCoach()"
                type="button"
                class="flex items-center justify-between border border-dashed border-brand-gray-300 px-4 py-3.5 text-sm font-bold text-brand-navy transition hover:border-brand-primary hover:text-brand-primary"
                style="border-radius: 2px;"
                @click="applyCoach"
              >
                <span>{{ t('auth.chooseRole.applyCoach') }}</span>
                <span class="text-[11px] font-semibold text-brand-gray-600">{{ t('auth.chooseRole.needsAdmin') }}</span>
              </button>
              <button
                v-if="canOfferOwner()"
                type="button"
                class="flex items-center justify-between border border-dashed border-brand-gray-300 px-4 py-3.5 text-sm font-bold text-brand-navy transition hover:border-brand-primary hover:text-brand-primary"
                style="border-radius: 2px;"
                @click="applyOwner"
              >
                <span>{{ t('auth.chooseRole.applyOwner') }}</span>
                <span class="text-[11px] font-semibold text-brand-gray-600">{{ t('auth.chooseRole.needsAdmin') }}</span>
              </button>
            </div>
          </template>

          <p class="text-[11px] leading-relaxed text-brand-gray-600">
            {{ t('auth.chooseRole.rememberHint') }}
          </p>
        </div>
      </div>
    </div>
  </div>
</template>
