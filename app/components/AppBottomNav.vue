<script setup lang="ts">
import { isNavItemActive, type NavItem } from '#shared/nav.ts'

const props = withDefaults(defineProps<{
  items: NavItem[]
  maxWidthClass?: string
  dark?: boolean
}>(), {
  maxWidthClass: 'max-w-lg',
  dark: false,
})

const route = useRoute()

const scrollLayout = computed(() => props.items.length > 5)

const columnsClass = computed(() => {
  if (props.items.length <= 3) return 'grid-cols-3'
  if (props.items.length === 4) return 'grid-cols-4'
  if (props.items.length === 5) return 'grid-cols-5'
  return ''
})

function isActive(to: string) {
  return isNavItemActive(route.path, to, props.items)
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-50 border-t-2 border-black pb-[var(--sz-safe-bottom)] lg:hidden"
    :class="dark ? 'bg-brand-lavender text-black' : 'bg-white text-black'"
  >
    <div
      class="mx-auto"
      :class="[
        maxWidthClass,
        scrollLayout ? 'flex overflow-x-auto' : ['grid', columnsClass],
      ]"
    >
      <NuxtLink
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex min-h-14 flex-col items-center justify-center gap-0.5 border-t-2 px-2 py-2 text-[10px] font-black transition"
        :class="[
          scrollLayout ? 'min-w-[4.5rem] shrink-0' : '',
          isActive(item.to)
            ? 'border-black bg-brand-accent text-black'
            : 'border-transparent text-black/70 hover:bg-brand-lavender/40',
        ]"
      >
        <span v-if="item.icon" class="relative text-lg">
          {{ item.icon }}
          <span v-if="item.badge" class="absolute -end-1 -top-1 rounded-brutal border border-black bg-brand-primary px-1 text-[9px] font-black text-black">{{ item.badge }}</span>
        </span>
        {{ item.label }}
      </NuxtLink>
    </div>
  </nav>
</template>
