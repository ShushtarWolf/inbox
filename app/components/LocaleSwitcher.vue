<script setup lang="ts">
const { locale, locales, setLocale, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const available = computed(() => locales.value as Array<{ code: string }>)
</script>

<template>
  <div class="inline-flex rounded-full border border-brand-gray-200 bg-brand-lavender p-1 shadow-venus-sm">
    <NuxtLink
      v-for="item in available"
      :key="item.code"
      :to="switchLocalePath(item.code)"
      class="rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-200"
      :class="locale === item.code ? 'bg-brand-primary text-white shadow-venus-sm' : 'text-brand-gray-600 hover:text-brand-primary'"
      @click="setLocale(item.code)"
    >
      {{ item.code === 'fa' ? t('common.languageFa') : t('common.languageEn') }}
    </NuxtLink>
  </div>
</template>
