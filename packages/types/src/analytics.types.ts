export type ClickStats = {
  totalClicks: number
  totalViews: number
  // Günlük breakdown — son 30 gün
  daily: {
    date: string // "2024-01-15"
    clicks: number
    views: number
  }[]
  // Ülke breakdown
  byCountry: {
    country: string // "TH", "ID"
    clicks: number
  }[]
  // Cihaz breakdown
  byDevice: {
    device: string // "mobile", "desktop"
    clicks: number
  }[]
}

export type LinkStats = {
  linkId: string
  title: string
  clicks: number
  percentage: number // toplam içindeki yüzdesi
}
