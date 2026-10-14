export const serviceImportManifest = Object.freeze({
  version: 1,
  services: [
    {
      slug: 'product-ui-ux',
      title: 'Product & UI/UX Design',
      description:
        'Designing clear, user-friendly experiences that make products feel simple and natural to use.',
      icon: 'product-ui-ux',
      tone: 'product',
      status: 'draft',
      home: { featured: true, order: 1 },
      servicesPageOrder: 1,
    },
    {
      slug: 'mobile-development',
      title: 'Mobile Development',
      description:
        'Building smooth, reliable mobile experiences that feel natural to use across iOS and Android.',
      icon: 'mobile-development',
      tone: 'mobile',
      status: 'draft',
      home: { featured: true, order: 2 },
      servicesPageOrder: 2,
    },
    {
      slug: 'web-development',
      title: 'Web Development',
      description:
        'Building responsive web experiences that feel fast, clear, and polished across every screen.',
      icon: 'web-development',
      tone: 'web',
      status: 'draft',
      home: { featured: true, order: 3 },
      servicesPageOrder: 3,
    },
    {
      slug: 'backend-architecture',
      title: 'Backend & Architecture',
      description: 'Designing backend systems that make products reliable, secure, and ready to grow.',
      icon: 'backend-development',
      tone: 'backend',
      status: 'draft',
      home: { featured: true, order: 4 },
      servicesPageOrder: 4,
    },
  ],
})
