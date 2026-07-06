// Projedeki tüm API hata kodları
// Backend bu kodları döner — frontend çevirir
// Yeni bir hata eklendiğinde buraya da eklenmeli

export const ErrorCodes = {
  // Auth
  EMAIL_ALREADY_EXISTS:       'EMAIL_ALREADY_EXISTS',
  INVALID_CREDENTIALS:        'INVALID_CREDENTIALS',
  EMAIL_NOT_VERIFIED:         'EMAIL_NOT_VERIFIED',
  SESSION_EXPIRED:            'SESSION_EXPIRED',
  UNAUTHORIZED:               'UNAUTHORIZED',
  TOO_MANY_REQUESTS:          'TOO_MANY_REQUESTS',

  // Kullanıcı
  USER_NOT_FOUND:             'USER_NOT_FOUND',
  USERNAME_TAKEN:             'USERNAME_TAKEN',
  INVALID_USERNAME:           'INVALID_USERNAME',

  // Profil
  PROFILE_NOT_FOUND:          'PROFILE_NOT_FOUND',
  PROFILE_IS_PRIVATE:         'PROFILE_IS_PRIVATE',

  // Link & Block
  LINK_NOT_FOUND:             'LINK_NOT_FOUND',
  LINK_LIMIT_REACHED:         'LINK_LIMIT_REACHED',
  INVALID_URL:                'INVALID_URL',
  LINK_PASSWORD_INCORRECT:    'LINK_PASSWORD_INCORRECT',
  LINK_CLICK_LIMIT_REACHED:   'LINK_CLICK_LIMIT_REACHED',
  LINK_NOT_SCHEDULED:         'LINK_NOT_SCHEDULED',    // henüz aktif değil (startsAt)
  LINK_EXPIRED:               'LINK_EXPIRED',          // süresi doldu (endsAt)
  COLLECTION_CHILD_ERROR:     'COLLECTION_CHILD_ERROR', // collection dışı blok parent alamaz

  // Dosya yükleme
  FILE_TOO_LARGE:             'FILE_TOO_LARGE',
  INVALID_FILE_TYPE:          'INVALID_FILE_TYPE',

  // Ödeme / Plan
  SUBSCRIPTION_REQUIRED:      'SUBSCRIPTION_REQUIRED', // Pro gerektiren özellik
  PAYMENT_FAILED:             'PAYMENT_FAILED',

  // Genel
  VALIDATION_ERROR:           'VALIDATION_ERROR',
  INTERNAL_ERROR:             'INTERNAL_ERROR',
  NOT_FOUND:                  'NOT_FOUND',
} as const

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes]

// API hata cevabı her zaman bu şekilde olmalı:
// { success: false, code: ErrorCode, message?: string }
// message alanı opsiyonel — sadece development modda ek detay için
