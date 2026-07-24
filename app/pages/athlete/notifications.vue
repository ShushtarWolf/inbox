<script setup lang="ts">
definePageMeta({ layout: 'dashboard-athlete', middleware: ['auth', 'role'], role: 'ATHLETE', ssr: false })

const { t } = useI18n()
const { data, pending, error, refresh } = await useAuthedFetch<{
  notifications: Array<{
    id: string
    type: string
    title: string
    body: string
    readAt: string | null
    createdAt: string
  }>
  unreadCount: number
}>('/api/notifications')

const marking = ref<string | null>(null)

async function markRead(id: string) {
  marking.value = id
  try {
    await $fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
    await refresh()
  } finally {
    marking.value = null
  }
}

async function markAllRead() {
  const unread = data.value?.notifications.filter((n) => !n.readAt) || []
  for (const n of unread) {
    await $fetch(`/api/notifications/${n.id}/read`, { method: 'PATCH' })
  }
  await refresh()
}
</script>

<template>
  <div class="venus-page-stack">
    <section class="canva-dash-hero">
      <div class="flex items-end justify-between gap-3">
        <div>
          <p class="text-xs text-white/80">{{ t('notifications.title') }}</p>
          <h1 class="mt-1 text-2xl font-bold">
            {{ data?.unreadCount ? t('notifications.unreadCount', { count: data.unreadCount }) : t('notifications.title') }}
          </h1>
        </div>
        <button
          v-if="data?.unreadCount"
          type="button"
          class="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-bold backdrop-blur"
          @click="markAllRead"
        >
          {{ t('notifications.markAllRead') }}
        </button>
      </div>
    </section>

    <AppAsyncState :pending="pending" :error="error" skeleton-variant="default">
      <div v-if="!data?.notifications.length" class="canva-panel text-center text-sm text-brand-gray-600">
        {{ t('notifications.empty') }}
      </div>
      <ul v-else class="space-y-2">
        <li
          v-for="item in data.notifications"
          :key="item.id"
          class="canva-list-card"
          :class="{ 'border-brand-primary/40 bg-brand-primary-soft/40': !item.readAt }"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="font-bold text-brand-navy">{{ item.title }}</p>
              <p class="mt-1 text-sm text-brand-gray-700">{{ item.body }}</p>
              <p class="mt-2 text-xs text-brand-gray-500 tabular-nums" dir="ltr">
                {{ new Date(item.createdAt).toLocaleString() }}
              </p>
            </div>
            <button
              v-if="!item.readAt"
              type="button"
              class="shrink-0 text-xs font-bold text-brand-primary"
              :disabled="marking === item.id"
              @click="markRead(item.id)"
            >
              {{ t('notifications.markRead') }}
            </button>
          </div>
        </li>
      </ul>
    </AppAsyncState>
  </div>
</template>
