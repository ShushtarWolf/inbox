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
  <header class="glass-bar sticky top-0 z-40 px-6 py-4">
    <div class="mx-auto flex w-full items-center justify-between gap-4" :class="maxWidthClass">
      <div class="flex min-w-0 items-center gap-4">
        <NuxtLink :to="localePath('/')" class="flex items-center gap-3 transition hover:opacity-80">
          <div class="flex h-10 w-10 items-center justify-center rounded-venus bg-brand-primary shadow-venus-sm">
            <img src="/brand/inbox-logo-mark.svg" alt="" class="h-6 w-6 brightness-0 invert" />
          </div>
          <span class="font-display text-lg font-bold text-brand-navy">{{ $t('brand.name') }}</span>
        </NuxtLink>
        <nav v-if="nav.length" class="hidden lg:flex items-center gap-2">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="neo-pill neo-pill-inactive gap-1.5"
            active-class="neo-pill-active"
          >
            <AppIcon v-if="item.icon" :name="item.icon" size="sm" />
            {{ item.label }}
          </NuxtLink>
        </nav>
      </div>
      <div class="flex items-center gap-3">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
