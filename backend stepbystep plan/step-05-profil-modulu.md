# Step 05 — Profil Modülü

**Bağımlılık:** Step 01, 02, 03, 04 tamamlanmış olmalı.  
**Sonraki Step:** Step 06 (Link Yönetimi) bu step'e bağımlıdır.

---

## Amaç

Giriş yapmış kullanıcının kendi profilini yönetmesini sağlamak. Bu step bittiğinde kullanıcı profilini düzenleyebilir, tema seçebilir, SEO ayarlarını yapabilir. Herkese açık profil sayfası (ziyaretçiler için) Step 12'de yapılacak — bu step sadece sahibin kendi profilini yönettiği endpoint'lerdir.

**Bu step'te yapılmaz:** Avatar/arkaplan yükleme (Step 07 — Cloudflare R2), link yönetimi (Step 06).

---

## Neden Bu Kararlar?

**Service katmanı neden ayrı?**  
`profile.routes.ts` → isteği alır, doğrular, cevabı döner.  
`profile.service.ts` → iş mantığını çalıştırır, veritabanıyla konuşur.  
Bu ayrım sayesinde aynı iş mantığını farklı yerlerden çağırabilirsin (route'dan da, başka bir service'ten de). Test yazmak da kolaylaşır. Spaghetti kod olmaz.

**Plan bazlı özellik kilidi bu step'te**  
`type: 'curated'` olan PRO şablonlar sadece PRO/BUSINESS'e açık. `type: 'custom'` (elle özelleştirme) sadece PRO/BUSINESS'e açık — FREE kullanıcılar yalnızca curated FREE şablon seçebilir. `footer.showBranding: false` yalnızca PRO+. Bunu ödeme sistemi (Step 12) gelmeden önce kodda yerleştiriyoruz çünkü sonradan eklemek mevcut kodu değiştirmek demek — risk yüksek.

**`designSettings` neden tek JSON alanı?**  
Step 03'te detaylandırıldı: wallpaper/header/text/buttons/colors/footer tüm tasarım kararları tek `designSettings Json?` alanında saklanır. Tip güvenliği TypeScript + Zod ile sağlanır. Yeni bir tasarım özelliği eklemek = JSON içine yeni alan = migration yok, sadece kod güncellemesi.

**`type: 'curated'` vs `type: 'custom'`**  
`curated`: Kullanıcı hazır şablon seçer → tüm `designSettings` o şablonun tanımıyla değiştirilir. `custom`: Kullanıcı her alt ayarı (wallpaper/buttons/font vb.) ayrı ayrı değiştirir. Free kullanıcılar sadece `curated` FREE şablon seçebilir; `custom` veya PRO şablonlar plan engeline takılır.

---

## Gereksinimler

- Step 04 tamamlanmış (`requireAuth` middleware hazır)
- `packages/validations` içinde `UpdateProfileSchema` yazılmış (Step 03'te yapıldı)

---

## Klasör Yapısı (Hedef)

```
apps/api/src/modules/profile/
├── profile.templates.ts  ← Curated şablon tanımları (sabit veri)
├── profile.service.ts    ← İş mantığı ve veritabanı işlemleri
└── profile.routes.ts     ← HTTP endpoint'leri

apps/api/src/utils/
└── plan.ts               ← requirePlan / hasPlan yardımcıları
```

---

## TODO

### Bölüm 5.1 — Curated Şablon Listesi (Sabit Veri)

Curated şablonlar veritabanında değil, kod içinde tutulur. Yeni şablon = bu listeye bir obje ekle + frontend'de görseli tanımla.

- [ ] `apps/api/src/modules/profile/profile.templates.ts` oluştur:
  ```typescript
  import type { DesignSettings } from '@taplink/types'

  // Curated şablonlar — değiştirilemez hazır tasarımlar
  // Her şablon tam bir DesignSettings objesidir
  // Frontend bu şablonu kullanıcıya gösterir, kullanıcı seçince tüm designSettings güncellenir
  // Animasyonlu wallpaper ve özel çerçeveler designer ile eklenir (Faz 2)

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
  ```

### Bölüm 5.2 — Plan Kontrol Yardımcısı

Bu yardımcı Step 06, 07 ve sonrasında da kullanılacak — merkezi bir yerde olsun.

- [ ] `apps/api/src/utils/plan.ts` oluştur:
  ```typescript
  import { Plan } from '@taplink/db'
  import { ErrorCodes } from '@taplink/validations'
  import { FastifyReply } from 'fastify'

  // Plan hiyerarşisi
  const PLAN_RANK: Record<Plan, number> = {
    FREE:     0,
    PRO:      1,
    BUSINESS: 2,
  }

  // Kullanıcının planı gerekli planı karşılıyor mu?
  export function hasPlan(userPlan: Plan, required: Plan): boolean {
    return PLAN_RANK[userPlan] >= PLAN_RANK[required]
  }

  // Yeterli plan yoksa 403 döner ve true return eder (işlemi durdur)
  export function requirePlan(
    userPlan: Plan,
    required: Plan,
    reply: FastifyReply
  ): boolean {
    if (!hasPlan(userPlan, required)) {
      reply.status(403).send({
        success: false,
        code: ErrorCodes.SUBSCRIPTION_REQUIRED,
        message: `Bu özellik için ${required} planı gerekiyor`,
      })
      return true // "durdurucu" döndü
    }
    return false
  }
  ```

### Bölüm 5.3 — Profil Service

- [ ] `apps/api/src/modules/profile/profile.service.ts` oluştur:
  ```typescript
  import { prisma } from '@taplink/db'
  import { UpdateProfileInput, ErrorCodes } from '@taplink/validations'
  import { DEFAULT_DESIGN, type DesignSettings } from '@taplink/types'
  import { CURATED_TEMPLATES, isTemplateAvailableForPlan } from './profile.templates'

  // Profili getir — kullanıcı ID'sine göre
  export async function getProfileByUserId(userId: string) {
    const profile = await prisma.profile.findUnique({
      where: { userId },
      select: {
        id:             true,
        username:       true,
        displayName:    true,
        bio:            true,
        avatarUrl:      true,
        backgroundUrl:  true,
        designSettings: true,
        isPublic:       true,
        seoTitle:       true,
        seoDescription: true,
        updatedAt:      true,
      },
    })

    return profile
  }

  // Plan bazlı designSettings doğrulama
  // Döner: null = geçerli, string = hata kodu
  function validateDesignForPlan(
    design: DesignSettings,
    userPlan: string
  ): { code: string; message: string } | null {
    const isPro = userPlan === 'PRO' || userPlan === 'BUSINESS'

    // custom tip (elle özelleştirme) sadece PRO+
    if (design.type === 'custom' && !isPro) {
      return { code: ErrorCodes.SUBSCRIPTION_REQUIRED, message: 'Özel tasarım PRO plan gerektirir' }
    }

    // curated şablon — PRO şablonu FREE ile seçilemez
    if (design.type === 'curated' && design.templateId) {
      if (!isTemplateAvailableForPlan(design.templateId, userPlan)) {
        return { code: ErrorCodes.SUBSCRIPTION_REQUIRED, message: 'Bu şablon PRO plan gerektirir' }
      }
    }

    // Branding kaldırma — sadece PRO+
    if (design.footer?.showBranding === false && !isPro) {
      return { code: ErrorCodes.SUBSCRIPTION_REQUIRED, message: 'Taplink markasını kaldırmak PRO plan gerektirir' }
    }

    return null
  }

  // Profili güncelle
  export async function updateProfile(
    userId: string,
    userPlan: string,
    data: UpdateProfileInput
  ): Promise<{ success: true } | { success: false; code: string; message: string }> {

    // designSettings varsa plan kontrolü yap
    if (data.designSettings) {
      const error = validateDesignForPlan(data.designSettings as DesignSettings, userPlan)
      if (error) return { success: false, ...error }

      // curated seçildiyse şablon listede var mı kontrol et
      if (data.designSettings.type === 'curated' && data.designSettings.templateId) {
        const templateExists = CURATED_TEMPLATES.some(t => t.id === data.designSettings!.templateId)
        if (!templateExists) {
          return { success: false, code: ErrorCodes.VALIDATION_ERROR, message: 'Geçersiz şablon ID' }
        }
      }
    }

    await prisma.profile.update({
      where: { userId },
      data: {
        ...(data.displayName    !== undefined && { displayName:    data.displayName }),
        ...(data.bio            !== undefined && { bio:            data.bio }),
        ...(data.designSettings !== undefined && { designSettings: data.designSettings }),
        ...(data.seoTitle       !== undefined && { seoTitle:       data.seoTitle }),
        ...(data.seoDescription !== undefined && { seoDescription: data.seoDescription }),
        ...(data.isPublic       !== undefined && { isPublic:       data.isPublic }),
      },
    })

    return { success: true }
  }

  // Profili sıfırla — tüm özelleştirmeleri kaldır, varsayılan tasarıma döner
  export async function resetProfile(userId: string) {
    await prisma.profile.update({
      where: { userId },
      data: {
        displayName:    null,
        bio:            null,
        avatarUrl:      null,
        backgroundUrl:  null,
        designSettings: DEFAULT_DESIGN,   // packages/types'dan gelen varsayılan
        seoTitle:       null,
        seoDescription: null,
      },
    })
  }
  ```

### Bölüm 5.4 — Profil Route'ları

- [ ] `apps/api/src/modules/profile/profile.routes.ts` oluştur:
  ```typescript
  import { FastifyInstance } from 'fastify'
  import { prisma } from '@taplink/db'
  import { requireAuth } from '../auth/auth.middleware'
  import { UpdateProfileSchema, ErrorCodes } from '@taplink/validations'
  import { CURATED_TEMPLATES } from './profile.templates'
  import {
    getProfileByUserId,
    updateProfile,
    resetProfile,
  } from './profile.service'

  export async function profileRoutes(fastify: FastifyInstance) {

    // Kendi profilimi getir
    fastify.get(
      '/api/profile/me',
      { preHandler: requireAuth },
      async (request, reply) => {
        const profile = await getProfileByUserId(request.user!.id)

        if (!profile) {
          // Profil yok: Step 04'teki hook email doğrulanmadan tetiklenmedi veya hata aldı.
          // Frontend bunu "onboarding" akışına yönlendirme sinyali olarak kullanır.
          // Bu endpoint 404 dönünce frontend /dashboard/setup sayfasına yönlendirir.
          // Gerekirse burada otomatik profil oluşturma da yapılabilir (fallback):
          //
          // const rawPrefix = request.user!.email.split('@')[0]
          //   .toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) || 'user'
          // const username = `${rawPrefix}${Date.now().toString(36)}`
          // const newProfile = await prisma.profile.create({
          //   data: { userId: request.user!.id, username, isPublic: false }
          // })
          // return reply.send({ success: true, data: newProfile })
          //
          // Şimdilik 404 dön, frontend yönetir.
          return reply.status(404).send({
            success: false,
            code: ErrorCodes.PROFILE_NOT_FOUND,
          })
        }

        return reply.send({ success: true, data: profile })
      }
    )

    // Profilimi güncelle
    fastify.patch(
      '/api/profile/me',
      { preHandler: requireAuth },
      async (request, reply) => {
        const parsed = UpdateProfileSchema.safeParse(request.body)

        if (!parsed.success) {
          return reply.status(400).send({
            success: false,
            code: ErrorCodes.VALIDATION_ERROR,
            message: parsed.error.errors[0]?.message,
          })
        }

        // Plan bilgisini veritabanından al — Better Auth session'ı plan içermeyebilir
        const dbUser = await prisma.user.findUnique({
          where:  { id: request.user!.id },
          select: { plan: true },
        })
        const userPlan = dbUser?.plan ?? 'FREE'

        const result = await updateProfile(request.user!.id, userPlan, parsed.data)

        if (!result.success) {
          return reply.status(403).send(result)
        }

        fastify.log.info(
          { userId: request.user!.id },
          '[PROFILE] Profil güncellendi'
        )

        return reply.send({ success: true, data: { message: 'Profil güncellendi' } })
      }
    )

    // Profilimi sıfırla — tüm özelleştirmeleri kaldır, varsayılan tasarıma döner
    fastify.delete(
      '/api/profile/me/customization',
      { preHandler: requireAuth },
      async (request, reply) => {
        await resetProfile(request.user!.id)

        fastify.log.info(
          { userId: request.user!.id },
          '[PROFILE] Profil sıfırlandı'
        )

        return reply.send({ success: true, data: { message: 'Profil sıfırlandı' } })
      }
    )

    // Curated şablon listesi — giriş gerekmez
    // Frontend bu listeyi kullanarak şablon galerisini doldurur
    // Her şablonda plan bilgisi var — frontend PRO olanları kilitli gösterir
    fastify.get('/api/templates', async (_request, reply) => {
      // Design objesini döndür, previewUrl ve meta bilgileri de dahil
      const templates = CURATED_TEMPLATES.map(t => ({
        id:         t.id,
        name:       t.name,
        plan:       t.plan,
        previewUrl: t.previewUrl,
        design:     t.design,
      }))
      return reply.send({ success: true, data: templates })
    })

    // Username müsait mi kontrol et — kayıt olmadan da sorulabilir
    fastify.get(
      '/api/profile/check-username/:username',
      async (request, reply) => {
        const { username } = request.params as { username: string }

        if (!username || username.length < 3 || username.length > 30) {
          return reply.status(400).send({
            success: false,
            code: ErrorCodes.INVALID_USERNAME,
          })
        }

        const existing = await prisma.profile.findUnique({
          where:  { username: username.toLowerCase() },
          select: { id: true },
        })

        return reply.send({
          success: true,
          data: { available: !existing },
        })
      }
    )
  }
  ```

### Bölüm 5.5 — `index.ts`'e Bağla

- [ ] `apps/api/src/index.ts` dosyasını aç ve ekle:
  ```typescript
  import { profileRoutes } from './modules/profile/profile.routes'

  // Diğer register'ların altına:
  server.register(profileRoutes)
  ```

### Bölüm 5.6 — Test

Sunucuyu başlat: `pnpm --filter @taplink/api dev`  
Önce Step 04'teki giriş testini çalıştırarak `cookies.txt`'yi oluştur.

- [ ] **Profili getir:**
  ```bash
  curl -b cookies.txt http://localhost:3001/api/profile/me
  ```
  ✓ Profil JSON dönmeli; `designSettings` alanı `DEFAULT_DESIGN` değerlerini içermeli

- [ ] **Curated FREE şablon seç:**
  ```bash
  curl -b cookies.txt -X PATCH http://localhost:3001/api/profile/me \
    -H "Content-Type: application/json" \
    -d '{
      "displayName": "Test Kullanıcı",
      "bio": "Merhaba!",
      "designSettings": {
        "type": "curated",
        "templateId": "classic-light",
        "wallpaper": { "type": "solid", "color": "#ffffff" },
        "header": { "layout": "centered", "avatarStyle": "circle", "showAvatar": true, "showDisplayName": true, "showBio": true },
        "text": { "fontFamily": "inter", "titleSize": "md", "titleWeight": "bold", "titleColor": "#111111", "bioColor": "#666666" },
        "buttons": { "style": "filled", "shape": "pill", "backgroundColor": "#111111", "textColor": "#ffffff", "iconPosition": "left" },
        "colors": { "primary": "#111111", "background": "#ffffff", "text": "#111111", "accent": "#6366f1" },
        "footer": { "showBranding": true }
      }
    }'
  ```
  ✓ `{ "success": true }` dönmeli

- [ ] **PRO şablonu FREE hesapla dene:**
  ```bash
  curl -b cookies.txt -X PATCH http://localhost:3001/api/profile/me \
    -H "Content-Type: application/json" \
    -d '{
      "designSettings": {
        "type": "curated",
        "templateId": "aurora-gradient",
        "wallpaper": { "type": "gradient", "from": "#6366f1", "to": "#8b5cf6", "direction": "135deg" },
        "header": { "layout": "centered", "avatarStyle": "circle", "showAvatar": true, "showDisplayName": true, "showBio": true },
        "text": { "fontFamily": "poppins", "titleSize": "lg", "titleWeight": "bold", "titleColor": "#ffffff", "bioColor": "rgba(255,255,255,0.8)" },
        "buttons": { "style": "blur", "shape": "pill", "backgroundColor": "rgba(255,255,255,0.2)", "textColor": "#ffffff", "iconPosition": "left" },
        "colors": { "primary": "#ffffff", "background": "#6366f1", "text": "#ffffff", "accent": "#f59e0b" },
        "footer": { "showBranding": true }
      }
    }'
  ```
  ✓ `403` + `SUBSCRIPTION_REQUIRED` dönmeli

- [ ] **Custom tip ile FREE hesap → plan hatası:**
  ```bash
  curl -b cookies.txt -X PATCH http://localhost:3001/api/profile/me \
    -H "Content-Type: application/json" \
    -d '{
      "designSettings": {
        "type": "custom",
        "wallpaper": { "type": "solid", "color": "#ff0000" },
        "header": { "layout": "centered", "avatarStyle": "circle", "showAvatar": true, "showDisplayName": true, "showBio": true },
        "text": { "fontFamily": "inter", "titleSize": "md", "titleWeight": "bold", "titleColor": "#ffffff", "bioColor": "#cccccc" },
        "buttons": { "style": "filled", "shape": "pill", "backgroundColor": "#ffffff", "textColor": "#ff0000", "iconPosition": "left" },
        "colors": { "primary": "#ff0000", "background": "#ff0000", "text": "#ffffff", "accent": "#ffffff" },
        "footer": { "showBranding": true }
      }
    }'
  ```
  ✓ `403` + `SUBSCRIPTION_REQUIRED` dönmeli — custom tasarım PRO gerektirir

- [ ] **Şablon listesi:**
  ```bash
  curl http://localhost:3001/api/templates
  ```
  ✓ 4 şablon dönmeli: `classic-light` ve `midnight-dark` FREE, `aurora-gradient` ve `minimal-sans` PRO

- [ ] **Username kontrolü:**
  ```bash
  curl http://localhost:3001/api/profile/check-username/testuser
  ```
  ✓ `{ available: false }` dönmeli (Step 04'te oluşturuldu)

  ```bash
  curl http://localhost:3001/api/profile/check-username/musait-kullanici
  ```
  ✓ `{ available: true }` dönmeli

- [ ] **Profil sıfırla:**
  ```bash
  curl -b cookies.txt -X DELETE http://localhost:3001/api/profile/me/customization
  ```
  ✓ `{ success: true }` dönmeli; Prisma Studio'da `designSettings` `DEFAULT_DESIGN`'a dönmüş olmalı

---

## Debug Notları

**"Cannot read properties of null (reading 'id')"**  
→ `request.user` null — middleware düzgün çalışmıyor veya cookie gönderilmiyor.  
→ `curl -b cookies.txt` ile çağır; `cookies.txt` dosyasının boş olmadığını kontrol et.

**"Profile not found" ama kayıt yapıldı**  
→ Step 04'teki kayıt hook'u profili oluşturmamış olabilir.  
→ Prisma Studio'da `profile` tablosunu kontrol et (`pnpm --filter @taplink/db studio`).  
→ Boşsa: kayıt hook'una bak (`auth.instance.ts`'deki `databaseHooks.user.create.after`).

**"Validation error: invalid templateId"**  
→ Gönderilen `templateId` `CURATED_TEMPLATES` listesinde yok.  
→ `/api/templates` endpoint'inden geçerli ID'leri al, birini kullan.

**"SUBSCRIPTION_REQUIRED" beklenmedik yerde**  
→ Test hesabının planı `FREE`. Bölüm 5.6'daki PRO testlerini FREE hesapla çalıştırıyorsun.  
→ PRO davranışı test etmek için: Prisma Studio'da `user` tablosunda `plan` alanını geçici olarak `PRO` yap, tekrar dene, sonra geri al.

**TypeScript hatası: "Type 'Json' is not assignable to type 'DesignSettings'"**  
→ Prisma'nın `Json` tipi ile `DesignSettings` tipi arasında uyumsuzluk.  
→ Service'te cast ekle: `profile.designSettings as unknown as DesignSettings`

> **Genel kural:** Service katmanında hata varsa terminalde Pino log çıktısı görünür. "Hata var" demek yerine tam log satırını paylaş.

---

## Güvenlik Notları

- Tüm güncelleme endpoint'leri `requireAuth` ile korunuyor — kimlik doğrulaması olmadan erişilemez.
- Kullanıcı sadece kendi profilini güncelleyebilir — `where: { userId: request.user!.id }` bunu garantiler.
- `designSettings` içindeki renk ve URL değerlerinin Zod validasyonu Step 03'te tanımlı — CSS injection ve XSS engelleniyor.
- Şablon ID'leri sabit `CURATED_TEMPLATES` listesi üzerinden kontrol ediliyor — rastgele string kabul edilmiyor.
- Plan kısıtlaması service katmanında uygulanıyor — frontend atlatamaz, her zaman backend kontrol eder.
- `bio` ve `displayName` için maksimum karakter sınırı Step 03'te tanımlı — veritabanı taşması olmaz.

---

## Teslim Kriterleri

- [ ] `GET /api/profile/me` → cookie ile profil bilgisi ve `designSettings` dönüyor, cookie olmadan `401`
- [ ] `PATCH /api/profile/me` → `displayName`, `bio`, FREE curated şablon ile `designSettings` güncellenebiliyor
- [ ] `PATCH /api/profile/me` → PRO şablon veya `type: 'custom'` ile FREE hesap `403` + `SUBSCRIPTION_REQUIRED` alıyor
- [ ] `GET /api/templates` → 4 şablon dönüyor, giriş gerekmeden çalışıyor; her şablonda `id`, `name`, `plan`, `previewUrl`, `design` var
- [ ] `GET /api/profile/check-username/:username` → mevcut username `available: false`, yeni username `available: true`
- [ ] `DELETE /api/profile/me/customization` → Prisma Studio'da `designSettings` `DEFAULT_DESIGN` değerine dönmüş
- [ ] TypeScript derleme hatası yok (`pnpm --filter @taplink/api build`)
