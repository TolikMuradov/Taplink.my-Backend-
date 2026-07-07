import { prisma } from '@taplink/db'

// Lead listesi (sayfalı)
export async function getLeads(profileId: string, page = 1, pageSize = 50) {
  const [items, total] = await Promise.all([
    prisma.lead.findMany({
      where:   { profileId },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.lead.count({ where: { profileId } }),
  ])
  return { items, total, page, pageSize, hasMore: page * pageSize < total }
}

// Abone listesi (sayfalı)
export async function getSubscribers(profileId: string, page = 1, pageSize = 50) {
  const [items, total] = await Promise.all([
    prisma.subscriber.findMany({
      where:   { profileId },
      orderBy: { createdAt: 'desc' },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
    }),
    prisma.subscriber.count({ where: { profileId } }),
  ])
  return { items, total, page, pageSize, hasMore: page * pageSize < total }
}

// CSV injection koruması — =,+,-,@ ile başlayan değerleri tırnakla ve öne ' ekle
function csvCell(value: string): string {
  let v = value ?? ''
  if (/^[=+\-@]/.test(v)) v = `'${v}`
  if (/[",\n]/.test(v)) v = `"${v.replace(/"/g, '""')}"`
  return v
}

// Abone CSV
export async function exportSubscribersCsv(profileId: string): Promise<string> {
  const subscribers = await prisma.subscriber.findMany({
    where:   { profileId },
    orderBy: { createdAt: 'asc' },
    select:  { email: true, name: true, createdAt: true },
  })

  const header = 'Email,Name,Subscribed At\n'
  const rows = subscribers.map((s) =>
    [csvCell(s.email), csvCell(s.name ?? ''), s.createdAt.toISOString()].join(',')
  ).join('\n')

  return header + rows
}

// Lead CSV
export async function exportLeadsCsv(profileId: string): Promise<string> {
  const leads = await prisma.lead.findMany({
    where:   { profileId },
    orderBy: { createdAt: 'asc' },
    select:  { name: true, email: true, phone: true, message: true, createdAt: true },
  })

  const header = 'Name,Email,Phone,Message,Date\n'
  const rows = leads.map((l) =>
    [
      csvCell(l.name ?? ''),
      csvCell(l.email),
      csvCell(l.phone ?? ''),
      csvCell(l.message ?? ''),
      l.createdAt.toISOString(),
    ].join(',')
  ).join('\n')

  return header + rows
}
