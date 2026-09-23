<script setup lang="ts">
import {
  HERO_PHONE_SIZES,
  heroJpegFallback,
  heroJpegSrcset,
  heroStem,
  heroWebpSrcset,
  isOptimizedHeroSrc,
} from '~/utils/heroImage'

const props = withDefaults(defineProps<{
  src: string
  alt?: string
  imgClass?: string
  imgStyle?: string | Record<string, string>
  fetchpriority?: 'high' | 'low' | 'auto'
  loading?: 'eager' | 'lazy'
  sizes?: string
}>(), {
  alt: '',
  imgClass: '',
  imgStyle: undefined,
  fetchpriority: 'auto',
  loading: undefined,
  sizes: HERO_PHONE_SIZES,
})

const optimized = computed(() => isOptimizedHeroSrc(props.src))
const stem = computed(() => heroStem(props.src))
const webpSrcset = computed(() => (stem.value ? heroWebpSrcset(stem.value) : ''))
const jpegSrcset = computed(() => (stem.value ? heroJpegSrcset(stem.value) : ''))
const fallback = computed(() => (stem.value ? heroJpegFallback(stem.value) : props.src))
</script>

<template>
  <picture v-if="optimized">
    <source type="image/webp" :srcset="webpSrcset" :sizes="sizes" />
    <img
      :src="fallback"
      :srcset="jpegSrcset"
      :sizes="sizes"
      :alt="alt"
      :class="imgClass"
      :style="imgStyle"
      :fetchpriority="fetchpriority"
      :loading="loading"
      decoding="async"
      width="750"
      height="422"
    />
  </picture>
  <img
    v-else
    :src="src"
    :alt="alt"
    :class="imgClass"
    :style="imgStyle"
    :fetchpriority="fetchpriority"
    :loading="loading"
    decoding="async"
  />
</template>
