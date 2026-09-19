import type { MarketingLocale } from '../routes/routeModel';
import type { LeadBusinessType, LeadIntent, LeadTeamSize } from '../leads/leadModel';

export interface Phase2Copy {
  nav: {
    product: string;
    productOverview: string;
    productTour: string;
    contact: string;
    available: string;
    earlyAccess: string;
  };
  demo: {
    eyebrow: string;
    title: string;
    intro: string;
    chooseIndustry: string;
    chooseView: string;
    guidedTour: string;
    syntheticLabel: string;
    syntheticNote: string;
    next: string;
    previous: string;
    step: string;
    of: string;
    requestCta: string;
    industries: Record<'travel' | 'supermarket' | 'restaurant' | 'auto-repair', string>;
    status: Record<'available' | 'early-access', string>;
    screens: Record<string, { label: string; title: string; description: string }>;
    ui: Record<string, string>;
  };
  lead: {
    steps: [string, string, string];
    businessStepTitle: string;
    businessStepDescription: string;
    detailsStepTitle: string;
    detailsStepDescription: string;
    confirmStepTitle: string;
    confirmStepDescription: string;
    businessType: string;
    businessTypes: Record<LeadBusinessType, string>;
    intent: string;
    intents: Record<LeadIntent, string>;
    name: string;
    businessName: string;
    email: string;
    phone: string;
    phoneOptional: string;
    country: string;
    teamSize: string;
    teamSizes: Record<LeadTeamSize, string>;
    message: string;
    messageOptional: string;
    continue: string;
    back: string;
    review: string;
    send: string;
    sending: string;
    required: string;
    invalidEmail: string;
    correctErrors: string;
    truthfulDelivery: string;
    privacyNote: string;
    successTitle: string;
    successDescription: string;
    successNext: string[];
    notStored: string;
    edit: string;
    startOver: string;
  };
  pricing: {
    matrixEyebrow: string;
    matrixTitle: string;
    matrixIntro: string;
    capability: string;
    details: string;
    availability: string;
    notes: string;
    included: string;
    varies: string;
    assisted: string;
    rows: Array<{ area: string; capability: string; availability: string; notes: string }>;
  };
  trust: {
    eyebrow: string;
    title: string;
    intro: string;
    items: Array<{ title: string; description: string }>;
  };
}

const en: Phase2Copy = {
  nav: {
    product: 'Product', productOverview: 'Product overview', productTour: 'Guided demo', contact: 'Contact',
    available: 'Available', earlyAccess: 'Early access',
  },
  demo: {
    eyebrow: 'Guided product tour',
    title: 'See how each workspace turns daily work into a connected flow.',
    intro: 'Explore repository-grounded product views using deterministic synthetic records. This is a guided demonstration—not a live customer workspace.',
    chooseIndustry: 'Choose an industry', chooseView: 'Choose a product view', guidedTour: 'Tour progress',
    syntheticLabel: 'Synthetic demo data',
    syntheticNote: 'All names, records, identifiers, and amounts shown here are fictional and stored only in the application bundle.',
    next: 'Next view', previous: 'Previous view', step: 'Step', of: 'of', requestCta: 'Request access for this workflow',
    industries: { travel: 'Travel agency', supermarket: 'Supermarket', restaurant: 'Restaurant', 'auto-repair': 'Auto repair' },
    status: { available: 'Available', 'early-access': 'Early access' },
    screens: {
      'travel-dashboard': { label: 'Dashboard', title: 'Start with the financial and operational position.', description: 'See active trips, collections, open balances, and items that need attention in one view.' },
      'travel-trips': { label: 'Trips', title: 'Keep each trip connected to the customer and itinerary.', description: 'Review dates, travelers, status, value, and the next operational action without switching tools.' },
      'travel-payments': { label: 'Payment health', title: 'Find balances that need follow-up.', description: 'Payment health separates what was collected, scheduled, and still outstanding.' },
      'travel-installments': { label: 'Installments', title: 'Follow scheduled payments clearly.', description: 'A chronological plan makes due dates and payment status visible to the team.' },
      'travel-analytics': { label: 'Analytics', title: 'Turn trip records into useful signals.', description: 'Compare revenue and profit, destinations, and repeat-customer patterns.' },
      'supermarket-pos': { label: 'POS', title: 'A focused checkout flow for fast retail work.', description: 'Scan or find products, review the basket, and prepare a receipt from one high-velocity view.' },
      'supermarket-sales': { label: 'Sales history', title: 'Review completed sales and daily totals.', description: 'Find receipts, payment methods, VAT, and shift totals without leaving the supermarket workspace.' },
      'restaurant-floor': { label: 'Floor plan', title: 'See table state before opening an order.', description: 'An early-access floor view makes free, seated, and reserved tables easy to distinguish.' },
      'restaurant-kds': { label: 'Kitchen display', title: 'Move orders through the kitchen workflow.', description: 'An early-access KDS groups tickets by preparation state and elapsed time.' },
      'auto-repair-order': { label: 'Work order', title: 'Connect vehicle intake, work, parts, and status.', description: 'An early-access work order gives the team a shared record from diagnosis to handover.' },
    },
    ui: {
      overview: 'Workspace overview', activeTrips: 'Active trips', collected: 'Collected', outstanding: 'Outstanding', profit: 'Estimated profit',
      attention: 'Needs attention', recentTrips: 'Recent trips', customer: 'Customer', destination: 'Destination', status: 'Status', amount: 'Amount',
      confirmed: 'Confirmed', planning: 'Planning', followUp: 'Follow-up', paid: 'Paid', partial: 'Partial', due: 'Due', scheduled: 'Scheduled',
      trip: 'Trip', travelers: 'Travelers', departure: 'Departure', paymentHealth: 'Payment health', installments: 'Installment schedule',
      revenueTrend: 'Revenue and profit trend', destinationMix: 'Destination mix', revenue: 'Revenue',
      scanPrompt: 'Scan barcode or search products', basket: 'Current basket', items: 'items', qty: 'Qty', total: 'Total', cash: 'Cash', card: 'Card', receipt: 'Receipt',
      salesHistory: 'Sales history', transactions: 'Transactions', averageBasket: 'Average basket', vat: 'VAT', completed: 'Completed',
      floorPlan: 'Main floor', available: 'Available', seated: 'Seated', reserved: 'Reserved', table: 'Table', guests: 'guests',
      kitchen: 'Kitchen display', newOrders: 'New', preparing: 'Preparing', ready: 'Ready', minutes: 'min',
      workOrder: 'Work order', vehicle: 'Vehicle', owner: 'Owner', diagnosis: 'Diagnosis', labor: 'Labor', parts: 'Parts', inProgress: 'In progress',
    },
  },
  lead: {
    steps: ['Business', 'Contact', 'Confirm'],
    businessStepTitle: 'What kind of workspace do you need?', businessStepDescription: 'Choose the closest workflow and tell us why you are getting in touch.',
    detailsStepTitle: 'How can we reach the right person?', detailsStepDescription: 'We only ask for details needed to understand and follow up on the request.',
    confirmStepTitle: 'Review before opening your email app.', confirmStepDescription: 'Nothing is stored by this website. We prepare an email for you to review and send.',
    businessType: 'Business type',
    businessTypes: { 'travel-agency': 'Travel agency', supermarket: 'Supermarket', restaurant: 'Restaurant', 'auto-repair': 'Auto repair workshop', other: 'Other business' },
    intent: 'I want to', intents: { trial: 'Request a trial', demo: 'Book a guided demo', sales: 'Talk to sales', support: 'Contact support' },
    name: 'Your name', businessName: 'Business name', email: 'Work email', phone: 'Phone', phoneOptional: 'Optional', country: 'Country', teamSize: 'Team size',
    teamSizes: { '1': 'Just me', '2-5': '2–5 people', '6-20': '6–20 people', '21-50': '21–50 people', '51+': '51+ people' },
    message: 'What should we know?', messageOptional: 'Optional—workflow, timing, or migration needs', continue: 'Continue', back: 'Back', review: 'Review request', send: 'Open prepared email', sending: 'Preparing email…',
    required: 'This field is required.', invalidEmail: 'Enter a valid email address.', correctErrors: 'Check the highlighted fields before continuing.',
    truthfulDelivery: 'This website does not send or store the form. The final step opens a prepared message in your email application.',
    privacyNote: 'Avoid including passwords, payment card data, or customer records.',
    successTitle: 'Your prepared message is ready.', successDescription: 'Your email application should now be open. Review the message and select Send there to complete your request.',
    successNext: ['Review the prepared details', 'Send the message from your email account', 'Keep the sent email as your request record'],
    notStored: 'No lead record was created or stored by this website.', edit: 'Edit details', startOver: 'Start another request',
  },
  pricing: {
    matrixEyebrow: 'Capability matrix', matrixTitle: 'A clear foundation for future plans—without invented prices or limits.',
    matrixIntro: 'MyDesck PRO is currently offered through assisted activation. Exact workflow availability is confirmed before access is prepared.',
    capability: 'Area', details: 'Capability', availability: 'Current position', notes: 'Scope', included: 'Core product', varies: 'Varies by business type', assisted: 'Assisted',
    rows: [
      { area: 'Core platform', capability: 'Workspace, users, business configuration', availability: 'Core product', notes: 'Configured during assisted onboarding.' },
      { area: 'Languages', capability: 'English, Arabic, Hebrew, and RTL', availability: 'Core product', notes: 'Public and product interfaces support all three languages.' },
      { area: 'Desktop / Web', capability: 'Web access and Windows desktop application', availability: 'Core product', notes: 'Access depends on account activation.' },
      { area: 'Business workflows', capability: 'Industry-specific operational tools', availability: 'Varies by business type', notes: 'Travel and supermarket are available; restaurant and auto repair are early access.' },
      { area: 'Financial tracking', capability: 'Revenue, cost, collections, balances, and installments', availability: 'Varies by business type', notes: 'Tracks business activity; it does not process card payments.' },
      { area: 'Reports', capability: 'Operational summaries and analytics', availability: 'Varies by business type', notes: 'Views reflect implemented workflow data.' },
      { area: 'Documents', capability: 'Receipts, PDFs, and export workflows', availability: 'Varies by business type', notes: 'Document types depend on the selected vertical.' },
      { area: 'Support', capability: 'Activation and workflow guidance', availability: 'Assisted', notes: 'Support scope is agreed during activation.' },
    ],
  },
  trust: {
    eyebrow: 'Product evidence', title: 'Trust built from what the product actually does.',
    intro: 'No invented customer counts, logos, or testimonials—only verifiable product capabilities and clear scope.',
    items: [
      { title: 'Three working languages', description: 'English, Arabic, and Hebrew with right-to-left layouts where required.' },
      { title: 'Web and Windows', description: 'A web workspace and a maintained Windows desktop delivery path.' },
      { title: 'Authenticated private workspaces', description: 'Firebase Authentication, tenant-aware authorization, and private business assets.' },
      { title: 'Operational portability', description: 'Document and export workflows are available where each business workflow supports them.' },
      { title: 'Purpose-built workflows', description: 'Travel and supermarket are available; restaurant and auto repair remain clearly marked early access.' },
      { title: 'Active update channel', description: 'Desktop releases use a controlled application update path after release approval.' },
    ],
  },
};

const ar: Phase2Copy = {
  nav: { product: 'المنتج', productOverview: 'نظرة على المنتج', productTour: 'جولة إرشادية', contact: 'تواصل معنا', available: 'متاح', earlyAccess: 'وصول مبكر' },
  demo: {
    eyebrow: 'جولة إرشادية في المنتج', title: 'شاهد كيف تحوّل كل مساحة عمل المهام اليومية إلى سير عمل مترابط.',
    intro: 'استكشف واجهات مستندة إلى المنتج باستخدام بيانات تجريبية مصطنعة وثابتة. هذه جولة إرشادية وليست مساحة عميل حقيقية.',
    chooseIndustry: 'اختر مجال العمل', chooseView: 'اختر واجهة', guidedTour: 'تقدّم الجولة', syntheticLabel: 'بيانات تجريبية مصطنعة',
    syntheticNote: 'جميع الأسماء والسجلات والمعرّفات والمبالغ المعروضة خيالية ومحفوظة داخل حزمة التطبيق فقط.',
    next: 'الواجهة التالية', previous: 'الواجهة السابقة', step: 'الخطوة', of: 'من', requestCta: 'اطلب الوصول إلى هذا المسار',
    industries: { travel: 'وكالة سفر', supermarket: 'متجر وسوبرماركت', restaurant: 'مطعم', 'auto-repair': 'ورشة سيارات' },
    status: { available: 'متاح', 'early-access': 'وصول مبكر' },
    screens: {
      'travel-dashboard': { label: 'لوحة التحكم', title: 'ابدأ بالصورة التشغيلية والمالية.', description: 'تابع الرحلات النشطة والتحصيل والأرصدة المفتوحة وما يحتاج إلى متابعة من واجهة واحدة.' },
      'travel-trips': { label: 'الرحلات', title: 'اربط كل رحلة بالعميل والبرنامج.', description: 'راجع التواريخ والمسافرين والحالة والقيمة والخطوة التالية من دون التنقل بين أدوات مختلفة.' },
      'travel-payments': { label: 'سلامة التحصيل', title: 'اعرف الأرصدة التي تحتاج إلى متابعة.', description: 'تفصل الواجهة بين المبالغ المحصّلة والمجدولة والمتبقية.' },
      'travel-installments': { label: 'الأقساط', title: 'تابع الدفعات المجدولة بوضوح.', description: 'يعرض التسلسل الزمني تواريخ الاستحقاق وحالة كل دفعة للفريق.' },
      'travel-analytics': { label: 'التحليلات', title: 'حوّل سجلات الرحلات إلى مؤشرات مفيدة.', description: 'قارن الإيرادات والأرباح والوجهات وأنماط العملاء المتكررين.' },
      'supermarket-pos': { label: 'نقطة البيع', title: 'واجهة دفع مركّزة وسريعة للعمل اليومي.', description: 'امسح المنتجات أو ابحث عنها، راجع السلة، وجهّز الإيصال من شاشة واحدة.' },
      'supermarket-sales': { label: 'سجل المبيعات', title: 'راجع المبيعات المكتملة وإجماليات اليوم.', description: 'اعثر على الإيصالات وطرق الدفع والضريبة وإجماليات الوردية داخل مساحة المتجر.' },
      'restaurant-floor': { label: 'مخطط الصالة', title: 'اعرف حالة الطاولات قبل فتح الطلب.', description: 'واجهة وصول مبكر تميّز الطاولات المتاحة والمشغولة والمحجوزة بوضوح.' },
      'restaurant-kds': { label: 'شاشة المطبخ', title: 'حرّك الطلبات خلال مراحل المطبخ.', description: 'تجمع شاشة المطبخ في الوصول المبكر التذاكر حسب مرحلة التحضير والوقت المنقضي.' },
      'auto-repair-order': { label: 'أمر العمل', title: 'اربط استقبال المركبة والعمل والقطع والحالة.', description: 'يمنح أمر العمل في الوصول المبكر الفريق سجلًا مشتركًا من التشخيص حتى التسليم.' },
    },
    ui: { ...en.demo.ui, overview: 'نظرة عامة على مساحة العمل', activeTrips: 'الرحلات النشطة', collected: 'المحصّل', outstanding: 'الرصيد المتبقي', profit: 'الربح التقديري', attention: 'يتطلب متابعة', recentTrips: 'أحدث الرحلات', customer: 'العميل', destination: 'الوجهة', status: 'الحالة', amount: 'المبلغ', confirmed: 'مؤكدة', planning: 'قيد التخطيط', followUp: 'متابعة', paid: 'مدفوع', partial: 'جزئي', due: 'مستحق', scheduled: 'مجدول', travelers: 'المسافرون', departure: 'المغادرة', paymentHealth: 'سلامة التحصيل', installments: 'جدول الأقساط', revenueTrend: 'اتجاه الإيرادات والأرباح', destinationMix: 'توزيع الوجهات', revenue: 'الإيرادات', scanPrompt: 'امسح الباركود أو ابحث عن منتج', basket: 'السلة الحالية', items: 'عناصر', qty: 'الكمية', total: 'الإجمالي', cash: 'نقدًا', card: 'بطاقة', receipt: 'إيصال', salesHistory: 'سجل المبيعات', transactions: 'المعاملات', averageBasket: 'متوسط السلة', vat: 'الضريبة', completed: 'مكتملة', floorPlan: 'الصالة الرئيسية', available: 'متاحة', seated: 'مشغولة', reserved: 'محجوزة', table: 'طاولة', guests: 'ضيوف', kitchen: 'شاشة المطبخ', newOrders: 'جديد', preparing: 'قيد التحضير', ready: 'جاهز', minutes: 'د', workOrder: 'أمر عمل', vehicle: 'المركبة', owner: 'المالك', diagnosis: 'التشخيص', labor: 'العمل', parts: 'القطع', inProgress: 'قيد التنفيذ' },
  },
  lead: {
    steps: ['النشاط', 'التواصل', 'التأكيد'], businessStepTitle: 'ما مساحة العمل التي تحتاج إليها؟', businessStepDescription: 'اختر المسار الأقرب إلى عملك وحدد سبب تواصلك معنا.', detailsStepTitle: 'كيف نتواصل مع الشخص المناسب؟', detailsStepDescription: 'نطلب فقط المعلومات اللازمة لفهم الطلب ومتابعته.', confirmStepTitle: 'راجع الطلب قبل فتح تطبيق البريد.', confirmStepDescription: 'لا يخزّن الموقع أي بيانات. سنجهّز رسالة لتراجعها وترسلها بنفسك.',
    businessType: 'نوع النشاط', businessTypes: { 'travel-agency': 'وكالة سفر', supermarket: 'متجر أو سوبرماركت', restaurant: 'مطعم', 'auto-repair': 'ورشة سيارات', other: 'نشاط آخر' },
    intent: 'أرغب في', intents: { trial: 'طلب تجربة', demo: 'حجز عرض إرشادي', sales: 'التحدث مع المبيعات', support: 'التواصل مع الدعم' }, name: 'الاسم', businessName: 'اسم النشاط', email: 'بريد العمل', phone: 'الهاتف', phoneOptional: 'اختياري', country: 'الدولة', teamSize: 'حجم الفريق', teamSizes: { '1': 'أنا فقط', '2-5': '2–5 أشخاص', '6-20': '6–20 شخصًا', '21-50': '21–50 شخصًا', '51+': '51 شخصًا فأكثر' }, message: 'ما الذي ينبغي أن نعرفه؟', messageOptional: 'اختياري — سير العمل أو التوقيت أو نقل البيانات', continue: 'متابعة', back: 'رجوع', review: 'مراجعة الطلب', send: 'فتح الرسالة الجاهزة', sending: 'جارٍ تجهيز الرسالة…', required: 'هذا الحقل مطلوب.', invalidEmail: 'أدخل بريدًا إلكترونيًا صحيحًا.', correctErrors: 'راجع الحقول المحددة قبل المتابعة.', truthfulDelivery: 'هذا الموقع لا يرسل النموذج ولا يخزّنه. في الخطوة الأخيرة تُفتح رسالة جاهزة في تطبيق بريدك.', privacyNote: 'لا تُدخل كلمات مرور أو بيانات بطاقات دفع أو سجلات عملاء.', successTitle: 'الرسالة الجاهزة أصبحت متاحة.', successDescription: 'يُفترض أن تطبيق البريد قد فُتح الآن. راجع الرسالة واضغط إرسال هناك لإكمال الطلب.', successNext: ['راجع التفاصيل المجهّزة', 'أرسل الرسالة من حساب بريدك', 'احتفظ بالرسالة المرسلة كسجل لطلبك'], notStored: 'لم يُنشأ أو يُخزّن أي سجل طلب في هذا الموقع.', edit: 'تعديل البيانات', startOver: 'بدء طلب جديد',
  },
  pricing: { ...en.pricing, matrixEyebrow: 'مصفوفة القدرات', matrixTitle: 'أساس واضح للخطط المستقبلية من دون أسعار أو حدود مختلقة.', matrixIntro: 'يتوفر MyDesck PRO حاليًا عبر تفعيل بمساعدة الفريق، ويتم تأكيد المسارات المتاحة قبل تجهيز الوصول.', capability: 'المجال', details: 'القدرة', availability: 'الوضع الحالي', notes: 'النطاق', included: 'ضمن المنتج الأساسي', varies: 'يختلف حسب نوع النشاط', assisted: 'بمساعدة الفريق', rows: [
    { area: 'المنصة الأساسية', capability: 'مساحة العمل والمستخدمون وإعدادات النشاط', availability: 'ضمن المنتج الأساسي', notes: 'تُضبط خلال الإعداد بمساعدة الفريق.' },
    { area: 'اللغات', capability: 'العربية والإنجليزية والعبرية واتجاه RTL', availability: 'ضمن المنتج الأساسي', notes: 'يدعم الموقع والمنتج اللغات الثلاث.' },
    { area: 'سطح المكتب والويب', capability: 'الوصول عبر الويب وتطبيق Windows', availability: 'ضمن المنتج الأساسي', notes: 'يتطلب حسابًا مفعّلًا.' },
    { area: 'مسارات العمل', capability: 'أدوات تشغيل متخصصة حسب المجال', availability: 'يختلف حسب نوع النشاط', notes: 'السفر والمتاجر متاحان؛ المطاعم والورش في وصول مبكر.' },
    { area: 'المتابعة المالية', capability: 'الإيرادات والتكاليف والتحصيل والأرصدة والأقساط', availability: 'يختلف حسب نوع النشاط', notes: 'يسجّل النشاط المالي ولا يعالج مدفوعات البطاقات.' },
    { area: 'التقارير', capability: 'ملخصات تشغيلية وتحليلات', availability: 'يختلف حسب نوع النشاط', notes: 'تعكس الواجهات البيانات المتاحة في كل مسار.' },
    { area: 'المستندات', capability: 'الإيصالات وPDF والتصدير', availability: 'يختلف حسب نوع النشاط', notes: 'تختلف أنواع المستندات باختلاف المجال.' },
    { area: 'الدعم', capability: 'مساعدة في التفعيل وسير العمل', availability: 'بمساعدة الفريق', notes: 'يُتفق على نطاق الدعم عند التفعيل.' },
  ] },
  trust: { ...en.trust, eyebrow: 'أدلة من المنتج', title: 'ثقة مبنية على ما يقدمه المنتج فعلًا.', intro: 'لا أرقام عملاء أو شعارات أو شهادات مختلقة؛ فقط قدرات قابلة للتحقق ونطاق واضح.', items: [
    { title: 'ثلاث لغات فعلية', description: 'العربية والإنجليزية والعبرية، مع تخطيطات RTL حيث يلزم.' },
    { title: 'الويب وWindows', description: 'مساحة عمل على الويب ومسار إصدار مُدار لتطبيق Windows.' },
    { title: 'مساحات خاصة وموثّقة', description: 'Firebase Authentication وصلاحيات واعية بالنشاط وملفات أعمال خاصة.' },
    { title: 'قابلية نقل البيانات', description: 'تتوفر المستندات والتصدير حيث يدعمها كل مسار عمل.' },
    { title: 'مسارات متخصصة', description: 'السفر والمتاجر متاحان، بينما المطاعم والورش محددان بوضوح كوصول مبكر.' },
    { title: 'قناة تحديث نشطة', description: 'تصل إصدارات سطح المكتب عبر مسار تحديث مضبوط بعد اعتماد الإصدار.' },
  ] },
};

const he: Phase2Copy = {
  nav: { product: 'מוצר', productOverview: 'סקירת המוצר', productTour: 'הדגמה מודרכת', contact: 'יצירת קשר', available: 'זמין', earlyAccess: 'גישה מוקדמת' },
  demo: {
    eyebrow: 'סיור מודרך במוצר', title: 'ראו כיצד כל סביבת עבודה מחברת את הפעילות היומיומית לתהליך אחד.',
    intro: 'גלו תצוגות המבוססות על המוצר עם נתוני הדגמה סינתטיים וקבועים. זהו סיור מודרך, לא סביבת לקוח חיה.',
    chooseIndustry: 'בחירת תחום', chooseView: 'בחירת תצוגה', guidedTour: 'התקדמות בסיור', syntheticLabel: 'נתוני הדגמה סינתטיים',
    syntheticNote: 'כל השמות, הרשומות, המזהים והסכומים המוצגים הם בדיוניים ונמצאים רק בחבילת היישום.',
    next: 'התצוגה הבאה', previous: 'התצוגה הקודמת', step: 'שלב', of: 'מתוך', requestCta: 'בקשת גישה לתהליך הזה',
    industries: { travel: 'סוכנות נסיעות', supermarket: 'סופרמרקט', restaurant: 'מסעדה', 'auto-repair': 'מוסך' },
    status: { available: 'זמין', 'early-access': 'גישה מוקדמת' },
    screens: {
      'travel-dashboard': { label: 'לוח בקרה', title: 'מתחילים בתמונה התפעולית והכספית.', description: 'רואים נסיעות פעילות, גבייה, יתרות פתוחות ונושאים לטיפול במקום אחד.' },
      'travel-trips': { label: 'נסיעות', title: 'כל נסיעה מחוברת ללקוח ולמסלול.', description: 'בודקים תאריכים, נוסעים, מצב, שווי והפעולה הבאה בלי לעבור בין כלים.' },
      'travel-payments': { label: 'מצב תשלומים', title: 'מזהים יתרות שדורשות מעקב.', description: 'התצוגה מפרידה בין סכומים שנגבו, תשלומים מתוזמנים ויתרות פתוחות.' },
      'travel-installments': { label: 'תשלומים', title: 'עוקבים בבירור אחר תשלומים מתוזמנים.', description: 'ציר זמן מציג לצוות תאריכי יעד ואת מצב כל תשלום.' },
      'travel-analytics': { label: 'ניתוחים', title: 'הופכים רשומות נסיעה לאותות שימושיים.', description: 'משווים הכנסות ורווח, יעדים ודפוסי לקוחות חוזרים.' },
      'supermarket-pos': { label: 'קופה', title: 'תהליך קופה ממוקד לעבודה קמעונאית מהירה.', description: 'סורקים או מחפשים מוצרים, בודקים את הסל ומכינים קבלה מתצוגה אחת.' },
      'supermarket-sales': { label: 'היסטוריית מכירות', title: 'בודקים מכירות שהושלמו וסיכומי יום.', description: 'מאתרים קבלות, אמצעי תשלום, מע״מ וסיכומי משמרת בסביבת הסופרמרקט.' },
      'restaurant-floor': { label: 'תוכנית אולם', title: 'רואים את מצב השולחנות לפני פתיחת הזמנה.', description: 'תצוגת גישה מוקדמת מבדילה בבירור בין שולחנות פנויים, תפוסים ושמורים.' },
      'restaurant-kds': { label: 'תצוגת מטבח', title: 'מעבירים הזמנות בשלבי עבודת המטבח.', description: 'KDS בגישה מוקדמת מקבץ כרטיסים לפי שלב הכנה וזמן שחלף.' },
      'auto-repair-order': { label: 'כרטיס עבודה', title: 'מחברים קליטת רכב, עבודה, חלקים וסטטוס.', description: 'כרטיס עבודה בגישה מוקדמת נותן לצוות רשומה משותפת מאבחון ועד מסירה.' },
    },
    ui: { ...en.demo.ui, overview: 'סקירת סביבת העבודה', activeTrips: 'נסיעות פעילות', collected: 'נגבה', outstanding: 'יתרה פתוחה', profit: 'רווח משוער', attention: 'דורש טיפול', recentTrips: 'נסיעות אחרונות', customer: 'לקוח', destination: 'יעד', status: 'סטטוס', amount: 'סכום', confirmed: 'מאושר', planning: 'בתכנון', followUp: 'מעקב', paid: 'שולם', partial: 'חלקי', due: 'לתשלום', scheduled: 'מתוזמן', travelers: 'נוסעים', departure: 'יציאה', paymentHealth: 'מצב תשלומים', installments: 'לוח תשלומים', revenueTrend: 'מגמת הכנסות ורווח', destinationMix: 'חלוקת יעדים', revenue: 'הכנסות', scanPrompt: 'סריקת ברקוד או חיפוש מוצר', basket: 'סל נוכחי', items: 'פריטים', qty: 'כמות', total: 'סה״כ', cash: 'מזומן', card: 'כרטיס', receipt: 'קבלה', salesHistory: 'היסטוריית מכירות', transactions: 'עסקאות', averageBasket: 'סל ממוצע', vat: 'מע״מ', completed: 'הושלמה', floorPlan: 'אולם ראשי', available: 'פנוי', seated: 'תפוס', reserved: 'שמור', table: 'שולחן', guests: 'אורחים', kitchen: 'תצוגת מטבח', newOrders: 'חדש', preparing: 'בהכנה', ready: 'מוכן', minutes: 'דק׳', workOrder: 'כרטיס עבודה', vehicle: 'רכב', owner: 'בעלים', diagnosis: 'אבחון', labor: 'עבודה', parts: 'חלקים', inProgress: 'בטיפול' },
  },
  lead: {
    steps: ['עסק', 'יצירת קשר', 'אישור'], businessStepTitle: 'איזו סביבת עבודה נדרשת?', businessStepDescription: 'בחרו את התהליך הקרוב ביותר לעסק ואת מטרת הפנייה.', detailsStepTitle: 'איך נוכל להגיע לאדם המתאים?', detailsStepDescription: 'אנחנו מבקשים רק מידע שנחוץ להבנת הבקשה ולחזרה אליכם.', confirmStepTitle: 'בדיקה לפני פתיחת יישום הדוא״ל.', confirmStepDescription: 'האתר לא שומר מידע. נכין הודעה שתוכלו לבדוק ולשלוח בעצמכם.',
    businessType: 'סוג העסק', businessTypes: { 'travel-agency': 'סוכנות נסיעות', supermarket: 'סופרמרקט', restaurant: 'מסעדה', 'auto-repair': 'מוסך', other: 'עסק אחר' }, intent: 'אני רוצה', intents: { trial: 'לבקש ניסיון', demo: 'לקבוע הדגמה מודרכת', sales: 'לדבר עם מכירות', support: 'לפנות לתמיכה' }, name: 'שם מלא', businessName: 'שם העסק', email: 'דוא״ל עסקי', phone: 'טלפון', phoneOptional: 'אופציונלי', country: 'מדינה', teamSize: 'גודל הצוות', teamSizes: { '1': 'רק אני', '2-5': '2–5 אנשים', '6-20': '6–20 אנשים', '21-50': '21–50 אנשים', '51+': '51+ אנשים' }, message: 'מה חשוב שנדע?', messageOptional: 'אופציונלי — תהליך, לוחות זמנים או צורך בייבוא', continue: 'המשך', back: 'חזרה', review: 'בדיקת הבקשה', send: 'פתיחת דוא״ל מוכן', sending: 'מכין הודעה…', required: 'זהו שדה חובה.', invalidEmail: 'יש להזין כתובת דוא״ל תקינה.', correctErrors: 'יש לבדוק את השדות המסומנים לפני ההמשך.', truthfulDelivery: 'האתר אינו שולח או שומר את הטופס. בשלב האחרון נפתחת הודעה מוכנה ביישום הדוא״ל שלכם.', privacyNote: 'אין לכלול סיסמאות, פרטי כרטיסי תשלום או רשומות לקוחות.', successTitle: 'ההודעה המוכנה זמינה.', successDescription: 'יישום הדוא״ל אמור להיות פתוח כעת. בדקו את ההודעה ובחרו שליחה כדי להשלים את הבקשה.', successNext: ['בדיקת הפרטים שהוכנו', 'שליחת ההודעה מחשבון הדוא״ל', 'שמירת ההודעה שנשלחה כתיעוד'], notStored: 'האתר לא יצר ולא שמר רשומת ליד.', edit: 'עריכת פרטים', startOver: 'פתיחת בקשה חדשה',
  },
  pricing: { ...en.pricing, matrixEyebrow: 'מטריצת יכולות', matrixTitle: 'בסיס ברור לתוכניות עתידיות — בלי מחירים או מגבלות מומצאים.', matrixIntro: 'MyDesck PRO מוצע כעת בהפעלה מלווה. זמינות התהליכים המדויקת מאושרת לפני הכנת הגישה.', capability: 'תחום', details: 'יכולת', availability: 'מצב נוכחי', notes: 'היקף', included: 'מוצר ליבה', varies: 'משתנה לפי סוג העסק', assisted: 'בליווי', rows: [
    { area: 'פלטפורמת ליבה', capability: 'סביבת עבודה, משתמשים והגדרות עסק', availability: 'מוצר ליבה', notes: 'מוגדר במהלך הצטרפות מלווה.' },
    { area: 'שפות', capability: 'עברית, ערבית, אנגלית ותמיכת RTL', availability: 'מוצר ליבה', notes: 'האתר והמוצר תומכים בשלוש השפות.' },
    { area: 'מחשב ואינטרנט', capability: 'גישה מהדפדפן ויישום Windows', availability: 'מוצר ליבה', notes: 'הגישה תלויה בהפעלת החשבון.' },
    { area: 'תהליכים עסקיים', capability: 'כלים תפעוליים ייעודיים לפי תחום', availability: 'משתנה לפי סוג העסק', notes: 'נסיעות וסופרמרקט זמינים; מסעדה ומוסך בגישה מוקדמת.' },
    { area: 'מעקב כספי', capability: 'הכנסות, עלויות, גבייה, יתרות ותשלומים', availability: 'משתנה לפי סוג העסק', notes: 'מעקב אחר פעילות עסקית; אין עיבוד תשלומי כרטיס.' },
    { area: 'דוחות', capability: 'סיכומים תפעוליים וניתוחים', availability: 'משתנה לפי סוג העסק', notes: 'התצוגות משקפות מידע שמיושם בכל תהליך.' },
    { area: 'מסמכים', capability: 'קבלות, PDF ותהליכי יצוא', availability: 'משתנה לפי סוג העסק', notes: 'סוגי המסמכים תלויים בתחום.' },
    { area: 'תמיכה', capability: 'הפעלה והכוונה בתהליך', availability: 'בליווי', notes: 'היקף התמיכה מוסכם במהלך ההפעלה.' },
  ] },
  trust: { ...en.trust, eyebrow: 'ראיות מהמוצר', title: 'אמון שנבנה ממה שהמוצר באמת עושה.', intro: 'בלי מספרי לקוחות, סמלים או המלצות מומצאים — רק יכולות ניתנות לאימות והיקף ברור.', items: [
    { title: 'שלוש שפות פעילות', description: 'עברית, ערבית ואנגלית, כולל פריסות מימין לשמאל.' },
    { title: 'אינטרנט ו-Windows', description: 'סביבת עבודה בדפדפן וערוץ הפצה מתוחזק ל-Windows.' },
    { title: 'סביבות פרטיות ומאומתות', description: 'Firebase Authentication, הרשאות מודעות לעסק ונכסים עסקיים פרטיים.' },
    { title: 'ניידות תפעולית', description: 'מסמכים ותהליכי יצוא זמינים במקום שבו כל תהליך עסקי תומך בהם.' },
    { title: 'תהליכים ייעודיים', description: 'נסיעות וסופרמרקט זמינים; מסעדה ומוסך מסומנים בבירור כגישה מוקדמת.' },
    { title: 'ערוץ עדכונים פעיל', description: 'גרסאות מחשב משתמשות בנתיב עדכון מבוקר לאחר אישור גרסה.' },
  ] },
};

export const phase2Content: Record<MarketingLocale, Phase2Copy> = { en, ar, he };
