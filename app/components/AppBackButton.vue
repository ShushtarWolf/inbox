<script setup lang="ts">
/**
 * Single back-button style for the whole app (Telegram UI feedback):
 * same look everywhere, always sits top-LEFT (end side in RTL).
 * Pass `to` for a link, otherwise it emits `click` (or falls back to history).
 */
const props = defineProps<{ to?: string, onClick?: (e: MouseEvent) => unknown }>()
const { t } = useI18n()
const router = useRouter()

function handleClick(e: MouseEvent) {
  if (props.onClick) {
    props.onClick(e)
    return
  }
  if (window.history.length > 1) router.back()
  else navigateTo('/')
}
</script>

<template>
  <NuxtLink v-if="props.to" :to="props.to" class="inbox-back-btn" :aria-label="t('common.back')">
    <span>{{ t('common.back') }}</span>
    <AppIcon name="arrow_back" size="sm" />
  </NuxtLink>
  <button v-else type="button" class="inbox-back-btn" :aria-label="t('common.back')" @click="handleClick">
    <span>{{ t('common.back') }}</span>
    <AppIcon name="arrow_back" size="sm" />
  </button>
</template>
