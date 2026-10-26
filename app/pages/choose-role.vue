<script setup lang="ts">
import type { PlatformRole } from '#shared/roles.ts'

definePageMeta({ middleware: ['auth'], layout: false, ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
const { formatPhone } = useFormatters()
const { user, logout } = useAuth()
const {
  fetch,
  heldRoles,
  chooseRole,
} = usePlatformRoles()

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

async function onPick(role: PlatformRole) {
  await chooseRole(role)
}

async function handleLogout() {
  await logout()
}
</script>

<template>
  <div class="canva-auth-sheet flex min-h-dvh flex-col min-[431px]:bg-brand-cream">
    <header
      class="choose-role-desktop-bar hidden min-[431px]:flex min-[431px]:items-center min-[431px]:justify-between min-[431px]:border-b min-[431px]:border-brand-gray-200 min-[431px]:bg-white/55 min-[431px]:px-8 min-[431px]:py-3"
    >
      <InboxBrandLockup home-link height-class="h-8" />
      <div class="flex items-center gap-4 text-sm font-bold">
        <bdi v-if="user?.phone" dir="ltr" class="tabular-nums font-semibold text-brand-gray-600">
          {{ formatPhone(user.phone) }}
        </bdi>
        <button type="button" class="text-brand-primary" @click="handleLogout">
          {{ t('nav.logout') }}
        </button>
      </div>
    </header>

    <div class="mx-auto flex w-full max-w-sm flex-1 items-center px-4 py-8 min-[431px]:max-w-[880px] min-[431px]:items-start min-[431px]:px-8 min-[431px]:py-12">
      <div class="canva-result-sheet w-full p-0 min-[431px]:border-0 min-[431px]:bg-transparent min-[431px]:shadow-none">
        <div class="min-[431px]:hidden">
          <div class="canva-auth-accent" />
          <div class="canva-auth-header">
            <InboxBrandLockup home-link height-class="h-7" />
            <NuxtLink :to="localePath('/')" class="text-xs font-bold text-brand-gray-600">
              {{ t('common.close') }}
            </NuxtLink>
          </div>
        </div>

        <div class="canva-auth-body min-[431px]:px-0 min-[431px]:pb-0 min-[431px]:pt-0">
          <div class="min-[431px]:hidden">
            <p class="text-center text-xs font-bold text-[#b68a3b]">{{ t('auth.chooseRole.eyebrow') }}</p>
            <h1 class="text-center text-xl font-bold text-brand-navy">
              {{ t('auth.chooseRole.title') }}
            </h1>
            <p class="text-center text-sm leading-relaxed text-brand-gray-600">
              {{ t('auth.chooseRole.subtitle') }}
            </p>
          </div>

          <div class="hidden min-[431px]:block text-start">
            <p class="text-xs font-bold text-brand-gray-600">{{ t('auth.chooseRole.eyebrow') }}</p>
            <h1 class="mt-2 text-3xl font-black leading-snug text-brand-navy">
              {{ t('auth.chooseRole.title') }}
            </h1>
            <p class="mt-3 max-w-xl text-sm leading-relaxed text-brand-gray-600">
              {{ t('auth.chooseRole.subtitle') }}
            </p>
          </div>

          <div
            v-if="user?.phone"
            class="inline-flex w-full items-center justify-center gap-2 border border-brand-gray-200 bg-white px-3 py-2 text-xs font-bold text-brand-navy min-[431px]:mt-6 min-[431px]:w-auto"
            style="border-radius: 2px;"
          >
            <span class="inline-block h-2 w-2 bg-emerald-600" aria-hidden="true" />
            <bdi dir="ltr" class="tabular-nums">{{ formatPhone(user.phone) }}</bdi>
          </div>

          <div class="mt-4 space-y-4 min-[431px]:mt-8">
            <RoleChooseCards :loading="loading" @pick="onPick" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
