<script setup lang="ts">
type NavItem = { to: string; label: string; icon?: string }

const props = withDefaults(defineProps<{
  title: string
  items: NavItem[]
  wide?: boolean
  darkNav?: boolean
}>(), {
  wide: false,
  darkNav: false,
})

const open = ref(false)

const mainClass = computed(() => {
  return props.wide ? 'w-full px-4 py-4 lg:px-6 lg:py-6' : 'mx-auto w-full max-w-lg px-4 py-4 lg:max-w-4xl lg:px-6 lg:py-6'
})
</script>

<template>
  <div class="flex min-h-dvh flex-col pb-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom))] lg:flex-row lg:pb-0">
    <div v-if="open" class="fixed inset-0 z-40 bg-black/40 lg:hidden" @click="open = false" />

    <div
      class="fixed inset-y-0 z-50 transition-transform ltr:left-0 rtl:right-0 lg:static lg:translate-x-0"
      :class="open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'"
    >
      <AppSideNav :title="title" :items="items" :dark="darkNav" />
    </div>

    <div class="min-w-0 flex-1">
      <header class="glass-bar sticky top-0 z-30 px-4 py-3 lg:hidden">
        <div class="flex items-center justify-between gap-3">
          <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="open = true">{{ $t('common.menu') }}</button>
          <p class="min-w-0 truncate font-display text-base font-black">{{ title }}</p>
          <LocaleSwitcher />
        </div>
      </header>

      <div class="hidden border-b border-black/5 bg-brand-cream/60 px-6 py-3 lg:flex lg:items-center lg:justify-end">
        <LocaleSwitcher />
      </div>

      <main :class="mainClass">
        <slot />
      </main>
    </div>

    <AppBottomNav :items="items" max-width-class="max-w-lg" />
  </div>
</template>
