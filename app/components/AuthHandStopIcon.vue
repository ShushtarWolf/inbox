<script setup lang="ts">
/**
 * Tabler `ti-hand-stop` stand-in — SVG so we never show Material ligature text.
 * Used in auth/dashboard welcome chrome (HTML SoT).
 */
withDefaults(defineProps<{ size?: number }>(), { size: 22 })
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M8 13v-7.5a1.5 1.5 0 0 1 3 0v6.5" />
    <path d="M11 5.5v-2a1.5 1.5 0 1 1 3 0v8.5" />
    <path d="M14 5.5a1.5 1.5 0 0 1 3 0v6.5" />
    <path d="M17 7.5a1.5 1.5 0 0 1 3 0v8.5a6 6 0 0 1 -6 6h-2 .208a6 6 0 0 1 -5.012 -2.7 69 69 0 0 1 -.196 -.298c-.312-.479-1.407-2.388-3.286-5.728a1.5 1.5 0 0 1 .536-2.022 1.506 1.506 0 0 1 2.162 .536L9 10.5V2a1.5 1.5 0 0 1 3 0" />
  </svg>
</template>
