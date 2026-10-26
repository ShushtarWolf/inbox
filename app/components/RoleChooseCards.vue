<script setup lang="ts">
import type { PlatformRole } from '#shared/roles.ts'

const props = withDefaults(defineProps<{
  loading?: boolean
  /** When set, that role shows «فعلی» and is not selectable. */
  currentRole?: PlatformRole | null
}>(), {
  loading: false,
  currentRole: null,
})

const emit = defineEmits<{ pick: [PlatformRole] }>()

const { t } = useI18n()
const localePath = useLocalePath()
const { openRegister } = useAuthFlow()
const {
  heldRoles,
  roleCardState,
  canOfferCoach,
  canOfferOwner,
  showNewRoleSection,
} = usePlatformRoles()

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
      isCurrent: props.currentRole === role,
    }))
})

function applyCoach() {
  openRegister({ role: 'COACH', returnTo: localePath('/coach') })
}

function applyOwner() {
  openRegister({ role: 'CLUB_ADMIN', returnTo: localePath('/owner') })
}

function onPick(role: PlatformRole) {
  if (props.currentRole === role) return
  emit('pick', role)
}
</script>

<template>
  <div v-if="loading" class="py-4">
    <AppVenusSpinner size="sm" :label="t('common.loading')" />
  </div>

  <template v-else>
    <div class="grid gap-3 min-[431px]:grid-cols-3">
      <button
        v-for="card in cards"
        :key="card.role"
        type="button"
        class="role-choose-card flex items-center gap-3 border border-brand-gray-200 bg-white p-3.5 text-start transition min-[431px]:min-h-[12.5rem] min-[431px]:flex-col min-[431px]:items-start min-[431px]:p-5"
        style="border-radius: 2px;"
        :class="[
          card.state === 'pending' ? 'border-dashed opacity-95' : '',
          card.isCurrent ? 'border-brand-primary ring-1 ring-brand-primary/30' : 'hover:border-brand-primary',
        ]"
        :disabled="card.isCurrent"
        @click="onPick(card.role)"
      >
        <div
          class="flex h-11 w-11 shrink-0 items-center justify-center text-lg font-black min-[431px]:h-12 min-[431px]:w-12"
          :class="{
            'bg-brand-primary/10 text-brand-primary': card.role === 'ATHLETE',
            'bg-[#4a1420]/10 text-[#4a1420]': card.role === 'COACH',
            'bg-[#b68a3b]/15 text-[#b68a3b]': card.role === 'CLUB_ADMIN',
          }"
          style="border-radius: 2px;"
        >
          {{ card.letter }}
        </div>
        <div class="min-w-0 flex-1 min-[431px]:w-full">
          <p class="text-sm font-extrabold text-brand-navy min-[431px]:text-base">{{ card.title }}</p>
          <p class="mt-0.5 text-[11px] leading-relaxed text-brand-gray-600 min-[431px]:text-xs">{{ card.hint }}</p>
        </div>
        <span
          class="shrink-0 text-[10px] font-extrabold min-[431px]:mt-auto"
          style="border-radius: 2px;"
          :class="card.isCurrent
            ? 'bg-brand-primary/10 px-2 py-1 text-brand-primary'
            : card.state === 'live'
              ? 'bg-emerald-50 px-2 py-1 text-emerald-800'
              : 'bg-amber-50 px-2 py-1 text-amber-900'"
        >
          {{
            card.isCurrent
              ? t('auth.chooseRole.badgeCurrent')
              : card.state === 'live'
                ? t('auth.chooseRole.badgeLive')
                : t('auth.chooseRole.badgePending')
          }}
        </span>
      </button>
    </div>

    <template v-if="showNewRoleSection()">
      <div class="border-t border-brand-gray-200 pt-4" />
      <p class="text-xs font-extrabold text-brand-navy">{{ t('auth.chooseRole.newRoleTitle') }}</p>
      <div class="mt-3 grid gap-2 min-[431px]:grid-cols-2">
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
  </template>
</template>
