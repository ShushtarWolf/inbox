<script setup lang="ts">
import { isNavItemActive, type NavItem } from '#shared/nav.ts'

const NuxtLink = resolveComponent('NuxtLink')
const localePath = useLocalePath()
const route = useRoute()

const props = withDefaults(defineProps<{
  nav?: NavItem[]
  maxWidthClass?: string
}>(), {
  nav: () => [],
  maxWidthClass: 'max-w-6xl',
})

function isActive(to: string) {
  return isNavItemActive(route.path, to, props.nav)
}
</script>

<template>
  <header class="glass-bar sticky top-0 z-40 px-4 py-4 sm:px-6">
    <div class="mx-auto flex w-full items-center justify-between gap-4" :class="maxWidthClass">
      <div class="flex min-w-0 items-center gap-4">
        <NuxtLink :to="localePath('/')" class="flex items-center gap-3 transition hover:opacity-80">
          <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary">
            <img src="/brand/inbox-logo-mark.svg" alt="" class="h-6 w-6 brightness-0 invert" />
          </div>
          <span class="font-display text-lg font-semibold text-brand-navy">{{ $t('brand.name') }}</span>
        </NuxtLink>
        <nav v-if="nav.length" class="hidden items-center gap-2 lg:flex">
          <component
            :is="item.action ? 'button' : NuxtLink"
            v-for="item in nav"
            :key="item.to + item.label"
            v-bind="item.action ? { type: 'button' } : { to: item.to }"
            class="neo-pill gap-1.5"
            :class="!item.action && isActive(item.to) ? 'neo-pill-active' : 'neo-pill-inactive'"
            @click="item.action?.()"
          >
            <AppIcon v-if="item.icon" :name="item.icon" size="sm" />
            {{ item.label }}
          </component>
        </nav>
      </div>
      <div class="flex items-center gap-3">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
