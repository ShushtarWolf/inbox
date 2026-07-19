<script setup lang="ts">
const { t } = useI18n()
const config = useRuntimeConfig()
const ownerName = computed(() => String(config.public.contactOwnerName || '').trim())
</script>

<template>
  <div>
    <div v-if="ownerName" class="prose prose-sm mx-auto max-w-2xl px-4 pt-8">
      <p class="ios-card not-prose p-4 text-sm">
        <span class="font-bold text-brand-navy">{{ t('contact.ownerLabel') }}: </span>
        {{ ownerName }}
      </p>
    </div>
    <LegalDocument
      title-key="legal.aboutTitle"
      intro-key="legal.aboutIntro"
      sections-key="legal.aboutSections"
    />
  </div>
</template>
