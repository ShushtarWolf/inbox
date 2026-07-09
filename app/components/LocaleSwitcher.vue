<script setup lang="ts">
const { locale, locales, setLocale, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const available = computed(() => locales.value as Array<{ code: string }>)
</script>

<template>
  <div class="inline-flex rounded-full border border-black/10 bg-white p-1 shadow-sm">
    <NuxtLink
      v-for="item in available"
      :key="item.code"
      :to="switchLocalePath(item.code)"
      class="rounded-full px-3 py-1 text-xs font-bold transition"
      :class="locale === item.code ? 'bg-brand-primary text-white' : 'text-brand-gray-700'"
      @click="setLocale(item.code)"
    >
      {{ item.code === 'fa' ? t('common.languageFa') : t('common.languageEn') }}
    </NuxtLink>
  </div>
</template>
