export type Plan = 'FREE' | 'PRO' | 'BUSINESS'

// API'dan dönen kullanıcı — şifre ve dahili alanlar YOK
export type UserResponse = {
  id: string
  name: string
  email: string
  emailVerified: boolean
  plan: Plan
  createdAt: string // ISO date string
}
