export const projectImportManifest = Object.freeze({
  version: 1,
  assets: {
    'unicon.logo': {
      path: 'makets/project-assets/unicon/logo.png',
      alt: 'Unicon logo',
    },
    'unicon.homePreview': {
      path: 'makets/project-assets/unicon/home-preview.png',
      alt: 'Unicon social feed displayed in an iPhone frame',
    },
    'unicon.feed': {
      path: 'makets/project-assets/unicon/01-feed.png',
      alt: 'Unicon campus social feed',
    },
    'unicon.discovery': {
      path: 'makets/project-assets/unicon/02-discovery.png',
      alt: 'Unicon local student discovery screen',
    },
    'unicon.profile': {
      path: 'makets/project-assets/unicon/03-profile.png',
      alt: 'Unicon student profile screen',
    },
    'supersauced.logo': {
      path: 'makets/project-assets/supersauced/logo.png',
      alt: 'SuperSauced logo',
    },
    'supersauced.homePreview': {
      path: 'makets/project-assets/supersauced/home-preview.png',
      alt: 'SuperSauced recipe discovery displayed in an iPhone frame',
    },
    'supersauced.recipes': {
      path: 'makets/project-assets/supersauced/01-recipes.png',
      alt: 'SuperSauced recipe discovery screen',
    },
    'supersauced.recipe': {
      path: 'makets/project-assets/supersauced/02-recipe.png',
      alt: 'SuperSauced recipe details and ingredients',
    },
    'supersauced.saved': {
      path: 'makets/project-assets/supersauced/03-saved.png',
      alt: 'SuperSauced saved recipes screen',
    },
    'domsot.logo': {
      path: 'makets/project-assets/domsot/logo.png',
      alt: 'DomSot logo',
    },
    'domsot.homePreview': {
      path: 'makets/project-assets/domsot/home-preview.png',
      alt: 'DomSot storefront displayed in an iPhone frame',
    },
    'domsot.home': {
      path: 'makets/project-assets/domsot/01-home.png',
      alt: 'DomSot confectionery storefront landing page',
    },
    'domsot.items': {
      path: 'makets/project-assets/domsot/02-items.png',
      alt: 'DomSot gift sets and ready-made cakes',
    },
  },
  projects: [
    {
      content: {
        slug: 'unicon',
        title: 'Unicon',
        tagline: 'Campus networking for verified students',
        summary:
          'I conceived, designed, and built Unicon from the ground up as a campus networking platform for verified students, taking it from an idea to a live mobile app.',
        scope:
          'I conceived, designed, and built Unicon from the ground up as a campus networking platform for verified students. I handled the product experience, mobile app, backend, database, authentication, and release process.',
        position: 'Founder & Developer',
        themeColor: '#2253A2',
        projectsPageTheme: { tabColor: '#15418A', panelColor: '#394E70' },
        status: 'draft',
        timeline: { startDate: '2026-06-01', endDate: null },
        home: { featured: true, primary: true, order: 2 },
        projectsPageOrder: 1,
        buildBreakdown: [
          { label: 'Product Design', percentage: 100 },
          { label: 'Mobile Development', percentage: 100 },
          { label: 'Backend Development', percentage: 100 },
          { label: 'Database & Architecture', percentage: 100 },
          { label: 'Auth & Security', percentage: 100 },
          { label: 'Launch & Operations', percentage: 100 },
        ],
        links: [
          { icon: 'github', label: 'Mobile', url: 'https://github.com/heocode/unicon-mobile' },
          { icon: 'github', label: 'Backend', url: 'https://github.com/heocode/unicon-backend' },
          { icon: 'website', label: 'Website', url: 'https://www.uniconnection.app/' },
          {
            icon: 'app-store',
            label: 'App Store',
            url: 'https://apps.apple.com/ca/app/centennial-connection/id6775073506',
          },
        ],
      },
      media: {
        logo: 'unicon.logo',
        homePreview: 'unicon.homePreview',
        screenshots: [
          { asset: 'unicon.feed', alt: 'Unicon campus social feed' },
          { asset: 'unicon.discovery', alt: 'Unicon local student discovery screen' },
          { asset: 'unicon.profile', alt: 'Unicon student profile screen' },
        ],
      },
    },
    {
      content: {
        slug: 'supersauced',
        title: 'SuperSauced',
        tagline: 'Food discovery built around sauces and recipes',
        summary:
          'I helped build SuperSauced’s product experience around its sauces and recipes, including the ingredient and allergen system behind them.',
        scope:
          'I helped build SuperSauced’s mobile product experience around sauces and recipes. My work covered product logic, ingredient and allergen data, backend integration, administrative tools, and UI implementation.',
        position: 'Software Developer',
        themeColor: '#D64A2E',
        projectsPageTheme: { tabColor: '#995345', panelColor: '#B48278' },
        status: 'draft',
        timeline: { startDate: '2026-08-01', endDate: '2026-09-01' },
        home: { featured: true, primary: false, order: 1 },
        projectsPageOrder: 2,
        buildBreakdown: [
          { label: 'Mobile Development', percentage: 90 },
          { label: 'Product Logic', percentage: 85 },
          { label: 'Data & Allergens', percentage: 95 },
          { label: 'Backend Integration', percentage: 75 },
          { label: 'Admin Tools', percentage: 80 },
          { label: 'UI Implementation', percentage: 75 },
        ],
        links: [],
      },
      media: {
        logo: 'supersauced.logo',
        homePreview: 'supersauced.homePreview',
        screenshots: [
          { asset: 'supersauced.recipes', alt: 'SuperSauced recipe discovery screen' },
          { asset: 'supersauced.recipe', alt: 'SuperSauced recipe details and ingredients' },
          { asset: 'supersauced.saved', alt: 'SuperSauced saved recipes screen' },
        ],
      },
    },
    {
      content: {
        slug: 'domsot',
        title: 'DomSot',
        tagline: 'A premium digital storefront for handcrafted desserts',
        summary:
          'I created and built DomSot’s website to bring the brand’s premium confectionery products online in a clean and modern way.',
        scope:
          'I created and built DomSot’s responsive WordPress storefront to bring the brand’s premium confectionery products online. My work covered theme development, UI implementation, asset optimization, and deployment.',
        position: 'Web Developer',
        themeColor: '#47310E',
        projectsPageTheme: { tabColor: '#6F665D', panelColor: '#4C4640' },
        status: 'draft',
        timeline: { startDate: '2026-08-01', endDate: '2026-09-01' },
        home: { featured: true, primary: false, order: 3 },
        projectsPageOrder: 3,
        buildBreakdown: [
          { label: 'Web Development', percentage: 100 },
          { label: 'UI Implementation', percentage: 95 },
          { label: 'WordPress Theme', percentage: 100 },
          { label: 'Responsive Design', percentage: 100 },
          { label: 'Asset Optimization', percentage: 100 },
          { label: 'Deployment', percentage: 80 },
        ],
        links: [],
      },
      media: {
        logo: 'domsot.logo',
        homePreview: 'domsot.homePreview',
        screenshots: [
          { asset: 'domsot.home', alt: 'DomSot confectionery storefront landing page' },
          { asset: 'domsot.items', alt: 'DomSot gift sets and ready-made cakes' },
        ],
      },
    },
  ],
})
