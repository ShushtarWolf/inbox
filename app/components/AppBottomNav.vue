<script setup lang="ts">
import { isNavItemActive, type NavItem } from '#shared/nav.ts'

const NuxtLink = resolveComponent('NuxtLink')

const props = withDefaults(defineProps<{
  items: NavItem[]
  maxWidthClass?: string
  dark?: boolean
  /** Show on all breakpoints instead of hiding on lg (phone-shell chrome). */
  alwaysVisible?: boolean
}>(), {
  maxWidthClass: 'max-w-lg',
  dark: false,
  alwaysVisible: false,
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
    class="fixed inset-x-0 bottom-0 z-50 border-t pb-[var(--sz-safe-bottom)] shadow-venus-sm"
    :class="[
      alwaysVisible ? '' : 'lg:hidden',
      dark ? 'border-white/10 bg-brand-primary-dark' : 'border-brand-gray-200 bg-white',
    ]"
  >
    <div
      class="mx-auto"
      :class="[
        maxWidthClass,
        scrollLayout ? 'flex overflow-x-auto' : ['grid', columnsClass],
      ]"
    >
      <component
        :is="item.action ? 'button' : NuxtLink"
        v-for="item in items"
        :key="item.to + item.label"
        v-bind="item.action ? { type: 'button' } : { to: item.to }"
        class="relative flex min-h-14 flex-col items-center justify-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors"
        :class="[
          scrollLayout ? 'min-w-[4.5rem] shrink-0' : '',
          !item.action && isActive(item.to)
            ? (dark ? 'text-brand-gold' : 'text-brand-primary')
            : (dark ? 'text-white/70' : 'text-brand-gray-500'),
        ]"
        @click="item.action?.()"
      >
        <span
          v-if="!item.action && isActive(item.to) && !dark"
          class="absolute inset-x-4 top-0 h-0.5 rounded-full bg-brand-primary"
          aria-hidden="true"
        />
        <AppIcon :name="item.icon || 'circle'" size="sm" :filled="!item.action && isActive(item.to)" />
        {{ item.label }}
        <span v-if="item.badge" class="absolute end-2 top-2 rounded-full bg-brand-primary px-1 text-[9px] font-medium text-white">{{ item.badge }}</span>
      </component>
    </div>
  </nav>
</template>
