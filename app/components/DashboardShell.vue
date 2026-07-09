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

const { t } = useI18n()
const localePath = useLocalePath()
const route = useRoute()
const open = ref(false)

const mainClass = computed(() => {
  return props.wide ? 'w-full px-4 py-4 lg:px-6 lg:py-6' : 'mx-auto w-full max-w-lg px-4 py-4 lg:max-w-4xl lg:px-6 lg:py-6'
})

const dashboardRoot = computed(() => props.items[0]?.to || localePath('/'))
const isDashboardRoot = computed(() => route.path === dashboardRoot.value)

function onKeydown(event: KeyboardEvent) {
  if (open.value && event.key === 'Escape') {
    open.value = false
  }
}

onMounted(() => {
  if (import.meta.client) {
    document.addEventListener('keydown', onKeydown)
  }
})

onUnmounted(() => {
  if (import.meta.client) {
    document.removeEventListener('keydown', onKeydown)
  }
})

function goBack() {
  if (isDashboardRoot.value) {
    return navigateTo(localePath('/'))
  }

  window.history.length > 1 ? window.history.back() : navigateTo(dashboardRoot.value)
}
</script>

<template>
  <div class="flex min-h-dvh flex-col pb-[calc(var(--sz-tab-bar-height)+var(--sz-safe-bottom))] lg:flex-row lg:pb-0">
    <div v-if="open" class="fixed inset-0 z-40 bg-black/40 lg:hidden" role="presentation" @click="open = false" />

    <div
      class="fixed inset-y-0 z-50 transition-transform ltr:left-0 rtl:right-0 lg:static lg:translate-x-0"
      :class="open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full'"
    >
      <AppSideNav :title="title" :items="items" :dark="darkNav" />
    </div>

    <div class="min-w-0 flex-1">
      <header class="glass-bar sticky top-0 z-30 px-4 py-3 lg:hidden">
        <div class="flex items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="open = true">{{ t('common.menu') }}</button>
            <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="goBack">{{ t('common.back') }}</button>
          </div>
          <p class="min-w-0 truncate font-display text-base font-black">{{ title }}</p>
          <div class="flex items-center gap-2">
            <NuxtLink :to="localePath('/')" class="btn-ghost px-3 py-2 text-xs">{{ t('nav.home') }}</NuxtLink>
            <LocaleSwitcher />
          </div>
        </div>
      </header>

      <div class="hidden border-b border-black/5 bg-brand-cream/60 px-6 py-3 lg:flex lg:items-center lg:justify-between">
        <div class="flex items-center gap-2">
          <button type="button" class="btn-ghost px-3 py-2 text-xs" @click="goBack">{{ t('common.back') }}</button>
          <NuxtLink :to="localePath('/')" class="btn-ghost px-3 py-2 text-xs">{{ t('nav.home') }}</NuxtLink>
        </div>
        <LocaleSwitcher />
      </div>

      <main :class="mainClass">
        <slot />
      </main>
    </div>

    <AppBottomNav :items="items" max-width-class="max-w-lg" />
  </div>
</template>
