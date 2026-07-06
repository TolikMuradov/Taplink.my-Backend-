import type { DesignSettings } from './design.types'

export type ProfileResponse = {
  id:             string
  username:       string
  displayName:    string | null
  bio:            string | null
  avatarUrl:      string | null
  backgroundUrl:  string | null
  designSettings: DesignSettings  // null gelmez — backend DEFAULT_DESIGN ile doldurur
  isPublic:       boolean
  seoTitle:       string | null
  seoDescription: string | null
}
