<script setup lang="ts">
import { isNavItemActive, type NavItem } from '#shared/nav.ts'

const props = defineProps<{
  title: string
  items: NavItem[]
  dark?: boolean
}>()

const route = useRoute()

function isActive(to: string) {
  return isNavItemActive(route.path, to, props.items)
}
</script>

<template>
  <aside class="flex h-full w-[290px] shrink-0 flex-col border-e border-brand-gray-200 bg-white">
    <div class="border-b border-brand-gray-200 px-6 py-5">
      <div class="flex items-center gap-3">
        <div class="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary">
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-6 w-6 brightness-0 invert" />
        </div>
        <div>
          <p class="text-xs font-medium uppercase tracking-wider text-brand-gray-500">inbox</p>
          <p class="text-sm font-semibold text-brand-navy">{{ title }}</p>
        </div>
      </div>
    </div>
    <nav class="flex-1 space-y-1 overflow-y-auto px-4 py-4">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="tail-menu-item"
        :class="isActive(item.to) ? 'tail-menu-item-active' : 'tail-menu-item-inactive'"
      >
        <AppIcon v-if="item.icon" :name="item.icon" size="sm" :filled="isActive(item.to)" />
        <span>{{ item.label }}</span>
        <span v-if="item.badge" class="ms-auto rounded-full bg-brand-primary px-2 py-0.5 text-[10px] font-medium text-white">{{ item.badge }}</span>
      </NuxtLink>
    </nav>
  </aside>
</template>
