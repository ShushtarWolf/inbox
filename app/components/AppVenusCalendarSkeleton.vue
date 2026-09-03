<template>
  <div
    class="overflow-hidden rounded-[2px] border border-brand-gray-200 bg-white"
    role="status"
    aria-live="polite"
    aria-busy="true"
  >
    <div class="border-b border-brand-gray-200 px-3 py-3">
      <div class="tail-skeleton h-4 w-36" />
      <div class="mt-3 flex gap-2">
        <div class="tail-skeleton h-9 w-20 rounded-[2px]" />
        <div class="tail-skeleton h-9 w-20 rounded-[2px]" />
      </div>
    </div>
    <div class="p-2">
      <div class="mb-2 grid grid-cols-[3.5rem_1fr_1fr_1fr] gap-1">
        <div />
        <div v-for="column in 3" :key="`head-${column}`" class="tail-skeleton h-8 rounded-[2px]" />
      </div>
      <div class="grid grid-cols-[3.5rem_1fr_1fr_1fr] gap-1">
        <template v-for="row in 8" :key="`row-${row}`">
          <div class="tail-skeleton h-[3.5rem] rounded-[2px]" />
          <div
            v-for="column in 3"
            :key="`cell-${row}-${column}`"
            class="tail-skeleton min-h-[3.5rem] rounded-[2px]"
          />
        </template>
      </div>
    </div>
  </div>
</template>
