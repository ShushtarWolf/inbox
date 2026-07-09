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
    class="fixed inset-x-0 bottom-0 z-50 border-t pb-[var(--sz-safe-bottom)] backdrop-blur-xl lg:hidden"
    :class="dark ? 'border-white/10 bg-brand-primary-dark/95 text-white' : 'border-black/5 bg-white/95'"
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
        class="flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 py-2 text-[10px] font-semibold"
        :class="[
          scrollLayout ? 'min-w-[4.5rem] shrink-0' : '',
          isActive(item.to)
            ? (dark ? 'text-brand-gold' : 'text-brand-primary')
            : (dark ? 'text-white/75' : 'text-brand-gray-600'),
        ]"
      >
        <span v-if="item.icon" class="text-lg">{{ item.icon }}</span>
        {{ item.label }}
      </NuxtLink>
    </div>
  </nav>
</template>
