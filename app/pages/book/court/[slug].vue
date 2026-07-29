<script setup lang="ts">
/**
 * Legacy deep-link → club detail (primary court-booking UX).
 * Preserves date / slot / court query so `/clubs/[slug]` can hydrate selection.
 */
import { resolveClubSlugAlias } from '#shared/clubSlugAliases.ts'

definePageMeta({ ssr: false })

const route = useRoute()
const localePath = useLocalePath()
const slug = resolveClubSlugAlias(String(route.params.slug || ''))

const query: Record<string, string> = {}
for (const key of ['date', 'slot', 'slots', 'court', 'time'] as const) {
  const raw = route.query[key]
  if (typeof raw === 'string' && raw) query[key] = raw
  else if (Array.isArray(raw) && raw.length) {
    query[key] = raw.filter((v): v is string => typeof v === 'string').join(',')
  }
}

await navigateTo(
  localePath({
    path: slug ? `/clubs/${slug}` : '/clubs',
    query,
  }),
  { replace: true },
)
</script>

<template>
  <div class="flex min-h-[40vh] items-center justify-center text-sm text-brand-gray-600">
    {{ $t('common.loading') }}
  </div>
</template>
