<template>
  <div class="tail-card overflow-hidden" role="status" aria-live="polite" aria-busy="true">
    <div class="border-b border-brand-gray-200 px-5 py-5 sm:px-7">
      <div class="tail-skeleton h-3 w-28" />
      <div class="tail-skeleton mt-3 h-7 w-40" />
      <div class="tail-skeleton mt-2 h-4 w-56" />
      <div class="tail-skeleton mt-5 h-10 w-44 rounded-full" />
    </div>
    <div class="p-5 sm:p-7">
      <div class="grid grid-cols-[5.5rem_1fr_1fr_1fr] gap-3">
        <div />
        <div v-for="column in 3" :key="`head-${column}`" class="tail-skeleton h-10 rounded-lg" />
        <template v-for="row in 4" :key="`row-${row}`">
          <div class="tail-skeleton h-16 rounded-lg" />
          <div v-for="column in 3" :key="`cell-${row}-${column}`" class="tail-skeleton h-24 rounded-lg" />
        </template>
      </div>
    </div>
  </div>
</template>
