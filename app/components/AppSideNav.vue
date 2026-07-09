<script setup lang="ts">
type NavItem = { to: string; label: string; icon?: string }

withDefaults(defineProps<{
  title: string
  items: NavItem[]
  dark?: boolean
}>(), {
  dark: false,
})

const route = useRoute()

function isActive(to: string) {
  return route.path === to || route.path.startsWith(`${to}/`)
}
</script>

<template>
  <aside
    class="flex h-full w-64 shrink-0 flex-col border-e"
    :class="dark ? 'border-white/10 bg-brand-primary-dark text-white' : 'border-black/5 bg-white'"
  >
    <div class="border-b p-4" :class="dark ? 'border-white/10' : 'border-black/5'">
      <img src="/brand/inbox-logo-mark.svg" alt="" class="mb-2 h-9 w-9" />
      <p class="text-sm font-black">{{ title }}</p>
    </div>
    <nav class="flex-1 py-2">
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex items-center border-s-2 px-4 py-2.5 text-sm font-semibold transition"
        :class="[
          dark ? 'border-transparent opacity-85 hover:bg-white/5' : 'border-transparent text-brand-gray-700 hover:bg-brand-cream',
          isActive(item.to) ? (dark ? 'border-brand-gold bg-white/10 opacity-100' : 'border-brand-primary bg-brand-cream text-brand-primary') : '',
        ]"
      >
        <span v-if="item.icon" class="me-2 text-base" aria-hidden="true">{{ item.icon }}</span>
        {{ item.label }}
      </NuxtLink>
    </nav>
  </aside>
</template>
