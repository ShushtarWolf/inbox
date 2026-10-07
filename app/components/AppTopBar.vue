<script setup lang="ts">
import { isNavItemActive, type NavItem } from '#shared/nav.ts'

const NuxtLink = resolveComponent('NuxtLink')
const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()

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
  <!-- Padding inside the max-w box (same as main) so logo/login align with hero edges -->
  <header class="glass-bar sticky top-0 z-40 py-4">
    <div class="mx-auto flex w-full items-center justify-between gap-4 px-4 min-[431px]:px-6" :class="maxWidthClass">
      <div class="flex min-w-0 items-center gap-4">
        <!-- Brand → home -->
        <InboxBrandLockup home-link height-class="h-8" />
        <nav v-if="nav.length" class="hidden items-center gap-1 min-[431px]:flex">
          <component
            :is="item.action ? 'button' : NuxtLink"
            v-for="item in nav"
            :key="item.to + item.label"
            v-bind="item.action ? { type: 'button' } : { to: item.to }"
            class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold"
            style="border-radius: var(--sz-canva-radius);"
            :class="!item.action && isActive(item.to) ? 'bg-brand-primary text-white' : 'text-brand-navy hover:bg-brand-cream'"
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
