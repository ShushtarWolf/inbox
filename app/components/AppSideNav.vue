<script setup lang="ts">
import { isNavItemActive, type NavItem } from '#shared/nav.ts'

const props = withDefaults(defineProps<{
  title: string
  items: NavItem[]
  dark?: boolean
}>(), {
  dark: false,
})

const route = useRoute()

function isActive(to: string) {
  return isNavItemActive(route.path, to, props.items)
}
</script>

<template>
  <aside
    class="flex h-full w-[290px] shrink-0 flex-col bg-white shadow-venus-sm"
    :class="dark ? 'lg:bg-brand-primary-dark' : ''"
  >
    <div class="p-6" :class="dark ? 'text-white' : ''">
      <div class="mb-6 flex items-center gap-3">
        <div class="flex h-11 w-11 items-center justify-center rounded-venus bg-brand-primary shadow-venus-sm">
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-7 w-7 brightness-0 invert" />
        </div>
        <div>
          <p class="text-xs font-bold uppercase tracking-wider text-brand-gray-400" :class="dark ? 'text-white/60' : ''">inbox</p>
          <p class="text-sm font-bold" :class="dark ? 'text-white' : 'text-brand-navy'">{{ title }}</p>
        </div>
      </div>
    </div>
    <nav class="flex-1 space-y-1 px-4 pb-4">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-3 rounded-venus-xl px-4 py-3 text-sm font-semibold transition-all duration-200"
        :class="[
          isActive(item.to)
            ? (dark ? 'bg-white/10 text-white shadow-venus-sm' : 'bg-brand-primary text-white shadow-venus-sm')
            : (dark ? 'text-white/70 hover:bg-white/5 hover:text-white' : 'text-brand-gray-600 hover:bg-brand-lavender hover:text-brand-primary'),
        ]"
      >
        <span v-if="item.icon" class="text-lg" aria-hidden="true">{{ item.icon }}</span>
        {{ item.label }}
      </NuxtLink>
    </nav>
  </aside>
</template>
