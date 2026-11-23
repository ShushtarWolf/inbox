<script setup lang="ts">
import { levelGuideRows } from '#shared/skillAssessmentSeo.ts'
import { skillLevelPlayDescriptionFa } from '#shared/skillAssessment.ts'

const { formatFaDigits } = useFormatters()
const rows = levelGuideRows()
</script>

<template>
  <section class="space-y-3">
    <h2 class="text-base font-bold text-brand-navy">
      راهنمای مقیاس ۱ تا ۷
    </h2>
    <div class="overflow-x-auto border border-brand-gray-200">
      <table class="w-full min-w-[20rem] text-start text-sm">
        <thead class="bg-brand-cream text-xs font-bold text-brand-gray-500">
          <tr>
            <th class="px-3 py-2 font-bold">بازه</th>
            <th class="px-3 py-2 font-bold">سطح</th>
            <th class="hidden px-3 py-2 font-bold sm:table-cell">توضیح کوتاه</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
            :key="row.min"
            class="border-t border-brand-gray-200"
          >
            <td class="px-3 py-2 tabular-nums text-brand-navy">
              {{ formatFaDigits(String(row.min)) }}–{{ formatFaDigits(String(row.max)) }}
            </td>
            <td class="px-3 py-2 font-bold text-brand-primary">
              {{ row.label }}
            </td>
            <td class="hidden px-3 py-2 text-brand-gray-500 sm:table-cell">
              {{ skillLevelPlayDescriptionFa((row.min + row.max) / 2) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>