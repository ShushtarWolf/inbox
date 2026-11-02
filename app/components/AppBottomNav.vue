<script setup lang="ts">
import { isNavItemActive, type NavItem } from '#shared/nav.ts'

const NuxtLink = resolveComponent('NuxtLink')

const props = withDefaults(defineProps<{
  items: NavItem[]
  maxWidthClass?: string
  dark?: boolean
}>(), {
  maxWidthClass: 'max-w-lg',
  dark: false,
})

const route = useRoute()

const linkItems = computed(() => props.items.filter((item) => !item.action))

/** Five dense FA tabs (admin ops) need horizontal pan; grid squashes labels on ~375px. */
const scrollLayout = computed(() => props.items.length >= 5)

const columnsClass = computed(() => {
  if (props.items.length <= 3) return 'grid-cols-3'
  if (props.items.length === 4) return 'grid-cols-4'
  if (props.items.length === 5) return 'grid-cols-5'
  return ''
})

function isActive(to: string) {
  return isNavItemActive(route.path, to, linkItems.value)
}
</script>

<template>
  <nav
    class="fixed inset-x-0 bottom-0 z-50 border-t pb-[var(--sz-safe-bottom)] shadow-venus-sm"
    :class="[
      'min-[431px]:hidden',
      dark ? 'border-white/10 bg-brand-primary-dark' : 'border-brand-gray-200 bg-white',
      scrollLayout
        ? 'overflow-x-auto overscroll-x-contain touch-pan-x [scrollbar-width:none] [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden'
        : '',
    ]"
  >
    <div
      :class="
        scrollLayout
          ? 'inline-flex w-max min-w-full flex-nowrap'
          : ['mx-auto grid w-full', maxWidthClass, columnsClass]
      "
    >
      <component
        :is="item.action ? 'button' : NuxtLink"
        v-for="item in items"
        :key="item.to + item.label"
        v-bind="item.action ? { type: 'button' } : { to: item.to }"
        class="relative flex min-h-16 cursor-pointer flex-col items-center justify-center gap-0.5 py-3 text-center text-xs font-medium leading-tight transition-colors"
        :class="[
          scrollLayout
            ? 'min-w-[5.25rem] w-max max-w-none shrink-0 flex-none whitespace-nowrap px-3'
            : 'px-2',
          !item.action && isActive(item.to)
            ? (dark ? 'text-brand-gold' : 'text-brand-primary')
            : (dark ? 'text-white/70' : 'text-brand-gray-500'),
        ]"
        @click="item.action?.()"
      >
        <span
          v-if="!item.action && isActive(item.to) && !dark"
          class="absolute inset-x-4 top-0 h-0.5 bg-brand-primary"
          aria-hidden="true"
        />
        <AppIcon :name="item.icon || 'circle'" size="md" :filled="!item.action && isActive(item.to)" />
        {{ item.label }}
        <span v-if="item.badge" class="absolute end-2 top-2 bg-brand-primary px-1 text-[9px] font-medium text-white" style="border-radius: var(--sz-canva-radius);">{{ item.badge }}</span>
      </component>
    </div>
  </nav>
</template>
