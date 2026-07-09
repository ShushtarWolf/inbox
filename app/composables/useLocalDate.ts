import { localDateString, todayDateString } from '#shared/localDate.ts'

export function useLocalDate() {
  return { localDateString, today: todayDateString }
}
