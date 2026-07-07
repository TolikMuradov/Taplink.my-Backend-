import type { DesignSettings } from '@taplink/types'

// Curated şablonlar — değiştirilemez hazır tasarımlar
// Her şablon tam bir DesignSettings objesidir
// Frontend bu şablonu kullanıcıya gösterir, kullanıcı seçince tüm designSettings güncellenir

export type CuratedTemplate = {
  id:          string
  name:        string
  plan:        'FREE' | 'PRO'
  previewUrl:  string     // Önizleme görseli — Cloudflare R2'de saklanır
  design:      DesignSettings
}

export const CURATED_TEMPLATES: CuratedTemplate[] = [
  {
    id:         'classic-light',
    name:       'Classic Light',
    plan:       'FREE',
    previewUrl: 'https://assets.taplink.my/templates/classic-light.jpg',
    design: {
      type:       'curated',
      templateId: 'classic-light',
      wallpaper:  { type: 'solid', color: '#ffffff' },
      header:     { layout: 'centered', avatarStyle: 'circle', showAvatar: true, showDisplayName: true, showBio: true },
      text:       { fontFamily: 'inter', titleSize: 'md', titleWeight: 'bold', titleColor: '#111111', bioColor: '#666666' },
      blocks: {
        style: 'filled', shape: 'pill',
        background: { type: 'solid', color: '#111111' },
        textColor: '#aaaaaa', titleColor: '#ffffff',
        iconPosition: 'left', shadow: 'none',
      },
      colors:     { primary: '#111111', background: '#ffffff', text: '#111111', accent: '#6366f1' },
      footer:     { showBranding: true },
    },
  },
  {
    id:         'midnight-dark',
    name:       'Midnight Dark',
    plan:       'FREE',
    previewUrl: 'https://assets.taplink.my/templates/midnight-dark.jpg',
    design: {
      type:       'curated',
      templateId: 'midnight-dark',
      wallpaper:  { type: 'solid', color: '#0f0f0f' },
      header:     { layout: 'centered', avatarStyle: 'circle', showAvatar: true, showDisplayName: true, showBio: true },
      text:       { fontFamily: 'inter', titleSize: 'md', titleWeight: 'bold', titleColor: '#ffffff', bioColor: '#aaaaaa' },
      blocks: {
        style: 'outline', shape: 'pill',
        background: { type: 'transparent' },
        textColor: '#aaaaaa', titleColor: '#ffffff',
        borderColor: '#ffffff',
        iconPosition: 'left', shadow: 'none',
      },
      colors:     { primary: '#ffffff', background: '#0f0f0f', text: '#ffffff', accent: '#6366f1' },
      footer:     { showBranding: true },
    },
  },
  {
    id:         'aurora-gradient',
    name:       'Aurora Gradient',
    plan:       'PRO',
    previewUrl: 'https://assets.taplink.my/templates/aurora-gradient.jpg',
    design: {
      type:       'curated',
      templateId: 'aurora-gradient',
      wallpaper:  { type: 'gradient', from: '#6366f1', to: '#8b5cf6', direction: '135deg' },
      header:     { layout: 'centered', avatarStyle: 'circle', showAvatar: true, showDisplayName: true, showBio: true },
      text:       { fontFamily: 'poppins', titleSize: 'lg', titleWeight: 'bold', titleColor: '#ffffff', bioColor: '#cccccc' },
      blocks: {
        style: 'blur', shape: 'pill',
        background: { type: 'blur', opacity: 20 },
        textColor: '#cccccc', titleColor: '#ffffff',
        iconPosition: 'left', shadow: 'none',
      },
      colors:     { primary: '#ffffff', background: '#6366f1', text: '#ffffff', accent: '#f59e0b' },
      footer:     { showBranding: true },
    },
  },
  {
    id:         'minimal-sans',
    name:       'Minimal Sans',
    plan:       'PRO',
    previewUrl: 'https://assets.taplink.my/templates/minimal-sans.jpg',
    design: {
      type:       'curated',
      templateId: 'minimal-sans',
      wallpaper:  { type: 'solid', color: '#f8f8f8' },
      header:     { layout: 'left', avatarStyle: 'square', showAvatar: true, showDisplayName: true, showBio: true },
      text:       { fontFamily: 'dm-sans', titleSize: 'lg', titleWeight: 'medium', titleColor: '#1a1a1a', bioColor: '#555555' },
      blocks: {
        style: 'soft', shape: 'rounded',
        background: { type: 'solid', color: '#f0f0f0' },
        textColor: '#555555', titleColor: '#1a1a1a',
        iconPosition: 'left', shadow: 'none',
      },
      colors:     { primary: '#1a1a1a', background: '#f8f8f8', text: '#1a1a1a', accent: '#1a1a1a' },
      footer:     { showBranding: true },
    },
  },
]

// Plan kontrolü — şablona erişim için plan yeterli mi?
export function isTemplateAvailableForPlan(templateId: string, plan: string): boolean {
  const template = CURATED_TEMPLATES.find(t => t.id === templateId)
  if (!template) return false
  if (template.plan === 'FREE') return true
  return plan === 'PRO' || plan === 'BUSINESS'
}

export const TEMPLATE_IDS = CURATED_TEMPLATES.map(t => t.id)
