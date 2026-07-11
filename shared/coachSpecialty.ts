export function coachSpecialtyKey(value: string) {
  return `coaches.specialtyOptions.${value}`
}

export function translateCoachSpecialty(
  translate: (key: string) => string,
  value: string,
) {
  const key = coachSpecialtyKey(value)
  const translated = translate(key)
  return translated === key ? value : translated
}
