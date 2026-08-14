<script setup lang="ts">
import { isNavItemActive, type NavItem } from '#shared/nav.ts'

const NuxtLink = resolveComponent('NuxtLink')

const props = defineProps<{
  title: string
  items: NavItem[]
  dark?: boolean
}>()

const route = useRoute()
const localePath = useLocalePath()
const { t } = useI18n()

function isActive(to: string) {
  return isNavItemActive(route.path, to, props.items.filter((item) => !item.action))
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
      <NuxtLink :to="localePath('/')" class="flex items-center gap-3" :aria-label="t('brand.name')">
        <div
          class="flex h-10 w-10 items-center justify-center"
          :class="dark ? 'bg-brand-primary' : 'bg-brand-primary'"
          style="border-radius: var(--sz-canva-radius);"
        >
          <img src="/brand/inbox-logo-mark.svg" alt="" class="h-6 w-6 brightness-0 invert" />
        </div>
        <div class="min-w-0 text-start">
          <InboxWordmark class="text-base" :class="dark ? 'text-white' : 'text-brand-primary'" />
          <p
            class="text-xs font-medium"
            :class="dark ? 'text-white/60' : 'text-brand-gray-500'"
          >{{ title }}</p>
        </div>
      </NuxtLink>
    </div>
    <nav class="flex-1 space-y-1 overflow-y-auto px-4 py-4">
      <component
        :is="item.action ? 'button' : NuxtLink"
        v-for="item in items"
        :key="item.to + item.label"
        v-bind="item.action ? { type: 'button' } : { to: item.to }"
        class="canva-side-nav-item w-full text-start"
        :class="[
          !item.action && isActive(item.to)
            ? (dark ? 'tail-menu-item-dark-active' : 'tail-menu-item-active')
            : (dark ? 'tail-menu-item-dark-inactive' : 'tail-menu-item-inactive'),
        ]"
        @click="item.action?.()"
      >
        <AppIcon v-if="item.icon" :name="item.icon" size="sm" :filled="!item.action && isActive(item.to)" />
        <span>{{ item.label }}</span>
        <span
          v-if="item.badge"
          class="ms-auto px-2 py-0.5 text-[10px] font-medium"
          style="border-radius: var(--sz-canva-radius);"
          :class="dark ? 'bg-brand-gold text-white' : 'bg-brand-primary text-white'"
        >{{ item.badge }}</span>
      </component>
    </nav>
  </aside>
</template>
