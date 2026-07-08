<script setup lang="ts">
type NavItem = { to: string; label: string; icon?: string }

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
        <NuxtLink :to="localePath('/')" class="flex items-center gap-2">
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-8 w-8" />
          <span class="font-display text-lg font-black">{{ $t('brand.name') }}</span>
        </NuxtLink>
        <nav v-if="nav.length" class="hidden lg:flex items-center gap-2">
          <NuxtLink
            v-for="item in nav"
            :key="item.to"
            :to="item.to"
            class="rounded-full px-3 py-2 text-sm font-semibold text-brand-gray-700 transition hover:bg-white"
            active-class="bg-white text-brand-primary shadow-sm"
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
