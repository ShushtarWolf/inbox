<script setup lang="ts">
import type { PlatformRole } from '#shared/roles.ts'

const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const { activeRole, chooseRole } = usePlatformRoles()

async function onPick(role: PlatformRole) {
  await chooseRole(role)
  open.value = false
}
</script>

<template>
  <AppModal
    :open="open"
    :title="t('auth.switchRoleTitle')"
    max-width-class="max-w-3xl"
    overlay-class="z-[80]"
    @close="open = false"
  >
    <div class="space-y-4 px-1 pb-2">
      <p class="text-center text-sm leading-relaxed text-brand-gray-600">
        {{ t('auth.switchRoleModalSub') }}
      </p>
      <RoleChooseCards :current-role="activeRole" @pick="onPick" />
    </div>
  </AppModal>
</template>
