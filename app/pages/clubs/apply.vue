<script setup lang="ts">
const localePath = useLocalePath()

useSeoMeta({
  robots: 'noindex, nofollow',
})

await navigateTo(localePath('/register/owner'), { redirectCode: 301 })
</script>

<template>
  <div />
</template>
