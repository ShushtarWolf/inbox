<script setup lang="ts">
defineProps<{
  title?: string
}>()
</script>

<template>
  <div class="tail-widget-card">
    <h2 v-if="title" class="tail-section-title mb-4">{{ title }}</h2>
    <div class="tail-table-wrap">
      <table class="tail-table">
        <slot />
      </table>
    </div>
  </div>
</template>
