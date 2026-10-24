<script setup lang="ts">
import { isNavItemActive, type NavItem } from '#shared/nav.ts'

const NuxtLink = resolveComponent('NuxtLink')
const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()

const props = withDefaults(defineProps<{
  nav?: NavItem[]
  maxWidthClass?: string
  /** Design rhead — cream sticky bar with inline nav (desktop public). */
  variant?: 'glass' | 'publicHead'
}>(), {
  nav: () => [],
  maxWidthClass: 'max-w-6xl',
  variant: 'glass',
})

function isActive(to: string) {
  return isNavItemActive(route.path, to, props.nav)
}
</script>

<template>
  <!-- Padding inside the max-w box (same as main) so logo/login align with hero edges -->
  <header
    class="sticky top-0 z-40"
    :class="variant === 'publicHead' ? 'public-rhead' : 'glass-bar py-4'"
  >
    <div
      class="mx-auto flex w-full items-center justify-between gap-4 px-4 min-[431px]:px-6"
      :class="[maxWidthClass, variant === 'publicHead' ? 'public-rhead-inner' : '']"
    >
      <div class="flex min-w-0 items-center gap-4 min-[431px]:gap-[22px]">
        <!-- Brand → home -->
        <InboxBrandLockup home-link :height-class="variant === 'publicHead' ? 'h-8 min-[431px]:h-[31px] min-[431px]:w-[96px]' : 'h-8'" />
        <nav v-if="nav.length" class="hidden items-center gap-1.5 min-[431px]:flex">
          <component
            :is="item.action ? 'button' : NuxtLink"
            v-for="item in nav"
            :key="item.to + item.label"
            v-bind="item.action ? { type: 'button' } : { to: item.to }"
            class="inline-flex items-center gap-1.5 px-2.5 py-2 text-xs font-bold transition"
            style="border-radius: var(--sz-canva-radius);"
            :class="variant === 'publicHead'
              ? (!item.action && isActive(item.to) ? 'public-rhead-nav-active' : 'public-rhead-nav')
              : (!item.action && isActive(item.to) ? 'bg-brand-primary text-white' : 'text-brand-navy hover:bg-brand-cream')"
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
