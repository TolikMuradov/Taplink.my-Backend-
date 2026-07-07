import { prisma } from '@taplink/db'

// Okunmamış bildirim sayısı — dashboard badge (polling)
export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, isRead: false },
  })
}

// Son bildirimleri listele (sayfalı)
export async function getNotifications(userId: string, page = 1, pageSize = 20) {
  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where:   { userId },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.notification.count({ where: { userId } }),
  ])

  return { items, total, page, pageSize, hasMore: page * pageSize < total }
}

// Tekil bildirimi okundu yap — sadece kendi bildirimin
export async function markAsRead(notificationId: string, userId: string): Promise<boolean> {
  const result = await prisma.notification.updateMany({
    where: { id: notificationId, userId },
    data:  { isRead: true },
  })
  return result.count > 0
}

// Tümünü okundu yap
export async function markAllAsRead(userId: string): Promise<void> {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data:  { isRead: true },
  })
}
