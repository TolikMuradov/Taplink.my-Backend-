import { prisma } from './index'

async function main() {
  // Test kullanıcısı
  const user = await prisma.user.upsert({
    where: { email: 'test@taplink.my' },
    update: {},
    create: {
      name: 'Test Kullanıcı',
      email: 'test@taplink.my',
      emailVerified: true,
      plan: 'PRO',
      profile: {
        create: {
          username: 'testuser',
          displayName: 'Test Kullanıcı',
          bio: 'Bu bir test profilidir.',
          isPublic: true,
          links: {
            create: [
              {
                type: 'HEADER',
                title: 'Bağlantılarım',
                position: 0,
                isActive: true,
                metadata: { alignment: 'center', size: 'md' },
              },
              {
                type: 'LINK',
                title: 'Web Sitem',
                url: 'https://example.com',
                cardStyle: 'basic',
                position: 1,
                isActive: true,
                metadata: { iconType: 'emoji', iconValue: '🌐' },
              },
              {
                type: 'SOCIAL',
                title: 'Sosyal Medya',
                position: 2,
                isActive: true,
                metadata: {
                  platforms: [
                    { platform: 'instagram', url: 'https://instagram.com/testuser' },
                    { platform: 'tiktok', url: 'https://tiktok.com/@testuser' },
                  ],
                  iconStyle: 'filled',
                  iconSize: 'md',
                  layout: 'row',
                },
              },
              {
                type: 'DIVIDER',
                title: '',
                position: 3,
                isActive: true,
                metadata: { style: 'solid', thickness: 1 },
              },
              {
                type: 'LINK',
                title: 'Son Albümüm',
                url: 'https://spotify.com/album/example',
                cardStyle: 'music',
                position: 4,
                isActive: true,
                isHighlighted: true,
                metadata: {
                  imageUrl: 'https://picsum.photos/200',
                  artist: 'Test Sanatçı',
                  album: 'Test Albüm',
                  duration: '45:00',
                  platform: 'spotify',
                },
              },
            ],
          },
        },
      },
    },
  })

  console.log('Seed tamamlandı. Kullanıcı ID:', user.id)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
