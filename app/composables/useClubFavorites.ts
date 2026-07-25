const STORAGE_KEY = 'inbox_club_favorites'

function readIds(): string[] {
  if (!import.meta.client) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : []
  }
  catch {
    return []
  }
}

function writeIds(ids: string[]) {
  if (!import.meta.client) return
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...new Set(ids)]))
}

/** Client-side favorites list (Canva علاقه‌مندی) until a server API exists. */
export function useClubFavorites() {
  const ids = useState<string[]>('club-favorites', () => [])

  onMounted(() => {
    ids.value = readIds()
  })

  function isFavorite(clubId: string) {
    return ids.value.includes(clubId)
  }

  function toggleFavorite(clubId: string) {
    const next = isFavorite(clubId)
      ? ids.value.filter((id) => id !== clubId)
      : [...ids.value, clubId]
    ids.value = next
    writeIds(next)
  }

  function removeFavorite(clubId: string) {
    ids.value = ids.value.filter((id) => id !== clubId)
    writeIds(ids.value)
  }

  return { ids, isFavorite, toggleFavorite, removeFavorite }
}
