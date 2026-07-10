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
    class="fixed inset-x-0 bottom-0 z-50 border-t border-brand-gray-200 bg-white/95 pb-[var(--sz-safe-bottom)] shadow-venus-sm backdrop-blur-xl lg:hidden"
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
        class="flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 py-2 text-[10px] font-semibold transition-colors"
        :class="[
          scrollLayout ? 'min-w-[4.5rem] shrink-0' : '',
          isActive(item.to)
            ? 'text-brand-primary'
            : 'text-brand-gray-600',
        ]"
      >
        <span v-if="item.icon" class="relative text-lg">
          {{ item.icon }}
          <span v-if="item.badge" class="absolute -end-1 -top-1 rounded-full bg-brand-primary px-1 text-[9px] font-bold text-white">{{ item.badge }}</span>
        </span>
        {{ item.label }}
      </NuxtLink>
    </div>
  </nav>
</template>
