type PageSeoInput = {
  title: MaybeRefOrGetter<string>
  description: MaybeRefOrGetter<string>
  image?: MaybeRefOrGetter<string | undefined>
  path?: MaybeRefOrGetter<string | undefined>
}

/**
 * Sets document title, description, Open Graph / Twitter tags, and canonical URL.
 * Uses `NUXT_PUBLIC_SITE_URL` when available so absolute OG/canonical links work in prod.
 */
export function usePageSeo(input: PageSeoInput) {
  const config = useRuntimeConfig()
  const route = useRoute()

  const siteUrl = computed(() => String(config.public.siteUrl || '').replace(/\/$/, ''))

  const pagePath = computed(() => {
    const explicit = toValue(input.path)
    return explicit || route.path || '/'
  })

  const canonical = computed(() => {
    if (!siteUrl.value) return ''
    const path = pagePath.value.startsWith('/') ? pagePath.value : `/${pagePath.value}`
    return `${siteUrl.value}${path === '/' ? '' : path}` || siteUrl.value
  })

  const absoluteImage = computed(() => {
    const image = toValue(input.image) || '/brand/inbox-og.svg'
    if (!image) return undefined
    if (/^https?:\/\//i.test(image)) return image
    if (!siteUrl.value) return image
    return `${siteUrl.value}${image.startsWith('/') ? image : `/${image}`}`
  })

  const fullTitle = computed(() => {
    const raw = String(toValue(input.title) || '').trim()
    if (!raw || raw.toLowerCase() === 'inbox') return 'inbox'
    return raw.includes('inbox') ? raw : `${raw} · inbox`
  })

  useSeoMeta({
    title: () => fullTitle.value,
    description: () => toValue(input.description),
    ogTitle: () => fullTitle.value,
    ogDescription: () => toValue(input.description),
    ogType: 'website',
    ogUrl: () => canonical.value || undefined,
    ogImage: () => absoluteImage.value,
    ogLocale: 'fa_IR',
    ogSiteName: 'inbox',
    twitterCard: 'summary_large_image',
    twitterTitle: () => fullTitle.value,
    twitterDescription: () => toValue(input.description),
    twitterImage: () => absoluteImage.value,
  })

  useHead(() => ({
    link: canonical.value
      ? [{ rel: 'canonical', href: canonical.value }]
      : [],
  }))
}
