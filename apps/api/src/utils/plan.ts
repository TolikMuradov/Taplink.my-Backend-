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

// Yeterli plan yoksa 403 döner ve true return eder (işlemi durdur).
// NOT: Step 12'de bu fonksiyon planExpiresAt kontrolü için async'e dönüştürülecek
// (iptal edilmiş ama dönemi bitmemiş abonelikler PRO sayılsın diye).
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
