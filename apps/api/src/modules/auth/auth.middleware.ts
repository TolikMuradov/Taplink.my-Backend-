import { FastifyRequest, FastifyReply } from 'fastify'

// Giriş zorunlu endpoint'ler için kullanılır
// Kullanım: { preHandler: requireAuth }
export async function requireAuth(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user || !request.session) {
    return reply.status(401).send({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Bu işlem için giriş yapmanız gerekiyor',
    })
  }

  const expiry = new Date(request.session.expiresAt)
  if (expiry < new Date()) {
    return reply.status(401).send({
      success: false,
      code: 'SESSION_EXPIRED',
      message: 'Oturumunuzun süresi dolmuş, tekrar giriş yapın',
    })
  }
}

// Opsiyonel auth — giriş yapılmışsa user'ı ekler, yapılmamışsa devam eder
// Public profil sayfaları gibi hem misafir hem üye görebilecek endpoint'ler için
export async function optionalAuth(
  _request: FastifyRequest,
  _reply: FastifyReply
): Promise<void> {
  // preHandler hook zaten session'ı yüklüyor (auth.plugin.ts)
  // Bu middleware sadece "giriş zorunlu değil ama varsa kullan" semantiği için
}
