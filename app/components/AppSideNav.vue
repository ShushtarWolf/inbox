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
    class="flex h-full w-64 shrink-0 flex-col border-e-2 border-black"
    :class="dark ? 'bg-brand-lavender text-black' : 'bg-white text-black'"
  >
    <div class="border-b-2 border-black p-4" :class="dark ? 'bg-brand-accent' : 'bg-brand-sky'">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="mb-2 h-9 w-9 border-2 border-black bg-white shadow-brutal-sm" />
      <p class="text-sm font-black">{{ title }}</p>
    </div>
    <nav class="flex-1 py-2">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="mx-2 my-1 flex items-center rounded-brutal border-2 px-4 py-2.5 text-sm font-black transition"
        :class="[
          isActive(item.to)
            ? 'border-black bg-brand-accent text-black shadow-brutal'
            : 'border-transparent hover:border-black hover:bg-white hover:shadow-brutal-sm',
        ]"
      >
        <span v-if="item.icon" class="me-2 text-base" aria-hidden="true">{{ item.icon }}</span>
        {{ item.label }}
      </NuxtLink>
    </nav>
  </aside>
</template>
