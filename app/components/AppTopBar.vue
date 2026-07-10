<script setup lang="ts">
import type { NavItem } from '#shared/nav.ts'

const localePath = useLocalePath()

withDefaults(defineProps<{
  nav?: NavItem[]
  maxWidthClass?: string
}>(), {
  nav: () => [],
  maxWidthClass: 'max-w-6xl',
})
</script>

<template>
  <header class="glass-bar sticky top-0 z-40 px-4 py-3">
    <div class="mx-auto flex w-full items-center justify-between gap-4" :class="maxWidthClass">
      <div class="flex min-w-0 items-center gap-3">
        <NuxtLink :to="localePath('/')" class="flex items-center gap-2 transition hover:-translate-y-0.5">
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-8 w-8 border-2 border-black bg-white shadow-brutal-sm" />
          <span class="font-display text-lg font-black">{{ $t('brand.name') }}</span>
        </NuxtLink>
        <nav v-if="nav.length" class="hidden lg:flex items-center gap-2">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="neo-pill neo-pill-inactive"
            active-class="neo-pill-active shadow-brutal"
          >
            {{ item.label }}
          </NuxtLink>
        </nav>
      </div>
      <div class="flex items-center gap-2">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
