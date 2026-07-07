import { prisma }     from '@taplink/db'
import { ErrorCodes } from '@taplink/validations'
import { sendEmail }  from '../auth/auth.mailer'   // Step 04 Mailjet helper (auth.email DEĞİL)

// Basit HTML escape — kullanıcı girdisi email HTML'ine gömülürken XSS önlemi
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

// ─────────────────────────────────────────
// CONTACT FORM — Lead kaydı + bildirim
// ─────────────────────────────────────────

type ContactFormInput = {
  name?:    string
  email:    string
  phone?:   string
  message?: string
}

export async function submitContactForm(
  profileId: string,
  linkId:    string,
  userId:    string,   // profil sahibi — bildirim için
  input:     ContactFormInput
): Promise<{ error: string | null }> {

  const lead = await prisma.lead.create({
    data: {
      profileId,
      linkId,
      name:    input.name ?? null,
      email:   input.email,
      phone:   input.phone ?? null,
      message: input.message ?? null,
    },
  })

  // In-app bildirim
  await prisma.notification.create({
    data: {
      userId,
      type:  'CONTACT_FORM',
      title: 'Yeni mesaj',
      body:  input.name ? `${input.name} size bir mesaj gönderdi` : 'Biri size mesaj gönderdi',
      data:  { leadId: lead.id, email: input.email, name: input.name ?? null },
    },
  })

  // Opsiyonel email bildirimi — hata olursa sessizce geç (formu engellemez)
  const profile = await prisma.profile.findUnique({
    where:  { id: profileId },
    select: { user: { select: { email: true } } },
  })
  if (profile?.user?.email) {
    const senderName = input.name ?? 'Anonim'
    const msg = input.message ?? '(mesaj yok)'
    sendEmail({
      to:          profile.user.email,
      subject:     `Taplink.my — Yeni mesaj: ${senderName}`,
      textContent: `${senderName} (${input.email}) size mesaj gönderdi:\n\n${msg}\n\nTaplink.my dashboard'unuzdan görüntüleyebilirsiniz.`,
      htmlContent: `<p><b>${esc(senderName)}</b> (${esc(input.email)}) size mesaj gönderdi:</p><blockquote>${esc(msg)}</blockquote><p>Taplink.my dashboard'unuzdan görüntüleyebilirsiniz.</p>`,
    }).catch(() => {})
  }

  return { error: null }
}

// ─────────────────────────────────────────
// EMAIL CAPTURE — Subscriber kaydı + bildirim
// ─────────────────────────────────────────

type EmailCaptureInput = {
  email: string
  name?: string
}

export async function submitEmailCapture(
  profileId: string,
  linkId:    string,
  userId:    string,
  input:     EmailCaptureInput
): Promise<{ error: string | null; alreadySubscribed: boolean }> {

  try {
    await prisma.subscriber.create({
      data: {
        profileId,
        linkId,
        email: input.email.toLowerCase().trim(),
        name:  input.name ?? null,
      },
    })
  } catch (err: any) {
    // Unique constraint (profileId, email) — zaten abone
    if (err?.code === 'P2002') {
      return { error: null, alreadySubscribed: true }
    }
    return { error: ErrorCodes.INTERNAL_ERROR, alreadySubscribed: false }
  }

  // In-app bildirim
  await prisma.notification.create({
    data: {
      userId,
      type:  'NEW_SUBSCRIBER',
      title: 'Yeni abone',
      body:  input.name ? `${input.name} (${input.email}) abone oldu` : `${input.email} abone oldu`,
      data:  { email: input.email, name: input.name ?? null },
    },
  })

  // Opsiyonel email
  const profile = await prisma.profile.findUnique({
    where:  { id: profileId },
    select: { user: { select: { email: true } } },
  })
  if (profile?.user?.email) {
    sendEmail({
      to:          profile.user.email,
      subject:     'Taplink.my — Yeni abone!',
      textContent: `${input.email} email listenize abone oldu.\n\nAbone listenizi Taplink.my dashboard'unuzdan görüntüleyebilirsiniz.`,
      htmlContent: `<p><b>${esc(input.email)}</b> email listenize abone oldu.</p><p>Abone listenizi Taplink.my dashboard'unuzdan görüntüleyebilirsiniz.</p>`,
    }).catch(() => {})
  }

  return { error: null, alreadySubscribed: false }
}
