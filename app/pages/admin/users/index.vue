<script setup lang="ts">
definePageMeta({ layout: 'dashboard-admin', ssr: false })

const { t } = useI18n()
const { secret, clearSecret, adminFetch } = useAdminSecret()

type UserRow = {
  id: string
  email: string
  name: string
  nameEn: string | null
  role: 'ATHLETE' | 'COACH' | 'CLUB_ADMIN'
  phone: string | null
  locale: string
  disabled: boolean
  disabledAt: string | null
  createdAt: string
  clubs: { id: string; nameFa: string; slug: string; status: string }[]
  bookingCount: number
}

const users = ref<UserRow[]>([])
const pending = ref(false)
const loadError = ref('')
const roleFilter = ref<'ALL' | UserRow['role']>('ALL')
const disabledFilter = ref<'ALL' | 'false' | 'true'>('ALL')
const search = ref('')
const updatingId = ref<string | null>(null)

async function load() {
  if (!secret.value) return
  pending.value = true
  loadError.value = ''
  try {
    const params = new URLSearchParams()
    if (roleFilter.value !== 'ALL') params.set('role', roleFilter.value)
    if (disabledFilter.value !== 'ALL') params.set('disabled', disabledFilter.value)
    if (search.value.trim()) params.set('q', search.value.trim())
    const qs = params.toString()
    const data = await adminFetch<{ users: UserRow[] }>(`/api/admin/users${qs ? `?${qs}` : ''}`)
    users.value = data.users
  } catch (err: unknown) {
    const status = (err as { statusCode?: number })?.statusCode
    if (status === 403) {
      loadError.value = t('admin.invalidSecret')
      clearSecret()
    } else {
      loadError.value = t('common.error')
    }
  } finally {
    pending.value = false
  }
}

async function setDisabled(user: UserRow, disabled: boolean) {
  updatingId.value = user.id
  try {
    await adminFetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: { disabled },
    })
    await load()
  } catch {
    loadError.value = t('common.error')
  } finally {
    updatingId.value = null
  }
}

async function setRole(user: UserRow, role: UserRow['role']) {
  updatingId.value = user.id
  try {
    await adminFetch(`/api/admin/users/${user.id}`, {
      method: 'PATCH',
      body: { role },
    })
    await load()
  } catch {
    loadError.value = t('common.error')
  } finally {
    updatingId.value = null
  }
}

watch(secret, (value) => {
  if (value) load()
}, { immediate: true })

watch([roleFilter, disabledFilter], () => {
  if (secret.value) load()
})
</script>

<template>
  <div class="tail-page-stack">
    <h1 class="tail-page-title">{{ t('admin.usersTitle') }}</h1>
    <p class="text-sm text-brand-gray-600">{{ t('admin.usersSubtitle') }}</p>

    <div class="flex flex-wrap items-end gap-3">
      <AppFormField :label="t('admin.searchUsers')" class="min-w-[12rem] flex-1">
        <input v-model="search" type="search" class="neo-input" dir="ltr" @keyup.enter="load" />
      </AppFormField>
      <button type="button" class="btn-secondary" @click="load">{{ t('admin.search') }}</button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="option in (['ALL', 'CLUB_ADMIN', 'ATHLETE', 'COACH'] as const)"
        :key="option"
        type="button"
        class="neo-pill text-xs"
        :class="roleFilter === option ? 'neo-pill-active' : ''"
        @click="roleFilter = option"
      >
        {{ option === 'ALL' ? t('bugReport.filter.all') : t(`admin.roles.${option}`) }}
      </button>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="option in ([
          { value: 'ALL', label: t('bugReport.filter.all') },
          { value: 'false', label: t('admin.userActive') },
          { value: 'true', label: t('admin.userDisabled') },
        ] as const)"
        :key="option.value"
        type="button"
        class="neo-pill text-xs"
        :class="disabledFilter === option.value ? 'neo-pill-active' : ''"
        @click="disabledFilter = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <AppAsyncState :pending="pending" :error="loadError ? new Error(loadError) : null" skeleton-variant="default">
      <div v-if="users.length === 0" class="ios-card p-6 text-center text-sm text-brand-gray-600">
        {{ t('common.empty') }}
      </div>
      <div v-else class="overflow-x-auto ios-card">
        <table class="w-full min-w-[800px] text-sm">
          <thead>
            <tr class="border-b border-brand-gray-100 text-start">
              <th class="p-3 font-bold">{{ t('common.name') }}</th>
              <th class="p-3 font-bold">{{ t('admin.contact') }}</th>
              <th class="p-3 font-bold">{{ t('admin.role') }}</th>
              <th class="p-3 font-bold">{{ t('admin.status') }}</th>
              <th class="p-3 font-bold" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="border-b border-brand-gray-50">
              <td class="p-3">
                <div class="font-bold">{{ user.name }}</div>
                <div v-if="user.clubs.length" class="text-xs text-brand-gray-600">
                  {{ user.clubs.map((c) => c.nameFa).join(' · ') }}
                </div>
              </td>
              <td class="p-3">
                <div dir="ltr">{{ user.email }}</div>
                <div v-if="user.phone" class="text-xs text-brand-gray-600" dir="ltr">{{ user.phone }}</div>
              </td>
              <td class="p-3">
                <select
                  class="neo-select text-xs"
                  :value="user.role"
                  :disabled="updatingId === user.id"
                  @change="setRole(user, ($event.target as HTMLSelectElement).value as UserRow['role'])"
                >
                  <option value="CLUB_ADMIN">{{ t('admin.roles.CLUB_ADMIN') }}</option>
                  <option value="ATHLETE">{{ t('admin.roles.ATHLETE') }}</option>
                  <option value="COACH">{{ t('admin.roles.COACH') }}</option>
                </select>
              </td>
              <td class="p-3">
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-bold"
                  :class="user.disabled ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'"
                >
                  {{ user.disabled ? t('admin.userDisabled') : t('admin.userActive') }}
                </span>
              </td>
              <td class="p-3 whitespace-nowrap">
                <button
                  type="button"
                  class="btn-secondary text-xs"
                  :class="user.disabled ? '' : 'text-red-700'"
                  :disabled="updatingId === user.id"
                  @click="setDisabled(user, !user.disabled)"
                >
                  {{ user.disabled ? t('admin.enableUser') : t('admin.disableUser') }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </AppAsyncState>
  </div>
</template>
