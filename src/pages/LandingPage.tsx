
import { useTheme } from '../contexts/ThemeContext';
import { useLanguage } from '../contexts/LanguageContext';
import { AnimatePresence, motion } from 'framer-motion';
import { Download, CheckCircle, Globe, Mail, LayoutDashboard, FileText, BadgeDollarSign, Sun, Moon, TrendingUp, Receipt, PieChart, ChevronDown, Command, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import SEO from '../components/SEO';

const LandingPage = () => {
  const { language, setLanguage, direction } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

  // Force Light Mode on mount REMOVED to support toggling
  // useEffect(() => {
  //   setTheme('light');
  // }, [setTheme]);

  const translations = {
    en: {
      heroTitle: "Say Goodbye to Receipt Books",
      heroSubtitle: "Smart accounting system",
      login: "Login",
      download: "Download Windows App",
      downloadMac: "Download for MacBook",
      appDesc: "Experience the ultimate control over your business finances. MyDesck PRO offers a seamless blend of power and simplicity, designed to help you grow with confidence.",
      featuresTitle: "Why MyDesck PRO?",
      features: [
        { title: "Dashboard/Profits", icon: LayoutDashboard },
        { title: "Accountant Export", icon: FileText },
        { title: "3 Months Free Trial then $20/mo", icon: BadgeDollarSign }
      ],
      customizationTitle: "Get Started & Customization",
      customizationText: "To register for a new account, please contact us with your business type. Ready for Tourism, customizable for Supermarkets/others.",
      footer: "© {year} MyDesck PRO. All rights reserved."
    },
    he: {
      heroTitle: "היפרדו לשלום מפנקסי הקבלות",
      heroSubtitle: "מערכת הנהלת חשבונות חכמה",
      login: "התחברות",
      download: "הורד לווינדוס",
      downloadMac: "הורד למקבוק",
      appDesc: "חוו את השליטה האולטימטיבית בכספים של העסק שלכם. MyDesck PRO מציעה שילוב מושלם של עוצמה ופשטות, שנועד לעזור לכם לצמוח בביטחון.",
      featuresTitle: "היתרון העסקי שלך עם MyDesck PRO",
      features: [
        { title: "שליטה פיננסית וניתוח רווחים", icon: LayoutDashboard },
        { title: "סנכרון מלא ואוטומטי לרואה חשבון", icon: FileText },
        { title: "3 חודשי ניסיון חינם, ואז $20/חודש בלבד", icon: BadgeDollarSign }
      ],
      customizationTitle: "הצטרפות והתאמה אישית",
      customizationText: "להרשמה ופתיחת חשבון, אנא צרו קשר וציינו את סוג העסק. הפלטפורמה מוכנה לתיירות וניתנת להתאמה לסופרמרקטים ועסקים נוספים.",
      footer: "© {year} MyDesck PRO. כל הזכויות שמורות."
    },
    ar: {
      heroTitle: "قل وداعاً لدفاتر الإيصالات",
      heroSubtitle: "نظام محاسبة ذكي",
      login: "تسجيل الدخول",
      download: "تحميل لنظام ويندوز",
      downloadMac: "تحميل للماك",
      appDesc: "استمتع بالتحكم المطلق في أموال عملك. يقدم MyDesck PRO مزيجاً سلساً من القوة والبساطة، صُمم ليساعدك على النمو بثقة.",
      featuresTitle: "لماذا MyDesck PRO؟",
      features: [
        { title: "لوحة التحكم والأرباح", icon: LayoutDashboard },
        { title: "تصدير للمحاسب", icon: FileText },
        { title: "3 أشهر مجاناً ثم $20/شهر", icon: BadgeDollarSign }
      ],
      customizationTitle: "التسجيل والتخصيص",
      customizationText: "للتسجيل وفتح حساب، يرجى التواصل معنا وتحديد نوع النشاط. المنصة جاهزة للسياحة وقابلة للتخصيص للمتاجر والأنشطة الأخرى.",
      footer: "© {year} MyDesck PRO. جميع الحقوق محفوظة."
    }
  };

  /* Rename to localT to avoid conflict with i18n t hook */
  const localT = translations[language as keyof typeof translations] || translations.en;
  const { t } = useLanguage();

  // Animation variants
  const fadeIn = {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.6 }
  };

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "name": "MyDesck PRO",
    "applicationCategory": "BusinessApplication",
    "operatingSystem": "Windows 10, Windows 11",
    "description": "نظام محاسبة ومبيعات متكامل لإدارة جميع أنواع الأنشطة التجارية والشركات",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.9",
      "ratingCount": "200"
    },
    "offers": {
      "@type": "Offer",
      "price": "20.00",
      "priceCurrency": "USD"
    }
  };

  return (
    <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-x-hidden ${direction === 'rtl' ? 'rtl' : 'ltr'}`} dir={direction}>
      <SEO 
        title={t('heroTitle')}
        description={t('heroSubtitle')}
        structuredData={structuredData}
      />
      <Toaster position="top-center" richColors />
      {/* Navbar */}
      <nav className="fixed w-full bg-white/80 dark:bg-slate-950/80 backdrop-blur-md shadow-sm dark:shadow-slate-900/50 z-50 border-b border-transparent dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2 rtl:space-x-reverse">
             <img 
               src="/favicon.ico" 
               alt="MyDesck PRO" 
               className="w-8 h-8 rounded-full object-contain shadow-blue-500/20 shadow-lg bg-white"
             />
             <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-cyan-500 bg-clip-text text-transparent dark:from-blue-400 dark:to-cyan-300">
               MyDesck PRO
             </span>
          </div>
          
          <div className="flex gap-2 items-center">
            <button
              onClick={() => navigate('/login')}
              className="px-4 py-1.5 rounded-full text-sm font-bold bg-slate-900 text-white hover:bg-slate-800 transition-colors shadow-lg shadow-slate-900/10"
            >
              {localT.login}
            </button>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            
            <button
              onClick={toggleTheme}
              className="p-2 rounded-full text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
              title="Toggle Theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Language Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsLanguageOpen(!isLanguageOpen)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
              >
                <Globe className="w-4 h-4" />
                <span>{language.toUpperCase()}</span>
                <ChevronDown className={`w-3 h-3 transition-transform ${isLanguageOpen ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {isLanguageOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    transition={{ duration: 0.2 }}
                    className="absolute top-full mt-2 right-0 min-w-[120px] bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 overflow-hidden z-[60]"
                  >
                    <div className="p-1 flex flex-col gap-0.5">
                      {(['en', 'he', 'ar'] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => {
                            setLanguage(lang);
                            setIsLanguageOpen(false);
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full ${
                            language === lang 
                              ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400' 
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                          }`}
                        >
                          <span className="w-4 text-center">{lang === 'en' ? '🇺🇸' : lang === 'he' ? '🇮🇱' : '🇸🇦'}</span>
                          <span>{lang === 'en' ? 'English' : lang === 'he' ? 'עברית' : 'العربية'}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <motion.div 
          initial="initial"
          animate="animate"
          variants={fadeIn}
          className="space-y-8"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium border border-blue-100 dark:border-blue-800/50">
            <CheckCircle className="w-4 h-4" />
            <span>V 0.0.33 Available Now</span>
          </div>

          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-6 rtl:leading-tight">
            {localT.heroTitle}
          </h1>
          
          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10">
            {localT.heroSubtitle}
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href="https://github.com/Aseel-V/MyDesck-PRO-Releases/releases/latest/download/MyDesck-PRO-Setup.exe"
              className="inline-flex items-center gap-3 px-8 py-4 bg-blue-600 text-white rounded-xl font-bold text-lg shadow-lg hover:bg-blue-700 transition-all hover:shadow-blue-500/25"
            >
              <Download className="w-6 h-6" />
              {localT.download}
            </motion.a>

            <motion.a
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              href="#" /* Placeholder for Mac download */
              className="inline-flex items-center gap-3 px-8 py-4 bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-xl font-bold text-lg shadow-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
            >
              <Command className="w-6 h-6" />
              {localT.downloadMac}
            </motion.a>
          </div>

          <motion.p 
             initial={{ opacity: 0 }}
             animate={{ opacity: 1 }}
             transition={{ delay: 0.4 }}
             className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-3xl mx-auto mt-12 leading-relaxed"
          >
            {localT.appDesc}
          </motion.p>

          <div className="pt-12">
            <img 
               src="dashboard.png" 
               alt="Dashboard Preview" 
               className="rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 mx-auto w-full max-w-5xl bg-slate-200 dark:bg-slate-800 aspect-video object-cover"
               onError={(e) => { e.currentTarget.style.display = 'none' }} // Hide if no image
            />
            {/* Fallback visual if image fails or generic placeholder */}
            <div className="hidden rounded-2xl shadow-2xl border border-slate-200 mx-auto w-full max-w-5xl bg-gradient-to-b from-slate-100 to-white aspect-[16/9] flex items-center justify-center text-slate-400">
               <span className="text-lg">Dashboard Preview UI</span>
            </div>
          </div>
        </motion.div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <h2 className="text-3xl font-bold text-center mb-16 dark:text-white">{localT.featuresTitle}</h2>
           
           <div className="grid md:grid-cols-3 gap-8">
             {localT.features.map((feature, idx) => (
               <motion.div
                 key={idx}
                 whileHover={{ y: -5 }}
                 className="p-8 rounded-2xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 hover:shadow-lg transition-all"
               >
                 <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-6">
                   <feature.icon className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{feature.title}</h3>
                 <p className="text-slate-500 dark:text-slate-400">
                   {/* Description placeholder if needed */}
                 </p>
               </motion.div>
             ))}
           </div>
        </div>
      </section>

      {/* NEW: Universal Features Section */}
      <section className="py-20 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="text-center mb-16">
             <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">{t('seoFeatures.title')}</h2>
             <div className="w-20 h-1 bg-blue-600 mx-auto rounded-full"></div>
           </div>
           
           <div className="grid md:grid-cols-3 gap-8">
             {/* Sales */}
             <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center mb-6">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('seoFeatures.sales.title')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('seoFeatures.sales.desc')}
                </p>
             </div>

             {/* Invoices */}
             <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mb-6">
                  <Receipt className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('seoFeatures.invoices.title')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('seoFeatures.invoices.desc')}
                </p>
             </div>

             {/* Reports */}
             <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl flex items-center justify-center mb-6">
                  <PieChart className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('seoFeatures.reports.title')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  {t('seoFeatures.reports.desc')}
                </p>
             </div>
           </div>
        </div>
      </section>

      {/* Customization Section */}
      <section className="py-20 bg-blue-600 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <div className="flex justify-center gap-4 mb-6">
            <Globe className="w-12 h-12 text-blue-200" />
            <UserPlus className="w-12 h-12 text-blue-200" />
          </div>
          <h2 className="text-3xl font-bold mb-6">{localT.customizationTitle}</h2>
          <p className="text-xl md:text-2xl font-medium leading-relaxed opacity-90 mb-8">
            {localT.customizationText}
          </p>
          <a 
            href="mailto:aseelshaheen621@gmail.com"
            onClick={() => {
               // Optional: prevent default if you ONLY want copy, but keeping default allows mail app to open too if available.
               // e.preventDefault(); 
               navigator.clipboard.writeText('aseelshaheen621@gmail.com');
               toast.success('Email copied to clipboard!');
            }}
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-lg font-bold hover:bg-blue-50 transition-colors cursor-pointer shadow-lg shadow-blue-900/20"
          >
            <Mail className="w-5 h-5" />
            aseelshaheen621@gmail.com
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 dark:bg-black text-slate-400 py-12 text-center text-sm border-t border-slate-800">
        <p>{localT.footer.replace('{year}', new Date().getFullYear().toString())}</p>
      </footer>
    </div>
  );
};

export default LandingPage;
