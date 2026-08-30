declare module '#auth-utils' {
  interface User {
    id: string
    email: string
    name: string
    nameEn?: string | null
    role: string
    secondaryRole?: string | null
    tertiaryRole?: string | null
    locale?: string | null
    avatarUrl?: string | null
  }

  interface UserSession {
    user?: User
  }
}

export {}
