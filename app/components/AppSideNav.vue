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
  <aside
    class="flex h-full w-[290px] shrink-0 flex-col border-e"
    :class="dark
      ? 'border-white/10 bg-brand-primary-dark text-white'
      : 'border-brand-gray-200 bg-white'"
  >
    <div
      class="border-b px-6 py-5"
      :class="dark ? 'border-white/10' : 'border-brand-gray-200'"
    >
      <div class="flex items-center gap-3">
        <div
          class="flex h-10 w-10 items-center justify-center rounded-lg"
          :class="dark ? 'bg-brand-primary' : 'bg-brand-primary'"
        >
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-6 w-6 brightness-0 invert" />
        </div>
        <div>
          <p
            class="text-xs font-medium uppercase tracking-wider"
            :class="dark ? 'text-white/60' : 'text-brand-gray-500'"
          >inbox</p>
          <p
            class="text-sm font-semibold"
            :class="dark ? 'text-white' : 'text-brand-navy'"
          >{{ title }}</p>
        </div>
      </div>
    </div>
    <nav class="flex-1 space-y-1 overflow-y-auto px-4 py-4">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="tail-menu-item"
        :class="[
          isActive(item.to)
            ? (dark ? 'tail-menu-item-dark-active' : 'tail-menu-item-active')
            : (dark ? 'tail-menu-item-dark-inactive' : 'tail-menu-item-inactive'),
        ]"
      >
        <AppIcon v-if="item.icon" :name="item.icon" size="sm" :filled="isActive(item.to)" />
        <span>{{ item.label }}</span>
        <span
          v-if="item.badge"
          class="ms-auto rounded-full px-2 py-0.5 text-[10px] font-medium"
          :class="dark ? 'bg-brand-gold text-white' : 'bg-brand-primary text-white'"
        >{{ item.badge }}</span>
      </NuxtLink>
    </nav>
  </aside>
</template>
