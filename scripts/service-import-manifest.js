export const serviceImportManifest = Object.freeze({
  version: 2,
  services: [
    {
      content: {
        slug: 'product-ui-ux',
        title: 'Product & UI/UX Design',
        description:
          'Designing clear, user-friendly experiences that make products feel simple and natural to use.',
        icon: 'product-ui-ux',
        tone: 'product',
        capabilities: [
          'User Flows',
          'Wireframes',
          'Prototypes',
          'UI Systems',
          'Interactive Motion',
        ],
        tools: [
          { key: 'jitter', label: 'Jitter' },
          { key: 'rive', label: 'Rive' },
          { key: 'figma', label: 'Figma' },
        ],
        status: 'draft',
        home: { featured: true, order: 1 },
        servicesPageOrder: 1,
      },
      relatedProjectSlugs: ['unicon', 'supersauced', 'domsot'],
      showcase: [
        {
          key: 'promo-centennial',
          kind: 'video',
          path: 'makets/service-assets/product-ui-ux/showcase/promo-centennial.mp4',
          alt: 'Centennial Connection mobile app interaction demo',
          preview: {
            path: 'makets/service-assets/product-ui-ux/previews/promo-centennial.webp',
            alt: 'Preview of the Centennial Connection interaction demo',
          },
        },
        {
          key: 'discovery',
          kind: 'image',
          path: 'makets/service-assets/product-ui-ux/showcase/discovery.png',
          alt: 'Unicon local student discovery screen',
        },
        {
          key: 'launch',
          kind: 'animation',
          path: 'makets/service-assets/product-ui-ux/showcase/launch.riv',
          alt: 'Animated product launch illustration',
          preview: {
            path: 'makets/service-assets/product-ui-ux/previews/launch.png',
            alt: 'Product launch illustration',
          },
        },
        {
          key: 'students',
          kind: 'animation',
          path: 'makets/service-assets/product-ui-ux/showcase/students.riv',
          alt: 'Animated verified student profile illustration',
          preview: {
            path: 'makets/service-assets/product-ui-ux/previews/students.png',
            alt: 'Verified student profile illustration',
          },
        },
        {
          key: 'notifications',
          kind: 'animation',
          path: 'makets/service-assets/product-ui-ux/showcase/notifications.riv',
          alt: 'Animated social notification illustration',
          preview: {
            path: 'makets/service-assets/product-ui-ux/previews/notifications.png',
            alt: 'Social notification illustration',
          },
        },
      ],
    },
    {
      content: {
        slug: 'mobile-development',
        title: 'Mobile Development',
        description:
          'Building smooth, reliable mobile experiences that feel natural to use across iOS and Android.',
        icon: 'mobile-development',
        tone: 'mobile',
        capabilities: [
          'Mobile Apps',
          'Cross-platform Development',
          'Navigation',
          'API Integration',
          'Authentication',
          'App Store Release',
        ],
        tools: [
          { key: 'react', label: 'React' },
          { key: 'typescript', label: 'TypeScript' },
          { key: 'expo', label: 'Expo' },
        ],
        status: 'draft',
        home: { featured: true, order: 2 },
        servicesPageOrder: 2,
      },
      relatedProjectSlugs: ['unicon', 'supersauced'],
      showcase: [
        {
          key: 'feed',
          kind: 'image',
          path: 'makets/service-assets/mobile-development/showcase/feed.png',
          alt: 'Unicon campus social feed screen',
        },
        {
          key: 'discovery',
          kind: 'image',
          path: 'makets/service-assets/mobile-development/showcase/discovery.png',
          alt: 'SuperSauced recipe discovery screen',
        },
      ],
    },
    {
      content: {
        slug: 'web-development',
        title: 'Web Development',
        description:
          'Building responsive web experiences that feel fast, clear, and polished across every screen.',
        icon: 'web-development',
        tone: 'web',
        capabilities: [
          'Responsive Websites',
          'Web Apps',
          'CMS Development',
          'API Integration',
          'Performance Optimization',
          'Deployment',
        ],
        tools: [
          { key: 'nextjs', label: 'Next.js' },
          { key: 'wordpress', label: 'WordPress' },
          { key: 'vercel', label: 'Vercel' },
        ],
        status: 'draft',
        home: { featured: true, order: 3 },
        servicesPageOrder: 3,
      },
      relatedProjectSlugs: ['domsot', 'unicon'],
      showcase: [
        {
          key: 'centennial',
          kind: 'image',
          path: 'makets/service-assets/web-development/showcase/centennial.png',
          alt: 'Centennial Connection responsive landing page',
        },
        {
          key: 'domsot',
          kind: 'image',
          path: 'makets/service-assets/web-development/showcase/domsot.png',
          alt: 'DomSot confectionery storefront landing page',
        },
      ],
    },
    {
      content: {
        slug: 'backend-architecture',
        title: 'Backend & Architecture',
        description: 'Designing backend systems that make products reliable, secure, and ready to grow.',
        icon: 'backend-development',
        tone: 'backend',
        capabilities: [
          'REST APIs',
          'Authentication & Authorization',
          'Database Design',
          'Business Logic',
          'System Architecture',
          'Third-party Integrations',
        ],
        tools: [
          { key: 'nestjs', label: 'NestJS' },
          { key: 'postgresql', label: 'PostgreSQL' },
          { key: 'prisma', label: 'Prisma' },
        ],
        status: 'draft',
        home: { featured: true, order: 4 },
        servicesPageOrder: 4,
      },
      relatedProjectSlugs: ['unicon', 'supersauced', 'domsot'],
      showcase: [
        {
          key: 'allergies',
          kind: 'image',
          path: 'makets/service-assets/backend-architecture/showcase/allergies.png',
          alt: 'SuperSauced dietary preferences and allergen settings',
        },
        {
          key: 'settings',
          kind: 'image',
          path: 'makets/service-assets/backend-architecture/showcase/settings.png',
          alt: 'Unicon privacy and visibility settings',
        },
      ],
    },
  ],
})
