import type { IndustrySlug, MarketingLocale } from '../routes/routeModel';

type LinkLabel = { label: string; path: string };
type TextGroup = { title: string; description: string; items: string[]; note?: string };
type FaqItem = { question: string; answer: string };

export interface SolutionCopy {
  slug: IndustrySlug;
  eyebrow: string;
  title: string;
  summary: string;
  status: string;
  workflowTitle: string;
  workflows: TextGroup[];
  visualLabel: string;
  closing: string;
}

export interface MarketingCopy {
  localeName: string;
  skip: string;
  nav: {
    features: string;
    solutions: string;
    pricing: string;
    security: string;
    login: string;
    requestAccess: string;
    menu: string;
    close: string;
    language: string;
  };
  common: {
    requestAccess: string;
    requestTrial: string;
    contactSales: string;
    exploreProduct: string;
    learnMore: string;
    available: string;
    earlyAccess: string;
    productPreview: string;
    sanitizedPreview: string;
    backHome: string;
  };
  home: {
    eyebrow: string;
    heroTitle: string;
    heroDescription: string;
    credibility: string[];
    problemEyebrow: string;
    problemTitle: string;
    problemDescription: string;
    scattered: string[];
    solutionTitle: string;
    solutionDescription: string;
    capabilitiesEyebrow: string;
    capabilitiesTitle: string;
    capabilitiesIntro: string;
    capabilities: TextGroup[];
    industriesEyebrow: string;
    industriesTitle: string;
    industriesIntro: string;
    howEyebrow: string;
    howTitle: string;
    steps: { title: string; description: string }[];
    financeEyebrow: string;
    financeTitle: string;
    financeDescription: string;
    financeItems: string[];
    financeNote: string;
    reportingEyebrow: string;
    reportingTitle: string;
    reportingDescription: string;
    reportingItems: string[];
    securityEyebrow: string;
    securityTitle: string;
    securityDescription: string;
    securityItems: string[];
    pricingEyebrow: string;
    pricingTitle: string;
    pricingDescription: string;
    pricingItems: string[];
    faqEyebrow: string;
    faqTitle: string;
    faqs: FaqItem[];
    finalEyebrow: string;
    finalTitle: string;
    finalDescription: string;
  };
  features: {
    eyebrow: string;
    title: string;
    intro: string;
    groups: TextGroup[];
    scopeTitle: string;
    scopeDescription: string;
  };
  solutions: {
    eyebrow: string;
    title: string;
    intro: string;
    readinessTitle: string;
    readinessDescription: string;
  };
  solutionsBySlug: Record<IndustrySlug, SolutionCopy>;
  pricing: {
    eyebrow: string;
    title: string;
    intro: string;
    cardTitle: string;
    cardDescription: string;
    includedTitle: string;
    included: string[];
    processTitle: string;
    process: { title: string; description: string }[];
    note: string;
  };
  security: {
    eyebrow: string;
    title: string;
    intro: string;
    principles: TextGroup[];
    responsibilityTitle: string;
    responsibilityDescription: string;
    recoveryTitle: string;
    recoveryDescription: string;
  };
  legal: {
    privacyTitle: string;
    privacyIntro: string;
    privacySections: TextGroup[];
    termsTitle: string;
    termsIntro: string;
    termsSections: TextGroup[];
    reviewNote: string;
  };
  contact: {
    eyebrow: string;
    title: string;
    intro: string;
    intentLabel: string;
    intents: Record<'trial' | 'demo' | 'sales' | 'support', string>;
    nameLabel: string;
    emailLabel: string;
    businessLabel: string;
    messageLabel: string;
    send: string;
    direct: string;
    truth: string;
  };
  footer: {
    statement: string;
    product: string;
    industries: string;
    resources: string;
    legal: string;
    links: {
      product: LinkLabel[];
      industries: LinkLabel[];
      resources: LinkLabel[];
      legal: LinkLabel[];
    };
    rights: string;
  };
}

const en: MarketingCopy = {
  localeName: 'English',
  skip: 'Skip to main content',
  nav: {
    features: 'Features', solutions: 'Solutions', pricing: 'Pricing', security: 'Security',
    login: 'Log in', requestAccess: 'Request access', menu: 'Open menu', close: 'Close menu', language: 'Language',
  },
  common: {
    requestAccess: 'Request access', requestTrial: 'Request trial', contactSales: 'Contact sales',
    exploreProduct: 'Explore the product', learnMore: 'Learn more', available: 'Available',
    earlyAccess: 'Early access', productPreview: 'Product preview',
    sanitizedPreview: 'Sanitized preview with illustrative business data.', backHome: 'Back to home',
  },
  home: {
    eyebrow: 'One workspace. Workflows that fit the business.',
    heroTitle: 'Run operations, customers, and finances from one connected workspace.',
    heroDescription: 'MyDesck PRO brings specialized workflows for travel agencies, supermarkets, restaurants, and repair workshops into a calm, multilingual business platform.',
    credibility: ['English / العربية / עברית', 'First-class RTL support', 'Web + Windows desktop', 'Industry-specific workflows', 'Secure cloud authentication'],
    problemEyebrow: 'Built for operational reality',
    problemTitle: 'Important work should not be scattered across disconnected tools.',
    problemDescription: 'Customer details, payment schedules, receipts, documents, and daily operations often live in separate spreadsheets, paper files, and point solutions.',
    scattered: ['Spreadsheets', 'Paper receipts', 'Payment schedules', 'Customer details', 'Industry systems'],
    solutionTitle: 'One operating layer for the work that has to stay connected.',
    solutionDescription: 'MyDesck PRO organizes the workflows each business actually uses, while keeping financial visibility, history, documents, and reporting close to the operation.',
    capabilitiesEyebrow: 'Core capability system',
    capabilitiesTitle: 'Structured around the work your team performs every day.',
    capabilitiesIntro: 'The platform combines shared business foundations with specialized tools for each supported industry.',
    capabilities: [
      { title: 'Operations', description: 'Keep day-to-day work visible and organized.', items: ['Trips and itineraries', 'POS and order workflows', 'Work orders', 'Business configuration'] },
      { title: 'Sales & payment tracking', description: 'Record commercial activity without claiming to process online card payments.', items: ['Sales history', 'Collected amounts', 'Scheduled payments', 'Installment records'] },
      { title: 'Financial visibility', description: 'Understand what was earned, collected, spent, and remains due.', items: ['Revenue and cost', 'Profit visibility', 'Unpaid balances', 'Payment health'] },
      { title: 'Documents & reporting', description: 'Keep operational records ready to review and share.', items: ['PDF and export workflows', 'Receipts and documents', 'Business reports', 'Operational analytics'] },
    ],
    industriesEyebrow: 'Industry workflows',
    industriesTitle: 'Choose the operating model that matches your business.',
    industriesIntro: 'Availability is stated clearly. Early-access areas are still being completed and are never presented as fully finished products.',
    howEyebrow: 'Assisted onboarding',
    howTitle: 'A practical path from first conversation to daily use.',
    steps: [
      { title: 'Request access', description: 'Tell us about the work you want to bring together.' },
      { title: 'Choose business type', description: 'We match the workspace to a supported industry workflow.' },
      { title: 'Configure workspace', description: 'Language, currency, business details, and relevant tools are prepared.' },
      { title: 'Start working', description: 'Your team begins with an operational workspace aligned to the business.' },
    ],
    financeEyebrow: 'Financial management',
    financeTitle: 'See the financial state behind the operation.',
    financeDescription: 'MyDesck PRO connects operational records to the numbers teams need to follow, especially in the travel workflow.',
    financeItems: ['Sales', 'Cost', 'Profit', 'Collected amount', 'Unpaid balances', 'Scheduled payments', 'Installments', 'Payment history'],
    financeNote: 'MyDesck PRO tracks payment activity. It does not currently process online card payments.',
    reportingEyebrow: 'Reports & analytics',
    reportingTitle: 'Turn daily records into useful operational signals.',
    reportingDescription: 'Review implemented views such as destination performance, repeat customers, payment health, aging, and sales summaries where they apply.',
    reportingItems: ['Destination performance', 'Repeat customers', 'Payment health', 'Outstanding aging', 'Sales summaries'],
    securityEyebrow: 'Trusted access',
    securityTitle: 'Cloud-based access with clear data boundaries.',
    securityDescription: 'Authenticated access, tenant-aware authorization, private business assets, and server-confirmed writes support the production workspace.',
    securityItems: ['Authenticated access', 'Tenant-aware controls', 'Private asset storage', 'Server-confirmed writes'],
    pricingEyebrow: 'MyDesck PRO',
    pricingTitle: 'One product, configured around the business.',
    pricingDescription: 'Commercial activation and onboarding are currently assisted. We will discuss the relevant workflows before access is prepared.',
    pricingItems: ['Core business platform', 'Business-specific workflows', 'Multilingual operation', 'Assisted activation'],
    faqEyebrow: 'Frequently asked questions',
    faqTitle: 'Straight answers before you request access.',
    faqs: [
      { question: 'What businesses does MyDesck support?', answer: 'Travel agencies and core supermarket POS workflows are available. Restaurant and auto-repair workflows are offered as early access.' },
      { question: 'Which languages are supported?', answer: 'The public site and product support English, Arabic, and Hebrew, including right-to-left layouts for Arabic and Hebrew.' },
      { question: 'Can I use it on desktop?', answer: 'Yes. MyDesck PRO supports the web and a Windows desktop application.' },
      { question: 'Is there a web version?', answer: 'Yes. Authenticated users can access the production workspace through the web.' },
      { question: 'Does MyDesck process payments?', answer: 'No. MyDesck records and tracks sales, installments, scheduled payments, collections, and payment history; it does not currently process online card payments.' },
      { question: 'How does onboarding work?', answer: 'Onboarding is assisted: request access, choose the business type, configure the workspace, and begin working after activation.' },
      { question: 'Can existing business data be migrated?', answer: 'Data migration needs are assessed individually. Request access and describe the source and format so feasibility can be reviewed.' },
      { question: 'How do I request access?', answer: 'Use the request-access form or contact email. The website opens a prepared email in your own mail application; it does not silently submit a form.' },
    ],
    finalEyebrow: 'Start with the workflow',
    finalTitle: 'Tell us how your business works.',
    finalDescription: 'We will help identify the right supported workflow and the practical next step for access.',
  },
  features: {
    eyebrow: 'Platform features',
    title: 'Business capabilities organized by workflow—not by software jargon.',
    intro: 'Shared platform foundations meet industry-specific tools. Each capability below is scoped to the business types where it is implemented.',
    groups: [
      { title: 'Operations', description: 'Plan and carry out the primary work of the business.', items: ['Travel trips and itineraries', 'Supermarket POS workflows', 'Restaurant tables, orders, KDS, and reservations (early access)', 'Auto-repair vehicle intake and work orders (early access)'] },
      { title: 'Customers', description: 'Keep the people connected to operational records.', items: ['Travelers and customer records', 'Repeat-customer analytics where available', 'Restaurant guest structures (early access)', 'Vehicle-owner history (early access)'], note: 'Customer capabilities vary by industry; this is not marketed as a universal CRM.' },
      { title: 'Sales', description: 'Record and review commercial activity.', items: ['Travel sales and trip financials', 'Supermarket cart, VAT, sales, and receipts', 'Transaction and order history'] },
      { title: 'Payment tracking', description: 'Follow money due and received.', items: ['Payment schedules', 'Installments', 'Collected and unpaid amounts', 'Payment history'], note: 'Tracking only; no online card processing.' },
      { title: 'Financial tracking', description: 'Connect the operation to financial visibility.', items: ['Revenue', 'Cost', 'Profit', 'Outstanding balances', 'Payment health and aging where implemented'] },
      { title: 'Documents', description: 'Create, keep, and export operational documents.', items: ['PDF workflows', 'Receipts', 'Travel documents', 'Repair documents', 'Export tools where implemented'] },
      { title: 'Reports', description: 'Review performance without leaving the workflow.', items: ['Travel analytics and reports', 'Sales summaries', 'Destination performance', 'Basic POS analytics', 'Restaurant analytics (early access)'] },
      { title: 'Business configuration', description: 'Adapt the workspace to the business.', items: ['Business identity settings', 'English, Arabic, and Hebrew', 'Currency preferences', 'Industry-specific workspace configuration'] },
    ],
    scopeTitle: 'Capabilities are intentionally scoped.',
    scopeDescription: 'A feature listed for one business type is not implied to exist identically in every other vertical. Readiness labels and page-level notes show where workflows are available or early access.',
  },
  solutions: {
    eyebrow: 'Solutions',
    title: 'Industry workflows with honest readiness labels.',
    intro: 'MyDesck PRO is not a collection of generic cards. Each published solution maps to a real implementation in the product.',
    readinessTitle: 'What the labels mean',
    readinessDescription: 'Available means the stated core workflows are in production use. Early access means verified workflows exist while parts of the end-to-end experience are still being completed.',
  },
  solutionsBySlug: {
    'travel-agencies': {
      slug: 'travel-agencies', eyebrow: 'Available · strongest vertical', title: 'A connected operating system for travel agencies.',
      summary: 'Bring trips, travelers, itineraries, financial tracking, payment plans, installments, documents, reports, and multilingual operation together.', status: 'Available', workflowTitle: 'From trip setup to financial follow-through', visualLabel: 'Travel operations',
      workflows: [
        { title: 'Trip workflow', description: 'Create and manage trip records through active, archived, and historical views.', items: ['Trip details', 'Travelers', 'Itineraries', 'Operational history'] },
        { title: 'Payments & installments', description: 'Connect each trip to its payment picture.', items: ['Payment schedules', 'Installment plans', 'Payment history', 'Outstanding balances'] },
        { title: 'Documents & communication', description: 'Keep trip outputs close to the record.', items: ['PDF and export workflows', 'Templates', 'Attachments', 'Multilingual documents'] },
        { title: 'Reports & analytics', description: 'Review the agency from operational and financial angles.', items: ['Destination performance', 'Repeat customers', 'Payment health', 'Financial reports'] },
      ], closing: 'Request access to discuss the travel workflow and the data you need to bring into the workspace.',
    },
    supermarkets: {
      slug: 'supermarkets', eyebrow: 'Available · core POS', title: 'A focused point-of-sale workflow for supermarket teams.',
      summary: 'Manage products and categories, enter barcode and weighted items, calculate VAT, record sales, issue receipts, and review history and basic analytics.', status: 'Available', workflowTitle: 'Core selling flow without inflated inventory claims', visualLabel: 'Supermarket POS',
      workflows: [
        { title: 'Product catalog', description: 'Organize the products sold at the counter.', items: ['Products', 'Categories', 'Barcode input', 'Weighted-item entry'] },
        { title: 'Point of sale', description: 'Build a cart and complete a recorded sale.', items: ['Cart', 'VAT calculation', 'Payment-method record', 'Receipt workflow'] },
        { title: 'History', description: 'Review and manage completed transactions.', items: ['Transaction history', 'Receipt review', 'Sales records'] },
        { title: 'Analytics', description: 'See implemented sales summaries and basic performance views.', items: ['Sales summaries', 'Transaction analytics', 'Basic trends'] },
      ], closing: 'The current offer focuses on core POS. Advanced stock enforcement is not presented as a finished capability.',
    },
    restaurants: {
      slug: 'restaurants', eyebrow: 'Early access', title: 'Restaurant operations designed around the floor, kitchen, and service team.',
      summary: 'Verified early-access workflows cover tables, floor plans, menus, staff structures, orders, KDS, reservations, order history, and analytics.', status: 'Early access', workflowTitle: 'Verified restaurant workflows', visualLabel: 'Restaurant floor & KDS',
      workflows: [
        { title: 'Floor operations', description: 'Represent the service space and active work.', items: ['Tables', 'Floor plan', 'Active orders'] },
        { title: 'Menu & order flow', description: 'Support the core path from selection to kitchen visibility.', items: ['Menu', 'Orders', 'Kitchen display system'] },
        { title: 'Guests & reservations', description: 'Coordinate upcoming service and operational history.', items: ['Reservations', 'Order history', 'Guest structures'] },
        { title: 'Management views', description: 'Use verified structures without implying unfinished flows are complete.', items: ['Staff structures', 'Restaurant analytics', 'Business settings where available'] },
      ], closing: 'Early access is suitable for guided evaluation. Payment processing and incomplete Firestore flows are not marketed as finished.',
    },
    'auto-repair': {
      slug: 'auto-repair', eyebrow: 'Early access', title: 'A clearer record from vehicle intake to completed work.',
      summary: 'Verified workflows cover vehicle intake, government-data lookup where available, work orders, parts and labor, service history, parts inventory, and documents.', status: 'Early access', workflowTitle: 'Verified workshop workflows', visualLabel: 'Workshop operations',
      workflows: [
        { title: 'Vehicle intake', description: 'Start with a structured vehicle and owner record.', items: ['Vehicle registration', 'Owner details', 'Government-data lookup where available'] },
        { title: 'Work orders', description: 'Record the work requested and performed.', items: ['Service entries', 'Parts', 'Labor', 'Work history'] },
        { title: 'Parts', description: 'Maintain the parts used by the workshop.', items: ['Parts catalog', 'Inventory records', 'Stock consumption in supported flows'] },
        { title: 'Documents', description: 'Prepare operational outputs from the repair record.', items: ['Repair documents', 'PDF support', 'Shareable records'] },
      ], closing: 'The auto-repair experience is early access while dashboard cohesion and remaining flows continue to mature.',
    },
  },
  pricing: {
    eyebrow: 'Pricing', title: 'One product. Assisted activation.',
    intro: 'MyDesck PRO does not publish a self-service price or fabricate tiers. We first confirm the relevant business workflow and onboarding needs.',
    cardTitle: 'MyDesck PRO', cardDescription: 'A multilingual operating workspace configured for a supported business type.', includedTitle: 'What the conversation covers',
    included: ['Core platform access', 'Relevant business workflow', 'English, Arabic, and Hebrew', 'Web and Windows access where applicable', 'Assisted workspace configuration'],
    processTitle: 'How commercial activation works',
    process: [
      { title: 'Discuss the workflow', description: 'Tell us what the team does today and which supported area fits.' },
      { title: 'Review fit and setup', description: 'We confirm readiness, configuration, and any data-migration questions.' },
      { title: 'Request a trial', description: 'A trial can be discussed without collecting payment details on this website.' },
    ],
    note: 'No payment details are collected here. Trial availability, duration, and commercial terms are confirmed directly.',
  },
  security: {
    eyebrow: 'Security', title: 'Authenticated cloud access with tenant-aware boundaries.',
    intro: 'MyDesck PRO uses a cloud production architecture built around authenticated access and managed services.',
    principles: [
      { title: 'Identity & sessions', description: 'Firebase Authentication provides account sign-in, session handling, and password recovery.', items: ['Authenticated access', 'Session lifecycle', 'Password reset workflow'] },
      { title: 'Business data', description: 'Operational records are stored in Firestore and accessed through tenant-aware authorization.', items: ['Cloud data storage', 'Business-aware access controls', 'Server-confirmed writes'] },
      { title: 'Private assets', description: 'Private business files use authenticated storage access through the production storage layer.', items: ['Private asset paths', 'Authenticated retrieval', 'Business ownership boundaries'] },
      { title: 'Product delivery', description: 'Web and desktop releases are delivered through controlled application update paths.', items: ['Web release delivery', 'Desktop update delivery', 'Data export workflows where implemented'] },
    ],
    responsibilityTitle: 'Claims we intentionally do not make',
    responsibilityDescription: 'This page does not claim certifications, regulatory compliance, a specific encryption algorithm, backup frequency, uptime guarantee, or data residency without separate verified evidence.',
    recoveryTitle: 'Account recovery',
    recoveryDescription: 'Password recovery uses the authenticated identity provider. Business-data exports are available in the implemented workflows; recovery and migration needs can be discussed during onboarding.',
  },
  legal: {
    privacyTitle: 'Privacy notice',
    privacyIntro: 'This notice explains the categories of information involved when you visit the site, contact us, or use an activated MyDesck PRO workspace.',
    privacySections: [
      { title: 'Website contact', description: 'The contact form prepares an email in your own mail application.', items: ['Your name and email', 'Business name', 'Selected request type', 'Message you choose to send'] },
      { title: 'Account information', description: 'Activated workspaces use account and business information required to authenticate and provide the selected workflows.', items: ['Account identity', 'Business profile', 'Workspace preferences', 'Operational records entered by authorized users'] },
      { title: 'Service providers', description: 'The production architecture uses Firebase Authentication and Firestore, with Supabase Storage used only for the product storage layer.', items: ['Identity and session services', 'Cloud database services', 'Private file storage'] },
      { title: 'Your choices', description: 'You may contact us about access, correction, export availability, or account questions.', items: ['Access questions', 'Correction requests', 'Export questions', 'Account support'] },
    ],
    termsTitle: 'Terms of use',
    termsIntro: 'These plain-language terms describe the current website and assisted-activation model. Commercial terms for an activated workspace are confirmed separately.',
    termsSections: [
      { title: 'Website use', description: 'Use the site lawfully and do not attempt to disrupt, probe, or misuse its services.', items: ['Lawful use', 'No unauthorized access', 'No service disruption'] },
      { title: 'Product readiness', description: 'Available and early-access labels describe the current maturity of the published workflows.', items: ['Available core workflows', 'Early-access limitations', 'No placeholder verticals sold as ready'] },
      { title: 'Commercial activation', description: 'Pricing, trial availability, duration, onboarding, and scope are confirmed directly.', items: ['No self-service checkout', 'No payment details collected here', 'Separate commercial confirmation'] },
      { title: 'Product changes', description: 'Features and early-access areas may change as the product develops.', items: ['Reasonable product updates', 'Readiness labels may evolve', 'Material terms are confirmed separately'] },
    ],
    reviewNote: 'Source note: this initial policy text requires professional legal review before it is treated as final legal advice or a complete jurisdiction-specific agreement.',
  },
  contact: {
    eyebrow: 'Contact', title: 'Tell us how your business works.',
    intro: 'Request access, discuss a trial, ask for a product walkthrough, or get support. This page uses a transparent email workflow.',
    intentLabel: 'How can we help?', intents: { trial: 'Request a trial', demo: 'Request a product walkthrough', sales: 'Talk to sales', support: 'Get support' },
    nameLabel: 'Your name', emailLabel: 'Work email', businessLabel: 'Business name', messageLabel: 'What should we know?', send: 'Open email draft',
    direct: 'Prefer to write directly?', truth: 'Submitting opens a prepared email in your mail application. Nothing is silently stored or sent by this website.',
  },
  footer: {
    statement: 'Industry-specific operations, customers, and financial visibility in one multilingual workspace.',
    product: 'Product', industries: 'Industries', resources: 'Resources', legal: 'Legal',
    links: {
      product: [{ label: 'Features', path: '/features' }, { label: 'Solutions', path: '/solutions' }, { label: 'Pricing', path: '/pricing' }],
      industries: [{ label: 'Travel agencies', path: '/solutions/travel-agencies' }, { label: 'Supermarkets', path: '/solutions/supermarkets' }, { label: 'Restaurants', path: '/solutions/restaurants' }, { label: 'Auto repair', path: '/solutions/auto-repair' }],
      resources: [{ label: 'Security', path: '/security' }, { label: 'Contact', path: '/contact' }, { label: 'Log in', path: '/login' }],
      legal: [{ label: 'Privacy', path: '/privacy' }, { label: 'Terms', path: '/terms' }],
    },
    rights: 'All rights reserved.',
  },
};

const ar: MarketingCopy = {
  ...en,
  localeName: 'العربية',
  skip: 'انتقل إلى المحتوى الرئيسي',
  nav: { features: 'الميزات', solutions: 'الحلول', pricing: 'التسعير', security: 'الأمان', login: 'تسجيل الدخول', requestAccess: 'اطلب الوصول', menu: 'افتح القائمة', close: 'أغلق القائمة', language: 'اللغة' },
  common: { requestAccess: 'اطلب الوصول', requestTrial: 'اطلب تجربة', contactSales: 'تواصل مع المبيعات', exploreProduct: 'استكشف المنتج', learnMore: 'اعرف المزيد', available: 'متاح', earlyAccess: 'وصول مبكر', productPreview: 'معاينة المنتج', sanitizedPreview: 'معاينة منقّحة ببيانات أعمال توضيحية.', backHome: 'العودة للرئيسية' },
  home: {
    ...en.home,
    eyebrow: 'مساحة واحدة. سير عمل يناسب نشاطك.',
    heroTitle: 'أدر العمليات والعملاء والشؤون المالية من مساحة عمل مترابطة.',
    heroDescription: 'يجمع MyDesck PRO سير عمل متخصصًا لوكالات السفر والمتاجر والمطاعم وورش السيارات في منصة أعمال هادئة ومتعددة اللغات.',
    credibility: ['English / العربية / עברית', 'دعم كامل لاتجاه RTL', 'الويب + تطبيق Windows', 'سير عمل حسب القطاع', 'مصادقة سحابية آمنة'],
    problemEyebrow: 'مصمم للواقع التشغيلي', problemTitle: 'لا ينبغي أن يتوزع العمل المهم بين أدوات منفصلة.',
    problemDescription: 'غالبًا ما تتوزع بيانات العملاء وجداول الدفع والإيصالات والمستندات والعمليات اليومية بين جداول وملفات ورقية وأنظمة منفصلة.',
    scattered: ['جداول البيانات', 'إيصالات ورقية', 'جداول الدفع', 'بيانات العملاء', 'أنظمة قطاعية'],
    solutionTitle: 'طبقة تشغيل واحدة للأعمال التي يجب أن تبقى مترابطة.',
    solutionDescription: 'ينظم MyDesck PRO سير العمل الفعلي لكل نشاط، مع إبقاء الرؤية المالية والسجل والمستندات والتقارير قريبة من التشغيل.',
    capabilitiesEyebrow: 'نظام القدرات', capabilitiesTitle: 'منظم حول العمل الذي ينفذه فريقك كل يوم.', capabilitiesIntro: 'تجمع المنصة أساسًا مشتركًا مع أدوات متخصصة لكل قطاع مدعوم.',
    capabilities: [
      { title: 'العمليات', description: 'نظّم العمل اليومي واجعله واضحًا.', items: ['الرحلات والبرامج', 'نقطة البيع والطلبات', 'أوامر العمل', 'إعداد النشاط'] },
      { title: 'المبيعات وتتبع الدفعات', description: 'سجّل النشاط التجاري دون ادعاء معالجة بطاقات الدفع عبر الإنترنت.', items: ['سجل المبيعات', 'المبالغ المحصلة', 'الدفعات المجدولة', 'سجل الأقساط'] },
      { title: 'الرؤية المالية', description: 'افهم ما تم كسبه وتحصيله وإنفاقه وما بقي مستحقًا.', items: ['الإيراد والتكلفة', 'الربح', 'الأرصدة غير المدفوعة', 'صحة الدفعات'] },
      { title: 'المستندات والتقارير', description: 'احتفظ بالسجلات التشغيلية جاهزة للمراجعة والمشاركة.', items: ['PDF والتصدير', 'الإيصالات والمستندات', 'تقارير الأعمال', 'التحليلات التشغيلية'] },
    ],
    industriesEyebrow: 'سير عمل حسب القطاع', industriesTitle: 'اختر نموذج التشغيل الذي يناسب نشاطك.', industriesIntro: 'نوضح حالة الجاهزية بصدق؛ الوصول المبكر لا يُعرض كمنتج مكتمل.',
    howEyebrow: 'إعداد بمساعدة', howTitle: 'طريق عملي من المحادثة الأولى إلى الاستخدام اليومي.',
    steps: [{ title: 'اطلب الوصول', description: 'أخبرنا عن العمل الذي تريد جمعه.' }, { title: 'اختر نوع النشاط', description: 'نطابق المساحة مع سير عمل مدعوم.' }, { title: 'جهّز المساحة', description: 'نعد اللغة والعملة وبيانات النشاط والأدوات.' }, { title: 'ابدأ العمل', description: 'يبدأ فريقك بمساحة متوافقة مع النشاط.' }],
    financeEyebrow: 'الإدارة المالية', financeTitle: 'شاهد الحالة المالية خلف التشغيل.', financeDescription: 'يربط MyDesck PRO السجلات التشغيلية بالأرقام التي يحتاج الفريق لمتابعتها، خصوصًا في قطاع السفر.',
    financeItems: ['المبيعات', 'التكلفة', 'الربح', 'المبلغ المحصل', 'الأرصدة غير المدفوعة', 'الدفعات المجدولة', 'الأقساط', 'سجل الدفع'], financeNote: 'يتتبع MyDesck PRO نشاط الدفع، ولا يعالج حاليًا بطاقات الدفع عبر الإنترنت.',
    reportingEyebrow: 'التقارير والتحليلات', reportingTitle: 'حوّل السجلات اليومية إلى مؤشرات تشغيلية مفيدة.', reportingDescription: 'راجع أداء الوجهات والعملاء المتكررين وصحة الدفعات والأرصدة المتقادمة وملخصات المبيعات حيث تنطبق.', reportingItems: ['أداء الوجهات', 'العملاء المتكررون', 'صحة الدفعات', 'تقادم المستحقات', 'ملخصات المبيعات'],
    securityEyebrow: 'وصول موثوق', securityTitle: 'وصول سحابي بحدود بيانات واضحة.', securityDescription: 'تدعم المصادقة والصلاحيات الخاصة بكل نشاط والأصول الخاصة والكتابة المؤكدة من الخادم مساحة الإنتاج.', securityItems: ['وصول موثّق', 'صلاحيات حسب النشاط', 'تخزين أصول خاصة', 'كتابة مؤكدة من الخادم'],
    pricingEyebrow: 'MyDesck PRO', pricingTitle: 'منتج واحد، مهيأ حول نشاطك.', pricingDescription: 'التفعيل والإعداد التجاريان بمساعدة حاليًا. نناقش سير العمل المناسب قبل تجهيز الوصول.', pricingItems: ['منصة الأعمال الأساسية', 'سير عمل خاص بالنشاط', 'تشغيل متعدد اللغات', 'تفعيل بمساعدة'],
    faqEyebrow: 'أسئلة شائعة', faqTitle: 'إجابات واضحة قبل طلب الوصول.',
    faqs: [
      { question: 'ما الأنشطة التي يدعمها MyDesck؟', answer: 'وكالات السفر ونقطة البيع الأساسية للمتاجر متاحتان. المطاعم وورش السيارات في مرحلة الوصول المبكر.' },
      { question: 'ما اللغات المدعومة؟', answer: 'الإنجليزية والعربية والعبرية، مع اتجاه من اليمين إلى اليسار للعربية والعبرية.' },
      { question: 'هل يمكن استخدامه على سطح المكتب؟', answer: 'نعم، يدعم MyDesck PRO الويب وتطبيق Windows.' },
      { question: 'هل توجد نسخة ويب؟', answer: 'نعم، يمكن للمستخدمين الموثقين الوصول إلى مساحة الإنتاج عبر الويب.' },
      { question: 'هل يعالج MyDesck الدفعات؟', answer: 'لا. يسجل ويتتبع المبيعات والأقساط والدفعات المجدولة والتحصيلات وسجل الدفع، لكنه لا يعالج بطاقات الإنترنت.' },
      { question: 'كيف يتم الإعداد؟', answer: 'الإعداد بمساعدة: اطلب الوصول، اختر نوع النشاط، جهّز المساحة، ثم ابدأ بعد التفعيل.' },
      { question: 'هل يمكن نقل بيانات النشاط الحالية؟', answer: 'نقيّم احتياجات النقل بشكل فردي. اذكر المصدر والصيغة عند طلب الوصول لمراجعة الإمكانية.' },
      { question: 'كيف أطلب الوصول؟', answer: 'استخدم نموذج الطلب أو البريد. يفتح الموقع رسالة جاهزة في تطبيق بريدك ولا يرسل نموذجًا بصمت.' },
    ],
    finalEyebrow: 'ابدأ من سير العمل', finalTitle: 'أخبرنا كيف يعمل نشاطك.', finalDescription: 'سنساعدك في تحديد سير العمل المدعوم والخطوة العملية التالية.',
  },
  features: { ...en.features, eyebrow: 'ميزات المنصة', title: 'قدرات أعمال مرتبة حسب سير العمل، لا حسب مصطلحات البرمجيات.', intro: 'أساس مشترك مع أدوات خاصة بكل قطاع. نوضح أين تنطبق كل قدرة.', groups: [
    { title: 'العمليات', description: 'خطط ونفّذ العمل الأساسي.', items: ['الرحلات والبرامج', 'نقطة بيع المتاجر', 'طاولات وطلبات وشاشة مطبخ وحجوزات للمطاعم (وصول مبكر)', 'استقبال المركبات وأوامر العمل (وصول مبكر)'] },
    { title: 'العملاء', description: 'اربط الأشخاص بالسجلات التشغيلية.', items: ['المسافرون والعملاء', 'تحليلات العملاء المتكررين حيث تتوفر', 'هياكل ضيوف المطعم (وصول مبكر)', 'سجل مالك المركبة (وصول مبكر)'], note: 'تختلف قدرات العملاء حسب القطاع وليست CRM موحدًا.' },
    { title: 'المبيعات', description: 'سجّل النشاط التجاري وراجعه.', items: ['مبيعات السفر وماليات الرحلة', 'السلة والضريبة والمبيعات والإيصالات', 'سجل المعاملات والطلبات'] },
    { title: 'تتبع الدفعات', description: 'تابع المستحق والمحصّل.', items: ['جداول الدفع', 'الأقساط', 'المبالغ المحصلة وغير المدفوعة', 'سجل الدفع'], note: 'تتبع فقط، دون معالجة بطاقات عبر الإنترنت.' },
    { title: 'التتبع المالي', description: 'اربط التشغيل بالرؤية المالية.', items: ['الإيراد', 'التكلفة', 'الربح', 'الأرصدة المستحقة', 'صحة الدفعات حيث تتوفر'] },
    { title: 'المستندات', description: 'أنشئ المستندات التشغيلية واحتفظ بها وصدّرها.', items: ['PDF', 'الإيصالات', 'مستندات السفر', 'مستندات الإصلاح', 'التصدير حيث يتوفر'] },
    { title: 'التقارير', description: 'راجع الأداء داخل سير العمل.', items: ['تقارير السفر', 'ملخصات المبيعات', 'أداء الوجهات', 'تحليلات نقطة البيع', 'تحليلات المطعم (وصول مبكر)'] },
    { title: 'إعداد النشاط', description: 'كيّف المساحة مع نشاطك.', items: ['هوية النشاط', 'العربية والإنجليزية والعبرية', 'تفضيلات العملة', 'إعداد حسب القطاع'] },
  ], scopeTitle: 'نحدد نطاق القدرات بوضوح.', scopeDescription: 'وجود قدرة في قطاع لا يعني وجودها بالشكل نفسه في كل القطاعات. توضح صفحات الحلول وحالة الجاهزية نطاق كل سير عمل.' },
  solutions: { eyebrow: 'الحلول', title: 'سير عمل حسب القطاع مع حالة جاهزية واضحة.', intro: 'كل حل منشور يرتبط بتنفيذ حقيقي داخل المنتج، وليس بطاقة عامة.', readinessTitle: 'ماذا تعني الحالة؟', readinessDescription: 'متاح يعني أن سير العمل الأساسي المذكور جاهز للإنتاج. وصول مبكر يعني أن سير عمل موثوقًا موجود بينما تكتمل أجزاء أخرى.' },
  solutionsBySlug: {
    'travel-agencies': { ...en.solutionsBySlug['travel-agencies'], eyebrow: 'متاح · أقوى قطاع', title: 'نظام تشغيل مترابط لوكالات السفر.', summary: 'اجمع الرحلات والمسافرين والبرامج والتتبع المالي وخطط الدفع والأقساط والمستندات والتقارير والتشغيل متعدد اللغات.', status: 'متاح', workflowTitle: 'من إعداد الرحلة إلى المتابعة المالية', visualLabel: 'عمليات السفر', closing: 'اطلب الوصول لمناقشة سير عمل السفر والبيانات التي تريد إدخالها.', workflows: [
      { title: 'سير الرحلة', description: 'أنشئ سجلات الرحلات وأدرها عبر الحالات.', items: ['تفاصيل الرحلة', 'المسافرون', 'البرامج', 'السجل التشغيلي'] },
      { title: 'الدفعات والأقساط', description: 'اربط كل رحلة بصورتها المالية.', items: ['جداول الدفع', 'خطط الأقساط', 'سجل الدفع', 'الأرصدة المستحقة'] },
      { title: 'المستندات والتواصل', description: 'أبقِ المخرجات قريبة من سجل الرحلة.', items: ['PDF والتصدير', 'القوالب', 'المرفقات', 'مستندات متعددة اللغات'] },
      { title: 'التقارير والتحليلات', description: 'راجع الوكالة تشغيليًا وماليًا.', items: ['أداء الوجهات', 'العملاء المتكررون', 'صحة الدفعات', 'التقارير المالية'] },
    ] },
    supermarkets: { ...en.solutionsBySlug.supermarkets, eyebrow: 'متاح · نقطة بيع أساسية', title: 'سير نقطة بيع مركز لفريق المتجر.', summary: 'أدر المنتجات والفئات والباركود والأصناف الموزونة والضريبة والمبيعات والإيصالات والسجل والتحليلات الأساسية.', status: 'متاح', workflowTitle: 'بيع أساسي دون ادعاءات مخزون مبالغ فيها', visualLabel: 'نقطة بيع المتجر', closing: 'يركز العرض الحالي على نقطة البيع الأساسية ولا يقدم إنفاذ مخزون متقدمًا كميزة مكتملة.', workflows: [
      { title: 'دليل المنتجات', description: 'نظم المنتجات عند نقطة البيع.', items: ['المنتجات', 'الفئات', 'الباركود', 'الأصناف الموزونة'] },
      { title: 'نقطة البيع', description: 'أنشئ السلة وسجل البيع.', items: ['السلة', 'حساب الضريبة', 'تسجيل طريقة الدفع', 'الإيصال'] },
      { title: 'السجل', description: 'راجع المعاملات المكتملة.', items: ['سجل المعاملات', 'مراجعة الإيصال', 'سجلات المبيعات'] },
      { title: 'التحليلات', description: 'راجع ملخصات المبيعات الأساسية.', items: ['ملخصات المبيعات', 'تحليل المعاملات', 'اتجاهات أساسية'] },
    ] },
    restaurants: { ...en.solutionsBySlug.restaurants, eyebrow: 'وصول مبكر', title: 'تشغيل المطعم حول الصالة والمطبخ وفريق الخدمة.', summary: 'يشمل الوصول المبكر الطاولات والمخطط والقوائم والموظفين والطلبات وشاشة المطبخ والحجوزات والسجل والتحليلات.', status: 'وصول مبكر', workflowTitle: 'سير عمل مطعم موثّق', visualLabel: 'صالة المطعم والمطبخ', closing: 'مناسب للتقييم الموجّه. لا نقدم معالجة الدفع أو التدفقات غير المكتملة كميزات جاهزة.', workflows: [
      { title: 'عمليات الصالة', description: 'مثّل مساحة الخدمة والعمل النشط.', items: ['الطاولات', 'مخطط الصالة', 'الطلبات النشطة'] },
      { title: 'القائمة والطلبات', description: 'ادعم المسار من الاختيار إلى المطبخ.', items: ['القائمة', 'الطلبات', 'شاشة المطبخ'] },
      { title: 'الضيوف والحجوزات', description: 'نسق الخدمة القادمة والسجل.', items: ['الحجوزات', 'سجل الطلبات', 'هياكل الضيوف'] },
      { title: 'الإدارة', description: 'استخدم الهياكل الموثقة دون إخفاء النواقص.', items: ['هيكل الموظفين', 'تحليلات المطعم', 'الإعدادات حيث تتوفر'] },
    ] },
    'auto-repair': { ...en.solutionsBySlug['auto-repair'], eyebrow: 'وصول مبكر', title: 'سجل أوضح من استقبال المركبة إلى إكمال العمل.', summary: 'يشمل استقبال المركبة والبحث الحكومي حيث يتوفر وأوامر العمل والقطع والأجور والسجل ومخزون القطع والمستندات.', status: 'وصول مبكر', workflowTitle: 'سير عمل ورشة موثّق', visualLabel: 'عمليات الورشة', closing: 'تظل تجربة الورشة وصولًا مبكرًا بينما يكتمل ترابط لوحة التحكم والتدفقات المتبقية.', workflows: [
      { title: 'استقبال المركبة', description: 'ابدأ بسجل منظم للمركبة والمالك.', items: ['تسجيل المركبة', 'بيانات المالك', 'بحث حكومي حيث يتوفر'] },
      { title: 'أوامر العمل', description: 'سجل المطلوب والمنفذ.', items: ['الخدمات', 'القطع', 'الأجور', 'سجل العمل'] },
      { title: 'القطع', description: 'أدر القطع المستخدمة في الورشة.', items: ['دليل القطع', 'سجلات المخزون', 'استهلاك المخزون في التدفقات المدعومة'] },
      { title: 'المستندات', description: 'أنشئ مخرجات من سجل الإصلاح.', items: ['مستندات الإصلاح', 'PDF', 'سجلات قابلة للمشاركة'] },
    ] },
  },
  pricing: { eyebrow: 'التسعير', title: 'منتج واحد. تفعيل بمساعدة.', intro: 'لا ينشر MyDesck PRO سعرًا ذاتي الخدمة ولا يخترع باقات. نؤكد أولًا سير العمل واحتياجات الإعداد.', cardTitle: 'MyDesck PRO', cardDescription: 'مساحة تشغيل متعددة اللغات لنوع نشاط مدعوم.', includedTitle: 'ما تغطيه المحادثة', included: ['الوصول للمنصة الأساسية', 'سير العمل المناسب', 'العربية والإنجليزية والعبرية', 'الويب وWindows حيث ينطبق', 'إعداد المساحة بمساعدة'], processTitle: 'كيف يعمل التفعيل التجاري', process: [{ title: 'ناقش سير العمل', description: 'اشرح كيف يعمل الفريق اليوم.' }, { title: 'راجع الملاءمة والإعداد', description: 'نؤكد الجاهزية والإعداد وأسئلة نقل البيانات.' }, { title: 'اطلب تجربة', description: 'يمكن مناقشة التجربة دون إدخال بيانات دفع.' }], note: 'لا نجمع بيانات دفع هنا. نؤكد توفر التجربة ومدتها والشروط التجارية مباشرة.' },
  security: { eyebrow: 'الأمان', title: 'وصول سحابي موثّق بحدود خاصة بكل نشاط.', intro: 'يستخدم MyDesck PRO بنية إنتاج سحابية. تحل هذه الصفحة محل ادعاءات التخزين المحلي و100% دون اتصال القديمة.', principles: [
    { title: 'الهوية والجلسات', description: 'توفر Firebase Authentication تسجيل الدخول والجلسات واستعادة كلمة المرور.', items: ['وصول موثّق', 'دورة حياة الجلسة', 'استعادة كلمة المرور'] },
    { title: 'بيانات النشاط', description: 'تخزن السجلات في Firestore وتصل عبر صلاحيات واعية بالنشاط.', items: ['تخزين سحابي', 'صلاحيات خاصة بالنشاط', 'كتابة مؤكدة من الخادم'] },
    { title: 'الأصول الخاصة', description: 'تستخدم الملفات الخاصة وصولًا موثّقًا عبر طبقة التخزين.', items: ['مسارات خاصة', 'استرجاع موثّق', 'حدود الملكية'] },
    { title: 'تسليم المنتج', description: 'تصل إصدارات الويب وسطح المكتب عبر مسارات تحديث مضبوطة.', items: ['إصدارات الويب', 'تحديث سطح المكتب', 'تصدير البيانات حيث يتوفر'] },
  ], responsibilityTitle: 'ادعاءات لا نقدمها', responsibilityDescription: 'لا ندّعي شهادات أو امتثالًا تنظيميًا أو خوارزمية تشفير محددة أو وتيرة نسخ احتياطي أو ضمان وقت تشغيل أو إقامة بيانات دون دليل منفصل.', recoveryTitle: 'استعادة الحساب', recoveryDescription: 'تستخدم استعادة كلمة المرور مزود الهوية. تتوفر صادرات البيانات داخل التدفقات المنفذة ويمكن مناقشة الاحتياجات أثناء الإعداد.' },
  legal: { ...en.legal, privacyTitle: 'إشعار الخصوصية', privacyIntro: 'يوضح هذا الإشعار فئات المعلومات عند زيارة الموقع أو التواصل أو استخدام مساحة مفعلة.', privacySections: [
    { title: 'التواصل عبر الموقع', description: 'يجهز النموذج رسالة في تطبيق بريدك.', items: ['الاسم والبريد', 'اسم النشاط', 'نوع الطلب', 'الرسالة التي تختار إرسالها'] },
    { title: 'معلومات الحساب', description: 'تستخدم المساحة معلومات الحساب والنشاط اللازمة للخدمة.', items: ['هوية الحساب', 'ملف النشاط', 'تفضيلات المساحة', 'السجلات التشغيلية'] },
    { title: 'مزودو الخدمة', description: 'تستخدم بنية الإنتاج Firebase Authentication وFirestore وSupabase Storage للملفات فقط.', items: ['الهوية والجلسات', 'قاعدة البيانات السحابية', 'تخزين الملفات الخاصة'] },
    { title: 'خياراتك', description: 'يمكنك التواصل بشأن الوصول أو التصحيح أو التصدير أو الحساب.', items: ['أسئلة الوصول', 'طلبات التصحيح', 'أسئلة التصدير', 'دعم الحساب'] },
  ], termsTitle: 'شروط الاستخدام', termsIntro: 'تصف هذه الشروط المبسطة الموقع ونموذج التفعيل بمساعدة. تؤكد الشروط التجارية بشكل منفصل.', termsSections: [
    { title: 'استخدام الموقع', description: 'استخدم الموقع قانونيًا ولا تعطل خدماته أو تحاول الوصول غير المصرح.', items: ['استخدام قانوني', 'لا وصول غير مصرح', 'لا تعطيل للخدمة'] },
    { title: 'جاهزية المنتج', description: 'تصف حالتا متاح ووصول مبكر النضج الحالي.', items: ['سير عمل متاح', 'حدود الوصول المبكر', 'لا بيع لقطاعات placeholder'] },
    { title: 'التفعيل التجاري', description: 'يتم تأكيد السعر والتجربة والإعداد والنطاق مباشرة.', items: ['لا دفع ذاتي', 'لا بيانات دفع هنا', 'تأكيد تجاري منفصل'] },
    { title: 'تغييرات المنتج', description: 'قد تتغير الميزات ومناطق الوصول المبكر مع التطوير.', items: ['تحديثات معقولة', 'تطور الجاهزية', 'تأكيد الشروط المهمة منفصلًا'] },
  ], reviewNote: 'ملاحظة مصدرية: يحتاج هذا النص الأولي إلى مراجعة قانونية مهنية قبل اعتباره نصًا نهائيًا خاصًا بولاية قضائية.' },
  contact: { eyebrow: 'تواصل', title: 'أخبرنا كيف يعمل نشاطك.', intro: 'اطلب الوصول أو ناقش تجربة أو عرض المنتج أو الدعم. تستخدم الصفحة بريدًا واضحًا.', intentLabel: 'كيف نساعدك؟', intents: { trial: 'اطلب تجربة', demo: 'اطلب عرض المنتج', sales: 'تحدث مع المبيعات', support: 'احصل على الدعم' }, nameLabel: 'اسمك', emailLabel: 'بريد العمل', businessLabel: 'اسم النشاط', messageLabel: 'ماذا ينبغي أن نعرف؟', send: 'افتح مسودة البريد', direct: 'تفضل الكتابة مباشرة؟', truth: 'يفتح الإرسال رسالة جاهزة في تطبيق بريدك. لا يخزن الموقع أو يرسل شيئًا بصمت.' },
  footer: { ...en.footer, statement: 'عمليات وعملاء ورؤية مالية خاصة بالقطاع في مساحة متعددة اللغات.', product: 'المنتج', industries: 'القطاعات', resources: 'الموارد', legal: 'قانوني', links: {
    product: [{ label: 'الميزات', path: '/features' }, { label: 'الحلول', path: '/solutions' }, { label: 'التسعير', path: '/pricing' }], industries: [{ label: 'وكالات السفر', path: '/solutions/travel-agencies' }, { label: 'المتاجر', path: '/solutions/supermarkets' }, { label: 'المطاعم', path: '/solutions/restaurants' }, { label: 'ورش السيارات', path: '/solutions/auto-repair' }], resources: [{ label: 'الأمان', path: '/security' }, { label: 'تواصل', path: '/contact' }, { label: 'تسجيل الدخول', path: '/login' }], legal: [{ label: 'الخصوصية', path: '/privacy' }, { label: 'الشروط', path: '/terms' }],
  }, rights: 'جميع الحقوق محفوظة.' },
};

const he: MarketingCopy = {
  ...en,
  localeName: 'עברית',
  skip: 'דלג לתוכן הראשי',
  nav: { features: 'יכולות', solutions: 'פתרונות', pricing: 'תמחור', security: 'אבטחה', login: 'כניסה', requestAccess: 'בקשת גישה', menu: 'פתיחת תפריט', close: 'סגירת תפריט', language: 'שפה' },
  common: { requestAccess: 'בקשת גישה', requestTrial: 'בקשת ניסיון', contactSales: 'יצירת קשר עם מכירות', exploreProduct: 'גלו את המוצר', learnMore: 'למידע נוסף', available: 'זמין', earlyAccess: 'גישה מוקדמת', productPreview: 'תצוגת מוצר', sanitizedPreview: 'תצוגה מנוקה עם נתוני עסק לדוגמה.', backHome: 'חזרה לדף הבית' },
  home: {
    ...en.home,
    eyebrow: 'סביבת עבודה אחת. תהליכים שמתאימים לעסק.', heroTitle: 'נהלו תפעול, לקוחות וכספים מסביבת עבודה מחוברת אחת.',
    heroDescription: 'MyDesck PRO מאגד תהליכים ייעודיים לסוכנויות נסיעות, סופרמרקטים, מסעדות ומוסכים בפלטפורמה עסקית רגועה ורב-לשונית.',
    credibility: ['English / العربية / עברית', 'תמיכת RTL מלאה', 'ווב + אפליקציית Windows', 'תהליכים לפי ענף', 'אימות ענן מאובטח'],
    problemEyebrow: 'נבנה למציאות התפעולית', problemTitle: 'עבודה חשובה לא צריכה להתפזר בין כלים מנותקים.', problemDescription: 'פרטי לקוחות, לוחות תשלום, קבלות, מסמכים ותפעול יומיומי נמצאים לעיתים קרובות בגיליונות, נייר ומערכות נפרדות.',
    scattered: ['גיליונות נתונים', 'קבלות נייר', 'לוחות תשלום', 'פרטי לקוחות', 'מערכות ענפיות'],
    solutionTitle: 'שכבת תפעול אחת לעבודה שחייבת להישאר מחוברת.', solutionDescription: 'MyDesck PRO מארגן את התהליכים שכל עסק באמת משתמש בהם, ושומר את הכספים, ההיסטוריה, המסמכים והדוחות קרובים לתפעול.',
    capabilitiesEyebrow: 'מערכת היכולות', capabilitiesTitle: 'בנוי סביב העבודה שהצוות מבצע בכל יום.', capabilitiesIntro: 'הפלטפורמה משלבת תשתית עסקית משותפת עם כלים ייעודיים לכל ענף נתמך.',
    capabilities: [
      { title: 'תפעול', description: 'שמרו על העבודה היומית גלויה ומסודרת.', items: ['טיולים ומסלולים', 'קופה והזמנות', 'כרטיסי עבודה', 'הגדרות עסק'] },
      { title: 'מכירות ומעקב תשלומים', description: 'תעדו פעילות מסחרית בלי לטעון לעיבוד תשלום מקוון.', items: ['היסטוריית מכירות', 'סכומים שנגבו', 'תשלומים מתוזמנים', 'רישומי תשלומים'] },
      { title: 'נראות פיננסית', description: 'הבינו מה הוכנס, נגבה, הוצא ומה עדיין נדרש.', items: ['הכנסות ועלויות', 'רווח', 'יתרות פתוחות', 'בריאות תשלומים'] },
      { title: 'מסמכים ודוחות', description: 'שמרו רשומות תפעוליות מוכנות לבדיקה ולשיתוף.', items: ['PDF ויצוא', 'קבלות ומסמכים', 'דוחות עסקיים', 'ניתוחים תפעוליים'] },
    ],
    industriesEyebrow: 'תהליכים לפי ענף', industriesTitle: 'בחרו את מודל התפעול שמתאים לעסק.', industriesIntro: 'אנחנו מציגים מוכנות בצורה ברורה; גישה מוקדמת לעולם לא מוצגת כמוצר שהושלם.',
    howEyebrow: 'הצטרפות בליווי', howTitle: 'דרך מעשית מהשיחה הראשונה לעבודה היומיומית.', steps: [{ title: 'בקשו גישה', description: 'ספרו לנו איזו עבודה תרצו לחבר.' }, { title: 'בחרו סוג עסק', description: 'נתאים את סביבת העבודה לתהליך נתמך.' }, { title: 'הגדירו סביבת עבודה', description: 'נכין שפה, מטבע, פרטי עסק וכלים.' }, { title: 'מתחילים לעבוד', description: 'הצוות מתחיל בסביבה שמתאימה לעסק.' }],
    financeEyebrow: 'ניהול פיננסי', financeTitle: 'ראו את המצב הפיננסי שמאחורי התפעול.', financeDescription: 'MyDesck PRO מחבר רשומות תפעוליות למספרים שהצוות צריך לעקוב אחריהם, במיוחד בתהליך הנסיעות.', financeItems: ['מכירות', 'עלות', 'רווח', 'סכום שנגבה', 'יתרות שלא שולמו', 'תשלומים מתוזמנים', 'תשלומים', 'היסטוריית תשלום'], financeNote: 'MyDesck PRO עוקב אחר פעילות תשלומים; הוא אינו מעבד כיום תשלומי כרטיס אונליין.',
    reportingEyebrow: 'דוחות וניתוחים', reportingTitle: 'הפכו רשומות יומיות לאותות תפעוליים שימושיים.', reportingDescription: 'בדקו ביצועי יעדים, לקוחות חוזרים, בריאות תשלומים, גיול חובות וסיכומי מכירות במקום שבו הם קיימים.', reportingItems: ['ביצועי יעדים', 'לקוחות חוזרים', 'בריאות תשלומים', 'גיול יתרות', 'סיכומי מכירות'],
    securityEyebrow: 'גישה מהימנה', securityTitle: 'גישה מבוססת ענן עם גבולות נתונים ברורים.', securityDescription: 'אימות, הרשאות מודעות לעסק, נכסים פרטיים וכתיבות מאושרות שרת תומכים בסביבת הייצור.', securityItems: ['גישה מאומתת', 'הרשאות לפי עסק', 'אחסון נכסים פרטי', 'כתיבות מאושרות שרת'],
    pricingEyebrow: 'MyDesck PRO', pricingTitle: 'מוצר אחד, מוגדר סביב העסק.', pricingDescription: 'ההפעלה וההצטרפות המסחרית נעשות כעת בליווי. נשוחח על התהליך הרלוונטי לפני הכנת הגישה.', pricingItems: ['פלטפורמה עסקית', 'תהליכים ייעודיים', 'עבודה רב-לשונית', 'הפעלה בליווי'],
    faqEyebrow: 'שאלות נפוצות', faqTitle: 'תשובות ישירות לפני בקשת גישה.', faqs: [
      { question: 'אילו עסקים MyDesck תומך?', answer: 'סוכנויות נסיעות ותהליכי קופה מרכזיים לסופרמרקטים זמינים. מסעדות ומוסכים מוצעים בגישה מוקדמת.' },
      { question: 'אילו שפות נתמכות?', answer: 'אנגלית, ערבית ועברית, כולל פריסת ימין לשמאל לערבית ולעברית.' },
      { question: 'אפשר להשתמש במחשב שולחני?', answer: 'כן. MyDesck PRO תומך בווב ובאפליקציית Windows.' },
      { question: 'יש גרסת ווב?', answer: 'כן. משתמשים מאומתים יכולים לגשת לסביבת הייצור דרך הווב.' },
      { question: 'MyDesck מעבד תשלומים?', answer: 'לא. המערכת מתעדת ועוקבת אחר מכירות, תשלומים, לוחות תשלום, גבייה והיסטוריה, אך לא מעבדת כרטיסים אונליין.' },
      { question: 'איך מתבצעת ההצטרפות?', answer: 'בליווי: מבקשים גישה, בוחרים סוג עסק, מגדירים סביבת עבודה ומתחילים לאחר הפעלה.' },
      { question: 'אפשר להעביר נתונים קיימים?', answer: 'צורכי העברה נבדקים פרטנית. ספרו לנו על המקור והפורמט כדי שנבדוק היתכנות.' },
      { question: 'איך מבקשים גישה?', answer: 'השתמשו בטופס או בדוא״ל. האתר פותח טיוטה באפליקציית הדואר ואינו שולח טופס בשקט.' },
    ], finalEyebrow: 'מתחילים מהתהליך', finalTitle: 'ספרו לנו איך העסק שלכם עובד.', finalDescription: 'נעזור לזהות את התהליך הנתמך ואת הצעד המעשי הבא.',
  },
  features: { ...en.features, eyebrow: 'יכולות הפלטפורמה', title: 'יכולות עסקיות לפי תהליך עבודה, לא לפי ז׳רגון תוכנה.', intro: 'תשתית משותפת פוגשת כלים ייעודיים. כל יכולת מוגדרת לענפים שבהם היא מיושמת.', groups: [
    { title: 'תפעול', description: 'תכננו ובצעו את עבודת הליבה.', items: ['טיולים ומסלולים', 'קופת סופרמרקט', 'שולחנות, הזמנות, KDS והזמנות מקום (גישה מוקדמת)', 'קליטת רכב וכרטיסי עבודה (גישה מוקדמת)'] },
    { title: 'לקוחות', description: 'חברו אנשים לרשומות התפעוליות.', items: ['נוסעים ולקוחות', 'ניתוח לקוחות חוזרים היכן שזמין', 'מבני אורחים במסעדה (גישה מוקדמת)', 'היסטוריית בעל רכב (גישה מוקדמת)'], note: 'היכולות משתנות לפי ענף ואינן מוצגות כ-CRM אחוד.' },
    { title: 'מכירות', description: 'תעדו ובדקו פעילות מסחרית.', items: ['מכירות נסיעות וכספי טיול', 'עגלה, מע״מ, מכירות וקבלות', 'היסטוריית עסקאות והזמנות'] },
    { title: 'מעקב תשלומים', description: 'עקבו אחרי מה שנדרש ומה שנגבה.', items: ['לוחות תשלום', 'תשלומים', 'סכומים שנגבו ופתוחים', 'היסטוריית תשלום'], note: 'מעקב בלבד; אין עיבוד כרטיסים אונליין.' },
    { title: 'מעקב פיננסי', description: 'חברו תפעול לנראות פיננסית.', items: ['הכנסה', 'עלות', 'רווח', 'יתרות פתוחות', 'בריאות תשלומים היכן שיושמה'] },
    { title: 'מסמכים', description: 'צרו, שמרו וייצאו מסמכים תפעוליים.', items: ['PDF', 'קבלות', 'מסמכי נסיעות', 'מסמכי תיקון', 'כלי יצוא'] },
    { title: 'דוחות', description: 'בדקו ביצועים בתוך התהליך.', items: ['דוחות נסיעות', 'סיכומי מכירות', 'ביצועי יעדים', 'ניתוחי קופה', 'ניתוחי מסעדה (גישה מוקדמת)'] },
    { title: 'הגדרות עסק', description: 'התאימו את הסביבה לעסק.', items: ['זהות עסקית', 'עברית, ערבית ואנגלית', 'העדפות מטבע', 'הגדרות לפי ענף'] },
  ], scopeTitle: 'היכולות מוגדרות בכוונה.', scopeDescription: 'יכולת בענף אחד לא משתמעת כזהה בכל ענף אחר. תוויות המוכנות וההערות מסבירות את ההיקף.' },
  solutions: { eyebrow: 'פתרונות', title: 'תהליכים ענפיים עם תוויות מוכנות כנות.', intro: 'כל פתרון ציבורי ממופה ליישום אמיתי במוצר.', readinessTitle: 'מה אומרת התווית?', readinessDescription: 'זמין אומר שתהליכי הליבה המוצהרים מוכנים. גישה מוקדמת אומרת שתהליכים מאומתים קיימים וחלקים נוספים עדיין מושלמים.' },
  solutionsBySlug: {
    'travel-agencies': { ...en.solutionsBySlug['travel-agencies'], eyebrow: 'זמין · הענף החזק ביותר', title: 'מערכת תפעול מחוברת לסוכנויות נסיעות.', summary: 'רכזו טיולים, נוסעים, מסלולים, מעקב פיננסי, לוחות תשלום, מסמכים, דוחות ועבודה רב-לשונית.', status: 'זמין', workflowTitle: 'מהקמת הטיול למעקב הפיננסי', visualLabel: 'תפעול נסיעות', closing: 'בקשו גישה כדי לדון בתהליך הנסיעות ובנתונים שתרצו להביא.', workflows: [
      { title: 'תהליך טיול', description: 'צרו ונהלו רשומות לאורך מצבים והיסטוריה.', items: ['פרטי טיול', 'נוסעים', 'מסלולים', 'היסטוריה תפעולית'] },
      { title: 'תשלומים', description: 'חברו כל טיול לתמונה הפיננסית.', items: ['לוחות תשלום', 'תוכניות תשלומים', 'היסטוריית תשלום', 'יתרות פתוחות'] },
      { title: 'מסמכים ותקשורת', description: 'שמרו פלטים קרוב לרשומה.', items: ['PDF ויצוא', 'תבניות', 'קבצים מצורפים', 'מסמכים רב-לשוניים'] },
      { title: 'דוחות וניתוחים', description: 'בדקו את הסוכנות תפעולית ופיננסית.', items: ['ביצועי יעדים', 'לקוחות חוזרים', 'בריאות תשלומים', 'דוחות פיננסיים'] },
    ] },
    supermarkets: { ...en.solutionsBySlug.supermarkets, eyebrow: 'זמין · קופה מרכזית', title: 'תהליך קופה ממוקד לצוותי סופרמרקט.', summary: 'נהלו מוצרים וקטגוריות, ברקוד ופריטים שקילים, מע״מ, מכירות, קבלות, היסטוריה וניתוח בסיסי.', status: 'זמין', workflowTitle: 'מכירה מרכזית בלי טענות מלאי מנופחות', visualLabel: 'קופת סופרמרקט', closing: 'ההצעה מתמקדת בקופה מרכזית ואינה מציגה אכיפת מלאי מתקדמת כיכולת שהושלמה.', workflows: [
      { title: 'קטלוג מוצרים', description: 'ארגנו מוצרים בקופה.', items: ['מוצרים', 'קטגוריות', 'ברקוד', 'פריטים שקילים'] },
      { title: 'נקודת מכירה', description: 'בנו עגלה והשלימו מכירה מתועדת.', items: ['עגלה', 'חישוב מע״מ', 'רישום אמצעי תשלום', 'קבלה'] },
      { title: 'היסטוריה', description: 'בדקו עסקאות שהושלמו.', items: ['היסטוריית עסקאות', 'בדיקת קבלה', 'רשומות מכירה'] },
      { title: 'ניתוחים', description: 'ראו סיכומי מכירות בסיסיים.', items: ['סיכומי מכירות', 'ניתוח עסקאות', 'מגמות בסיסיות'] },
    ] },
    restaurants: { ...en.solutionsBySlug.restaurants, eyebrow: 'גישה מוקדמת', title: 'תפעול מסעדה סביב האולם, המטבח וצוות השירות.', summary: 'תהליכים מאומתים כוללים שולחנות, תוכנית אולם, תפריט, צוות, הזמנות, KDS, הזמנות מקום, היסטוריה וניתוחים.', status: 'גישה מוקדמת', workflowTitle: 'תהליכי מסעדה מאומתים', visualLabel: 'אולם מסעדה ו-KDS', closing: 'מתאים להערכה מלווה. עיבוד תשלום ותהליכי Firestore שלא הושלמו אינם מוצגים כמוכנים.', workflows: [
      { title: 'תפעול אולם', description: 'ייצגו את חלל השירות והעבודה הפעילה.', items: ['שולחנות', 'תוכנית אולם', 'הזמנות פעילות'] },
      { title: 'תפריט והזמנות', description: 'תמכו במסלול מהבחירה למטבח.', items: ['תפריט', 'הזמנות', 'מערכת תצוגת מטבח'] },
      { title: 'אורחים והזמנות מקום', description: 'תאמו שירות עתידי והיסטוריה.', items: ['הזמנות מקום', 'היסטוריית הזמנות', 'מבני אורחים'] },
      { title: 'ניהול', description: 'השתמשו במבנים מאומתים בלי להציג חלקים חסרים כמלאים.', items: ['מבני צוות', 'ניתוחי מסעדה', 'הגדרות זמינות'] },
    ] },
    'auto-repair': { ...en.solutionsBySlug['auto-repair'], eyebrow: 'גישה מוקדמת', title: 'רשומה ברורה יותר מקליטת הרכב ועד סיום העבודה.', summary: 'תהליכים מאומתים כוללים קליטת רכב, חיפוש נתוני ממשלה כשזמין, כרטיסי עבודה, חלקים, עבודה, היסטוריה ומסמכים.', status: 'גישה מוקדמת', workflowTitle: 'תהליכי מוסך מאומתים', visualLabel: 'תפעול מוסך', closing: 'חוויית המוסך נשארת בגישה מוקדמת בזמן שחיבור לוח הבקרה והתהליכים הנותרים מבשילים.', workflows: [
      { title: 'קליטת רכב', description: 'התחילו ברשומת רכב ובעלים מסודרת.', items: ['רישום רכב', 'פרטי בעלים', 'חיפוש ממשלתי כשזמין'] },
      { title: 'כרטיסי עבודה', description: 'תעדו את העבודה המבוקשת והמבוצעת.', items: ['שירותים', 'חלקים', 'עבודה', 'היסטוריה'] },
      { title: 'חלקים', description: 'נהלו את החלקים שהמוסך משתמש בהם.', items: ['קטלוג חלקים', 'רשומות מלאי', 'צריכת מלאי בתהליכים נתמכים'] },
      { title: 'מסמכים', description: 'הכינו פלטים מרשומת התיקון.', items: ['מסמכי תיקון', 'PDF', 'רשומות לשיתוף'] },
    ] },
  },
  pricing: { eyebrow: 'תמחור', title: 'מוצר אחד. הפעלה בליווי.', intro: 'MyDesck PRO אינו מפרסם מחיר בשירות עצמי ואינו ממציא חבילות. קודם נאשר את התהליך וצרכי ההצטרפות.', cardTitle: 'MyDesck PRO', cardDescription: 'סביבת תפעול רב-לשונית לסוג עסק נתמך.', includedTitle: 'מה נבדוק בשיחה', included: ['גישה לפלטפורמה', 'תהליך עסקי רלוונטי', 'עברית, ערבית ואנגלית', 'ווב ו-Windows היכן שמתאים', 'הגדרה בליווי'], processTitle: 'כך עובדת הפעלה מסחרית', process: [{ title: 'דנים בתהליך', description: 'ספרו איך הצוות עובד היום.' }, { title: 'בודקים התאמה והגדרה', description: 'נאשר מוכנות, הגדרות ושאלות העברת נתונים.' }, { title: 'מבקשים ניסיון', description: 'אפשר לדון בניסיון בלי למסור פרטי תשלום באתר.' }], note: 'לא נאספים כאן פרטי תשלום. זמינות ניסיון, משך ותנאים מסחריים מאושרים ישירות.' },
  security: { eyebrow: 'אבטחה', title: 'גישה מאומתת לענן עם גבולות מודעי-עסק.', intro: 'MyDesck PRO משתמש כעת בארכיטקטורת ענן לייצור. דף זה מחליף טענות ישנות של מקומי בלבד ו-100% אופליין.', principles: [
    { title: 'זהות וסשנים', description: 'Firebase Authentication מספק כניסה, ניהול סשן ואיפוס סיסמה.', items: ['גישה מאומתת', 'מחזור חיי סשן', 'איפוס סיסמה'] },
    { title: 'נתוני עסק', description: 'רשומות תפעוליות נשמרות ב-Firestore ונגישות בהרשאות מודעות לעסק.', items: ['אחסון ענן', 'בקרות לפי עסק', 'כתיבות מאושרות שרת'] },
    { title: 'נכסים פרטיים', description: 'קבצים עסקיים פרטיים משתמשים בגישה מאומתת דרך שכבת האחסון.', items: ['נתיבים פרטיים', 'שליפה מאומתת', 'גבולות בעלות'] },
    { title: 'אספקת מוצר', description: 'גרסאות ווב ודסקטופ נמסרות במסלולי עדכון מבוקרים.', items: ['אספקת ווב', 'עדכון דסקטופ', 'יצוא נתונים היכן שיושם'] },
  ], responsibilityTitle: 'טענות שאיננו מעלים', responsibilityDescription: 'אין כאן טענה להסמכה, תאימות רגולטורית, אלגוריתם הצפנה מסוים, תדירות גיבוי, זמינות מובטחת או מיקום נתונים ללא ראיות נפרדות.', recoveryTitle: 'שחזור חשבון', recoveryDescription: 'איפוס סיסמה משתמש בספק הזהות. יצוא נתונים זמין בתהליכים שיושמו, וניתן לדון בצורכי שחזור והעברה בהצטרפות.' },
  legal: { ...en.legal, privacyTitle: 'הודעת פרטיות', privacyIntro: 'הודעה זו מסבירה אילו סוגי מידע מעורבים בביקור באתר, יצירת קשר או שימוש בסביבה פעילה.', privacySections: [
    { title: 'יצירת קשר באתר', description: 'הטופס מכין דוא״ל באפליקציית הדואר שלכם.', items: ['שם ודוא״ל', 'שם העסק', 'סוג הבקשה', 'ההודעה שתבחרו לשלוח'] },
    { title: 'פרטי חשבון', description: 'סביבות פעילות משתמשות בפרטי החשבון והעסק הנדרשים לשירות.', items: ['זהות חשבון', 'פרופיל עסק', 'העדפות סביבת עבודה', 'רשומות תפעוליות'] },
    { title: 'ספקי שירות', description: 'ארכיטקטורת הייצור משתמשת ב-Firebase Authentication, Firestore וב-Supabase Storage לאחסון בלבד.', items: ['זהות וסשנים', 'מסד נתונים בענן', 'אחסון קבצים פרטיים'] },
    { title: 'הבחירות שלכם', description: 'אפשר ליצור קשר בנושאי גישה, תיקון, יצוא או חשבון.', items: ['שאלות גישה', 'בקשות תיקון', 'שאלות יצוא', 'תמיכת חשבון'] },
  ], termsTitle: 'תנאי שימוש', termsIntro: 'תנאים פשוטים אלה מתארים את האתר ואת מודל ההפעלה בליווי. תנאים מסחריים מאושרים בנפרד.', termsSections: [
    { title: 'שימוש באתר', description: 'השתמשו באתר כחוק ואל תנסו לשבש או לגשת ללא הרשאה.', items: ['שימוש חוקי', 'ללא גישה לא מורשית', 'ללא הפרעה לשירות'] },
    { title: 'מוכנות מוצר', description: 'תוויות זמין וגישה מוקדמת מתארות את הבשלות הנוכחית.', items: ['תהליכים זמינים', 'מגבלות גישה מוקדמת', 'אין שיווק של תחומי placeholder'] },
    { title: 'הפעלה מסחרית', description: 'תמחור, ניסיון, הצטרפות והיקף מאושרים ישירות.', items: ['אין תשלום עצמי', 'אין איסוף פרטי תשלום כאן', 'אישור מסחרי נפרד'] },
    { title: 'שינויים במוצר', description: 'יכולות ואזורי גישה מוקדמת עשויים להשתנות.', items: ['עדכוני מוצר סבירים', 'התפתחות מוכנות', 'תנאים מהותיים מאושרים בנפרד'] },
  ], reviewNote: 'הערת מקור: נוסח ראשוני זה דורש בדיקה משפטית מקצועית לפני שייחשב לייעוץ משפטי סופי או להסכם מותאם לדין מסוים.' },
  contact: { eyebrow: 'יצירת קשר', title: 'ספרו לנו איך העסק שלכם עובד.', intro: 'בקשו גישה, דונו בניסיון, בקשו הדגמת מוצר או תמיכה. הדף משתמש בתהליך דוא״ל שקוף.', intentLabel: 'איך נוכל לעזור?', intents: { trial: 'בקשת ניסיון', demo: 'בקשת הדגמת מוצר', sales: 'שיחה עם מכירות', support: 'קבלת תמיכה' }, nameLabel: 'השם שלכם', emailLabel: 'דוא״ל עבודה', businessLabel: 'שם העסק', messageLabel: 'מה חשוב שנדע?', send: 'פתיחת טיוטת דוא״ל', direct: 'מעדיפים לכתוב ישירות?', truth: 'השליחה פותחת דוא״ל מוכן באפליקציית הדואר. האתר אינו שומר או שולח דבר בשקט.' },
  footer: { ...en.footer, statement: 'תפעול ענפי, לקוחות ונראות פיננסית בסביבה רב-לשונית אחת.', product: 'מוצר', industries: 'ענפים', resources: 'משאבים', legal: 'משפטי', links: {
    product: [{ label: 'יכולות', path: '/features' }, { label: 'פתרונות', path: '/solutions' }, { label: 'תמחור', path: '/pricing' }], industries: [{ label: 'סוכנויות נסיעות', path: '/solutions/travel-agencies' }, { label: 'סופרמרקטים', path: '/solutions/supermarkets' }, { label: 'מסעדות', path: '/solutions/restaurants' }, { label: 'מוסכים', path: '/solutions/auto-repair' }], resources: [{ label: 'אבטחה', path: '/security' }, { label: 'יצירת קשר', path: '/contact' }, { label: 'כניסה', path: '/login' }], legal: [{ label: 'פרטיות', path: '/privacy' }, { label: 'תנאים', path: '/terms' }],
  }, rights: 'כל הזכויות שמורות.' },
};

export const siteContent: Record<MarketingLocale, MarketingCopy> = { en, ar, he };
