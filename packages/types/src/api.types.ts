// ErrorCode tek kaynak: packages/validations/src/error-codes.ts
// (Doküman './error-codes' diyordu ama o dosya validations paketinde —
//  tek kaynağı korumak için buradan import ediyoruz.)
import type { ErrorCode } from '@taplink/validations'

// Tüm API cevapları bu formatta döner
// Başarılı: { success: true, data: {...} }
// Hatalı:   { success: false, code: "USERNAME_TAKEN", message?: "..." }
// NOT: Frontend 'code' değerini kendi diline çevirir — backend mesaj göndermez
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; code: ErrorCode; message?: string }

// Sayfalanmış listeler için
export type PaginatedResponse<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  hasMore: boolean
}
