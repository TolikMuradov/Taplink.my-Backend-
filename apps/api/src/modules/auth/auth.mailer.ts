import Mailjet from 'node-mailjet'

const mailjet = new Mailjet({
  apiKey: process.env.MAILJET_API_KEY!,
  apiSecret: process.env.MAILJET_SECRET_KEY!,
})

const FROM_EMAIL = process.env.MAILJET_FROM_EMAIL || 'noreply@taplink.my'
const FROM_NAME = process.env.MAILJET_FROM_NAME || 'Taplink.my'

// Desteklenen diller — yeni dil eklenince buraya ve translations objesine ekle
export type SupportedLanguage = 'en' | 'th' | 'id' | 'tl' | 'vi' | 'tr'

// Email çevirileri — yeni dil için yeni blok ekle
const translations: Record<SupportedLanguage, {
  verification: { subject: string; heading: string; body: string; button: string; expiry: string; ignore: string }
  resetPassword: { subject: string; heading: string; body: string; button: string; expiry: string; ignore: string }
}> = {
  en: {
    verification: {
      subject:  'Taplink.my — Verify your email address',
      heading:  'Verify Your Email Address',
      body:     'Welcome to Taplink.my! Click the button below to verify your email and activate your account.',
      button:   'Verify My Email',
      expiry:   'This link is valid for 24 hours.',
      ignore:   'If you did not create an account, you can ignore this email.',
    },
    resetPassword: {
      subject:  'Taplink.my — Reset Your Password',
      heading:  'Reset Your Password',
      body:     'We received a request to reset your password. Click the button below to proceed.',
      button:   'Reset My Password',
      expiry:   'This link is valid for 1 hour.',
      ignore:   'If you did not request a password reset, your password will remain unchanged.',
    },
  },
  th: {
    verification: {
      subject:  'Taplink.my — ยืนยันอีเมลของคุณ',
      heading:  'ยืนยันอีเมลของคุณ',
      body:     'ยินดีต้อนรับสู่ Taplink.my! คลิกปุ่มด้านล่างเพื่อยืนยันอีเมลและเปิดใช้งานบัญชีของคุณ',
      button:   'ยืนยันอีเมลของฉัน',
      expiry:   'ลิงก์นี้มีอายุ 24 ชั่วโมง',
      ignore:   'หากคุณไม่ได้สร้างบัญชี คุณสามารถเพิกเฉยต่ออีเมลนี้ได้',
    },
    resetPassword: {
      subject:  'Taplink.my — รีเซ็ตรหัสผ่านของคุณ',
      heading:  'รีเซ็ตรหัสผ่านของคุณ',
      body:     'เราได้รับคำขอรีเซ็ตรหัสผ่านของคุณ คลิกปุ่มด้านล่างเพื่อดำเนินการต่อ',
      button:   'รีเซ็ตรหัสผ่านของฉัน',
      expiry:   'ลิงก์นี้มีอายุ 1 ชั่วโมง',
      ignore:   'หากคุณไม่ได้ขอรีเซ็ตรหัสผ่าน รหัสผ่านของคุณจะไม่เปลี่ยนแปลง',
    },
  },
  id: {
    verification: {
      subject:  'Taplink.my — Verifikasi alamat email Anda',
      heading:  'Verifikasi Email Anda',
      body:     'Selamat datang di Taplink.my! Klik tombol di bawah untuk memverifikasi email Anda.',
      button:   'Verifikasi Email Saya',
      expiry:   'Tautan ini berlaku selama 24 jam.',
      ignore:   'Jika Anda tidak membuat akun, abaikan email ini.',
    },
    resetPassword: {
      subject:  'Taplink.my — Atur Ulang Kata Sandi',
      heading:  'Atur Ulang Kata Sandi',
      body:     'Kami menerima permintaan untuk mengatur ulang kata sandi Anda.',
      button:   'Atur Ulang Kata Sandi',
      expiry:   'Tautan ini berlaku selama 1 jam.',
      ignore:   'Jika Anda tidak meminta pengaturan ulang, kata sandi Anda tidak akan berubah.',
    },
  },
  tl: {
    verification: {
      subject:  'Taplink.my — I-verify ang iyong email',
      heading:  'I-verify ang Iyong Email',
      body:     'Maligayang pagdating sa Taplink.my! I-click ang button sa ibaba para i-verify ang iyong email.',
      button:   'I-verify ang Aking Email',
      expiry:   'Ang link na ito ay may bisa sa loob ng 24 na oras.',
      ignore:   'Kung hindi ka gumawa ng account, maaari mong balewalain ang email na ito.',
    },
    resetPassword: {
      subject:  'Taplink.my — I-reset ang Iyong Password',
      heading:  'I-reset ang Iyong Password',
      body:     'Nakatanggap kami ng kahilingan na i-reset ang iyong password.',
      button:   'I-reset ang Aking Password',
      expiry:   'Ang link na ito ay may bisa sa loob ng 1 oras.',
      ignore:   'Kung hindi ka humingi ng reset, hindi magbabago ang iyong password.',
    },
  },
  vi: {
    verification: {
      subject:  'Taplink.my — Xác minh địa chỉ email của bạn',
      heading:  'Xác Minh Email Của Bạn',
      body:     'Chào mừng đến với Taplink.my! Nhấp vào nút bên dưới để xác minh email của bạn.',
      button:   'Xác Minh Email Của Tôi',
      expiry:   'Liên kết này có hiệu lực trong 24 giờ.',
      ignore:   'Nếu bạn không tạo tài khoản, bạn có thể bỏ qua email này.',
    },
    resetPassword: {
      subject:  'Taplink.my — Đặt lại mật khẩu của bạn',
      heading:  'Đặt Lại Mật Khẩu',
      body:     'Chúng tôi nhận được yêu cầu đặt lại mật khẩu của bạn.',
      button:   'Đặt Lại Mật Khẩu',
      expiry:   'Liên kết này có hiệu lực trong 1 giờ.',
      ignore:   'Nếu bạn không yêu cầu đặt lại, mật khẩu của bạn sẽ không thay đổi.',
    },
  },
  tr: {
    verification: {
      subject:  'Taplink.my — Email adresinizi doğrulayın',
      heading:  'Email Adresinizi Doğrulayın',
      body:     'Taplink.my\'ye hoş geldiniz! Email adresinizi doğrulamak için aşağıdaki butona tıklayın.',
      button:   'Email Adresimi Doğrula',
      expiry:   'Bu link 24 saat geçerlidir.',
      ignore:   'Eğer bu isteği siz yapmadıysanız bu emaili görmezden gelebilirsiniz.',
    },
    resetPassword: {
      subject:  'Taplink.my — Şifre Sıfırlama',
      heading:  'Şifrenizi Sıfırlayın',
      body:     'Şifrenizi sıfırlamak için bir istek alındı. Aşağıdaki butona tıklayın.',
      button:   'Şifremi Sıfırla',
      expiry:   'Bu link 1 saat geçerlidir.',
      ignore:   'Eğer bu isteği siz yapmadıysanız şifreniz değişmeyecektir.',
    },
  },
}

// Geçerli dil değilse İngilizce'ye düş
function getLang(lang?: string | null): SupportedLanguage {
  const supported: SupportedLanguage[] = ['en', 'th', 'id', 'tl', 'vi', 'tr']
  return supported.includes(lang as SupportedLanguage)
    ? (lang as SupportedLanguage)
    : 'en'
}

// Email şablonu — tüm diller aynı HTML yapısını kullanır, sadece metin değişir
function buildEmailHtml(heading: string, body: string, buttonText: string, buttonUrl: string, expiry: string, ignore: string): string {
  return `
<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #333;">${heading}</h2>
  <p>${body}</p>
  <a href="${buttonUrl}"
     style="display: inline-block; background: #6366f1; color: white;
            padding: 12px 24px; border-radius: 6px; text-decoration: none;
            font-weight: bold; margin: 16px 0;">
    ${buttonText}
  </a>
  <p style="color: #666; font-size: 14px;">${expiry}<br>${ignore}</p>
  <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
  <p style="color: #999; font-size: 12px;">Taplink.my</p>
</body>
</html>`.trim()
}

interface SendEmailOptions {
  to: string
  subject: string
  htmlContent: string
  textContent: string
}

export async function sendEmail(options: SendEmailOptions): Promise<void> {
  try {
    await mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: { Email: FROM_EMAIL, Name: FROM_NAME },
          To: [{ Email: options.to }],
          Subject: options.subject,
          TextPart: options.textContent,
          HTMLPart: options.htmlContent,
        },
      ],
    })
    console.log(`[MAIL] Gönderildi → ${options.to} | Konu: ${options.subject}`)
  } catch (error: any) {
    console.error(`[MAIL] Gönderilemedi → ${options.to}`, error?.message)
  }
}

// Email doğrulama — kullanıcının dil tercihine göre
export async function sendVerificationEmail(
  to: string,
  verificationUrl: string,
  language?: string | null
): Promise<void> {
  const t = translations[getLang(language)].verification
  await sendEmail({
    to,
    subject: t.subject,
    textContent: `${t.heading}\n\n${t.body}\n\n${verificationUrl}\n\n${t.expiry}\n${t.ignore}\n\nTaplink.my`,
    htmlContent: buildEmailHtml(t.heading, t.body, t.button, verificationUrl, t.expiry, t.ignore),
  })
}

// Şifre sıfırlama — kullanıcının dil tercihine göre
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  language?: string | null
): Promise<void> {
  const t = translations[getLang(language)].resetPassword
  await sendEmail({
    to,
    subject: t.subject,
    textContent: `${t.heading}\n\n${t.body}\n\n${resetUrl}\n\n${t.expiry}\n${t.ignore}\n\nTaplink.my`,
    htmlContent: buildEmailHtml(t.heading, t.body, t.button, resetUrl, t.expiry, t.ignore),
  })
}
