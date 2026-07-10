<script setup lang="ts">
const { locale, locales, setLocale, t } = useI18n()
const switchLocalePath = useSwitchLocalePath()

const available = computed(() => locales.value as Array<{ code: string }>)
</script>

<template>
  <div class="inline-flex rounded-brutal border-2 border-black bg-white p-1 shadow-brutal-sm">
    <NuxtLink
      v-for="item in available"
      :key="item.code"
      :to="switchLocalePath(item.code)"
      class="rounded-brutal px-3 py-1 text-xs font-black transition"
      :class="locale === item.code ? 'border-2 border-black bg-brand-accent text-black shadow-brutal-sm' : 'text-black hover:bg-brand-lavender/50'"
      @click="setLocale(item.code)"
    >
      {{ item.code === 'fa' ? t('common.languageFa') : t('common.languageEn') }}
    </NuxtLink>
  </div>
</template>
