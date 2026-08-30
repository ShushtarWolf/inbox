<script setup lang="ts">
import type { PlatformRole } from '#shared/roles.ts'

definePageMeta({ middleware: ['auth'], ssr: false })

const { t } = useI18n()
const localePath = useLocalePath()
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
  <div class="mx-auto min-h-[70vh] max-w-md px-4 py-8 text-start sm:max-w-3xl">
    <p class="text-xs font-bold text-brand-gray-600">{{ t('auth.chooseRole.eyebrow') }}</p>
    <h1 class="mt-1 text-2xl font-black text-brand-navy sm:text-3xl">
      {{ t('auth.chooseRole.title') }}
    </h1>
    <p class="mt-2 text-sm leading-relaxed text-brand-gray-600">
      {{ t('auth.chooseRole.subtitle') }}
    </p>

    <div
      v-if="user?.phone"
      class="mt-4 inline-flex items-center gap-2 border border-brand-gray-200 bg-white px-3 py-2 text-xs font-bold text-brand-navy"
      style="border-radius: 2px;"
    >
      <span class="inline-block h-2 w-2 bg-emerald-600" aria-hidden="true" />
      {{ user.phone }}
    </div>

    <div v-if="loading" class="mt-8 text-sm text-brand-gray-600">
      {{ t('common.loading') }}
    </div>

    <div
      v-else
      class="mt-6 grid gap-3 sm:grid-cols-3"
    >
      <button
        v-for="card in cards"
        :key="card.role"
        type="button"
        class="grid grid-cols-[44px_1fr_auto] items-center gap-3 border border-brand-gray-200 bg-white p-3.5 text-start transition hover:border-brand-primary sm:grid-cols-1 sm:items-start sm:gap-3 sm:p-5"
        style="border-radius: 2px;"
        :class="card.state === 'pending' ? 'border-dashed opacity-95' : ''"
        @click="onPick(card.role)"
      >
        <div
          class="flex h-11 w-11 items-center justify-center text-lg font-black"
          :class="{
            'bg-brand-primary/10 text-brand-primary': card.role === 'ATHLETE',
            'bg-[#4a1420]/10 text-[#4a1420]': card.role === 'COACH',
            'bg-[#b68a3b]/15 text-[#b68a3b]': card.role === 'CLUB_ADMIN',
          }"
          style="border-radius: 2px;"
        >
          {{ card.letter }}
        </div>
        <div class="sm:mt-1">
          <p class="text-sm font-extrabold text-brand-navy sm:text-base">{{ card.title }}</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-brand-gray-600 sm:text-xs">{{ card.hint }}</p>
        </div>
        <span
          class="text-[10px] font-extrabold sm:mt-2 sm:inline-block"
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
      <div class="my-6 border-t border-brand-gray-200" />
      <p class="text-xs font-extrabold text-brand-navy">{{ t('auth.chooseRole.newRoleTitle') }}</p>
      <div class="mt-3 flex flex-col gap-2 sm:grid sm:grid-cols-2">
        <NuxtLink
          v-if="canOfferCoach()"
          :to="localePath('/register/coach')"
          class="flex items-center justify-between border border-dashed border-brand-gray-300 px-4 py-3.5 text-sm font-bold text-brand-navy transition hover:border-brand-primary hover:text-brand-primary"
          style="border-radius: 2px;"
        >
          <span>{{ t('auth.chooseRole.applyCoach') }}</span>
          <span class="text-[11px] font-semibold text-brand-gray-600">{{ t('auth.chooseRole.needsAdmin') }}</span>
        </NuxtLink>
        <NuxtLink
          v-if="canOfferOwner()"
          :to="localePath('/register/owner')"
          class="flex items-center justify-between border border-dashed border-brand-gray-300 px-4 py-3.5 text-sm font-bold text-brand-navy transition hover:border-brand-primary hover:text-brand-primary"
          style="border-radius: 2px;"
        >
          <span>{{ t('auth.chooseRole.applyOwner') }}</span>
          <span class="text-[11px] font-semibold text-brand-gray-600">{{ t('auth.chooseRole.needsAdmin') }}</span>
        </NuxtLink>
      </div>
    </template>

    <p class="mt-5 text-[11px] leading-relaxed text-brand-gray-600">
      {{ t('auth.chooseRole.rememberHint') }}
    </p>
  </div>
</template>
