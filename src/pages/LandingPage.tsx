
import { useLanguage } from '../contexts/LanguageContext';
import { motion } from 'framer-motion';
import { CheckCircle, Globe, Mail, LayoutDashboard, FileText, BadgeDollarSign, TrendingUp, Receipt, PieChart, UserPlus, ShoppingCart, Bus, Utensils, Hammer, Monitor, Laptop } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Toaster, toast } from 'sonner';
import SEO from '../components/SEO';
import { DownloadModal } from '../components/DownloadModal';
import { useGitHubRelease } from '../hooks/useGitHubRelease';
import FloatingHeader from '../components/FloatingHeader';
import LanguageAnimationWrapper from '../components/LanguageAnimationWrapper';

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

// --- Dynamic Spotlight Card ---
interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
  onClick?: () => void;
}

const SpotlightCard = ({ children, className = "", spotlightColor = "rgba(99, 102, 241, 0.15)", onClick }: SpotlightCardProps) => {
  return (
    <motion.div
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className={`relative overflow-hidden rounded-[2.5rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl hover:shadow-2xl transition-all duration-300 group ${className} ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-0 group-hover:opacity-100 transition duration-500 z-0"
        style={{
          background: `radial-gradient(600px circle at center, ${spotlightColor}, transparent 40%)`,
        }}
      />
      <div className="relative z-10 h-full">
        {children}
      </div>
    </motion.div>
  );
};
// ============================================================================

interface IndustryGridCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  features: string[];
  color: string;
  onClick: () => void;
}

const IndustryGridCard = ({ icon: Icon, title, description, features, color, onClick }: IndustryGridCardProps) => {
  const colorMap: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400"
  };

  const spotlightMap: Record<string, string> = {
    emerald: "rgba(16, 185, 129, 0.15)",
    blue: "rgba(59, 130, 246, 0.15)",
    orange: "rgba(249, 115, 22, 0.15)"
  };

  return (
    <SpotlightCard onClick={onClick} className="p-8 flex flex-col h-full" spotlightColor={spotlightMap[color]}>
       <div className={`w-14 h-14 ${colorMap[color]} rounded-2xl flex items-center justify-center mb-8 transform group-hover:scale-110 group-hover:rotate-3 transition-all duration-500`}>
          <Icon size={28} strokeWidth={2.5} />
       </div>
       
       <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4 tracking-tight group-hover:text-slate-700 dark:group-hover:text-slate-200 transition-colors">
         {title}
       </h3>
       
       <p className="text-slate-600 dark:text-slate-400 leading-relaxed mb-8 flex-1 font-medium">
         {description}
       </p>
       
       <div className="space-y-3 pt-6 border-t border-slate-100 dark:border-slate-800">
          {(features || []).map((feat: string, i: number) => (
            <div key={i} className="flex items-center gap-3">
               <div className="w-5 h-5 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center">
                  <CheckCircle className="w-3 h-3 text-slate-400" />
               </div>
               <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{feat}</span>
            </div>
          ))}
       </div>
    </SpotlightCard>
  );
};

const LandingPage = () => {
  const { language, direction } = useLanguage();
// Theme hook removed
  const navigate = useNavigate();
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  
  // Fetch latest release
  const { data: releaseData } = useGitHubRelease();
  const windowsAsset = releaseData?.assets.find(a => a.name.endsWith('.exe'))?.browser_download_url;
  const macAsset = releaseData?.assets.find(a => a.name.endsWith('.dmg'))?.browser_download_url;
  const versionTag = releaseData?.tag_name;

  const translations = {
    en: {
      heroTitle: "Say Goodbye to Receipt Books",
      heroSubtitle: "Smart accounting system",
      login: "Login",
      download: "Download Windows App",
      downloadMac: "Download for MacBook",
      appDesc: "Experience the ultimate control over your business finances. MyDesck PRO offers a seamless blend of power and simplicity, designed to help you grow with confidence.",
      featuresTitle: "Why MyDesck PRO?",

      customizationTitle: "Get Started & Customization",
      customizationText: "To register for a new account, please contact us with your business type. The platform is fully ready for Tourism, Restaurants, and Supermarkets.",
      footer: "© {year} MyDesck PRO. All rights reserved.",
      safetySupport: "Safety & Support",
      hero: {
        download: 'Download Now',
        contact: 'Contact Sales',
        dashboard: 'Dashboard Interface',
        realtime: 'Real-time tracking and management'
      },
      features: {
        title: 'Everything you need to run your business'
      },
      benefits: [
        { title: "Dashboard/Profits: Track revenue & growth instantly", icon: LayoutDashboard },
        { title: "Accountant Export: One-click financial reports", icon: FileText },
        { title: "3 Months Free Trial then only $20/mo", icon: BadgeDollarSign }
      ],
      demo: {
        title: 'See it in action',
        description: 'Our interface is designed for speed and simplicity. Optimized for performance and ease of use.',
        list: {
          darkMode: 'Dark Mode support for night shifts',
          offline: 'Work offline (keeps working without internet)',
          multilang: 'Multi-language (Hebrew, Arabic, English)'
        },
        placeholder: 'Official Walkthrough Video - Coming Soon'
      },
      industries: {
        title: 'Industry Solutions',
        market: {
          title: 'Supermarket & Retail',
          description: 'The ultimate solution for retail management. Lightning-fast POS, smart inventory, and detailed profit analytics.',
          features: {
            scan: 'Barcode Scanning',
            inventory: 'Inventory Control',
            profit: 'Sales Analytics',
            receipts: 'Receipt Printing',
            admin: 'Centralized Admin'
          }
        },
        trip: {
          title: 'Tourism & Financials',
          description: 'Complete trip and cost management. Handle quotes, client data, and invoicing in one unified platform.',
          features: {
            trips: 'Trip Management',
            financials: 'Financial Tracking',
            quote: 'PDF Documents',
            clients: 'Client Directory'
          }
        },
        food: {
          title: 'Restaurants & Cafes',
          description: 'Streamline your dining operations with table management, kitchen display systems, and digital menus.',
          features: {
            tables: 'Visual Table Layout',
            kitchen: 'Kitchen Display System',
            menu: 'Menu Management',
            zreport: 'Daily Closing (Z-Report)'
          }
        },
        other: {
          title: 'Custom Solutions',
          description: 'Tailored solutions for Salons, Repair Shops, and other service-based businesses.',
          badge: 'Coming Soon'
        }
      }
    },
    he: {
      heroTitle: "היפרדו לשלום מפנקסי הקבלות",
      heroSubtitle: "מערכת הנהלת חשבונות חכמה",
      login: "התחברות",
      download: "הורד לווינדוס",
      downloadMac: "הורד למקבוק",
      appDesc: "חוו את השליטה האולטימטיבית בכספים של העסק שלכם. MyDesck PRO מציעה שילוב מושלם של עוצמה ופשטות, שנועד לעזור לכם לצמוח בביטחון.",
      featuresTitle: "היתרון העסקי שלך עם MyDesck PRO",

      customizationTitle: "הצטרפות והתאמה אישית",
      customizationText: "להרשמה ופתיחת חשבון, אנא צרו קשר וציינו את סוג העסק. הפלטפורמה מותאמת מלא לתיירות, מסעדות וסופרמרקטים.",
      footer: "© {year} MyDesck PRO. כל הזכויות שמורות.",
      safetySupport: "בטיחות ותמיכה",
      hero: {
        download: 'הורד עכשיו',
        contact: 'צור קשר',
        dashboard: 'ממשק הניהול',
        realtime: 'מעקב וניהול בזמן אמת'
      },
      features: {
        title: 'כל מה שצריך לניהול העסק'
      },
      benefits: [
        { title: "לוח בקרה ורווחים: מעקב אחר הכנסות וצמיחה", icon: LayoutDashboard },
        { title: "ייצוא לרואה חשבון: דו״חות כספיים בקליק", icon: FileText },
        { title: "3 חודשי ניסיון חינם, ואז $20/חודש בלבד", icon: BadgeDollarSign }
      ],
      demo: {
        title: 'ראה את המערכת בפעולה',
        description: 'הממשק שלנו תוכנן למהירות ופשטות. מותאם לביצועים וקלות שימוש.',
        list: {
          darkMode: 'תמיכה במצב כהה למשמרות לילה',
          offline: 'עבודה ללא אינטרנט (Offline Mode)',
          multilang: 'תמיכה מלאה בעברית, אנגלית וערבית'
        },
        placeholder: 'סרטון הדרכה רשמי - בקרוב'
      },
      industries: {
        title: 'פתרונות לפי תעשייה',
        market: {
          title: 'סופרמרקטים וקמעונאות',
          description: 'הפתרון המושלם לניהול קמעונאי. קופה מהירה, ניהול מלאי חכם, וניתוח רווחים מפורט.',
          features: {
             scan: 'סריקת ברקוד',
             inventory: 'ניהול מלאי',
             profit: 'ניתוח רווחים',
             receipts: 'הדפסת קבלות',
             admin: 'ניהול מרכזי'
          }
        },
        trip: {
          title: 'תיירות ופיננסים',
          description: 'ניהול מלא של טיולים ועלויות. טיפול בהצעות מחיר, נתוני לקוחות וחשבוניות בפלטפורמה אחת.',
          features: {
              trips: 'ניהול טיולים',
              financials: 'מעקב פיננסי',
              quote: 'מסמכי PDF',
              clients: 'ספר לקוחות'
          }
        },
        food: {
          title: 'מסעדות ובתי קפה',
          description: 'ייעל את פעילות המסעדה שלך עם ניהול שולחנות, מסכי מטבח ותפריטים דיגיטליים.',
          features: {
             tables: 'תצוגת שולחנות ויזואלית',
             kitchen: 'מערכת תצוגת מטבח (KDS)',
             menu: 'ניהול תפריט',
             zreport: 'סגירת יום (דו"ח Z)'
          }
        },
        other: {
          title: 'פתרונות מותאמים',
          description: 'פתרונות מותאמים אישית למספרות, מוסכים ועסקי שירות אחרים.',
          badge: 'בקרוב'
        }
      }
    },
    ar: {
      heroTitle: "قل وداعاً لدفاتر الإيصالات",
      heroSubtitle: "نظام محاسبة ذكي",
      login: "تسجيل الدخول",
      download: "تحميل لنظام ويندوز",
      downloadMac: "تحميل للماك",
      appDesc: "استمتع بالتحكم المطلق في أموال عملك. يقدم MyDesck PRO مزيجاً سلساً من القوة والبساطة، صُمم ليساعدك على النمو بثقة.",
      featuresTitle: "لماذا MyDesck PRO؟",

      customizationTitle: "التسجيل والتخصيص",
      customizationText: "للتسجيل وفتح حساب، يرجى التواصل معنا وتحديد نوع النشاط. المنصة جاهزة تماماً للسياحة، المطاعم، والسوبر ماركت.",
      footer: "© {year} MyDesck PRO. جميع الحقوق محفوظة.",
      safetySupport: "الأمان والدعم",
      hero: {
        download: 'تحميل الآن',
        contact: 'تواصل معنا',
        dashboard: 'واجهة التحكم',
        realtime: 'تتبع وإدارة في الوقت الفعلي'
      },
      features: {
        title: 'كل ما تحتاجه لإدارة عملك'
      },
      benefits: [
        { title: "لوحة التحكم والأرباح: تتبع الإيرادات، المصروفات، وصافي الربح لحظة بلحظة.", icon: LayoutDashboard },
        { title: "تصدير للمحاسب: تقارير مالية كاملة (Excel/PDF) وسجل فواتير جاهز بنقرة واحدة.", icon: FileText },
        { title: "ابدأ مجاناً: 3 أشهر تجربة كاملة، ثم $20/شهر فقط (شامل التحديثات والدعم).", icon: BadgeDollarSign }
      ],
      demo: {
        title: 'شاهد النظام يعمل',
        description: 'واجهة مصممة خصيصاً للسرعة في أوقات الذروة. لا تعقيدات، فقط ما تحتاجه لإنجاز العمل.',
        list: {
          darkMode: 'دعم الوضع الداكن المريح للعين أثناء العمل الليلي',
          offline: 'نظام هجين ذكي: استمر في البيع والعمل حتى عند انقطاع الإنترنت',
          multilang: 'واجهة متعددة اللغات بالكامل (عربي، عبري، إنجليزي) يمكن التبديل بينها فوراً'
        },
        placeholder: 'فيديو توضيحي رسمي - قريباً'
      },
      industries: {
        title: 'حلول الصناعة',
        market: {
          title: 'السوبر ماركت والتجزئة',
          description: 'الحل الأمثل لإدارة التجزئة. نقطة بيع سريعة، مخرون ذكي، وتحليل مفصل للأرباح.',
          features: {
             scan: 'مسح الباركود',
             inventory: 'إدارة المخزون',
             profit: 'تحليل المبيعات',
             receipts: 'طباعة الإيصالات',
             admin: 'إدارة مركزية'
          }
        },
        trip: {
          title: 'السياحة والمالية',
          description: 'إدارة كاملة للرحلات والتبكاليف. تعامل مع عروض الأسعار وتفاصيل العملاء والفواتير في منصة واحدة موحدة.',
          features: {
              trips: 'إدارة الرحلات',
              financials: 'تتبع مالي',
              quote: 'مستندات PDF',
              clients: 'دليل العملاء'
          }
        },
        food: {
          title: 'المطاعم والمقاهي',
          description: 'قم بتبسيط عمليات مطعمك من خلال إدارة الطاولات وأنظمة عرض المطبخ والقوائم الرقمية.',
          features: {
              tables: 'تخطيط الطاولات المرئي',
              kitchen: 'نظام عرض المطبخ (KDS)',
              menu: 'إدارة القائمة',
              zreport: 'إغلاق اليوم (تقرير Z)'
          }
        },
        other: {
          title: 'حلول مخصصة',
          description: 'حلول مصممة خصيصاً للصالونات وورش الإصلاح وأنشطة الخدمات الأخرى.',
          badge: 'قريباً'
        }
      }
    }
  };

  const localT = translations[language as keyof typeof translations] || translations.en;
  const { t } = useLanguage();

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
    "description": "نظام محاسبة ומبيعات متكامل لإدارة جميع أنواع الأنشطة التجارية והעסקים",
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
    <LanguageAnimationWrapper>
      <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans overflow-x-hidden ${direction === 'rtl' ? 'rtl' : 'ltr'}`} dir={direction}>
      <SEO 
        title={t('heroTitle')}
        description={t('heroSubtitle')}
        structuredData={structuredData}
      />
      <Toaster position="top-center" richColors />

{/* --- Backgrounds Removed for Performance --- */}

      {/* --- FLOATING HEADER --- */}
      {/* --- FLOATING HEADER --- */}
      <FloatingHeader />

      <section className="pt-24 md:pt-32 pb-16 md:pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        <motion.div initial="initial" animate="animate" variants={fadeIn} className="space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm font-medium border border-blue-100 dark:border-blue-800/50">
            <CheckCircle className="w-4 h-4" />
            <span>V 0.0.35 Available Now</span>
          </div>
          <h1 className="text-4xl md:text-5xl lg:text-7xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-6 rtl:leading-tight">
            {localT.heroTitle}
          </h1>
          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 max-w-2xl mx-auto mb-10">
            {localT.heroSubtitle}
          </p>
          
          {/* Dynamic Download Buttons */}
          <div className="flex flex-col items-center gap-6">
            <div className="flex flex-col sm:flex-row gap-4 justify-center w-full sm:w-auto">
              <motion.a 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }} 
                href={windowsAsset || "https://github.com/Aseel-V/MyDesck-PRO-Releases/releases/latest/download/MyDesck-PRO-Setup.exe"} 
                className="px-8 py-4 rounded-full flex items-center gap-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/40 transition-all"
              >
                <Monitor className="w-5 h-5" />
                <div className="flex flex-col items-start leading-none">
                   <span>{t('landing.hero.download')}</span>
                   {versionTag && <span className="text-[10px] opacity-80 font-normal mt-1">{versionTag} • Installer</span>}
                </div>
              </motion.a>
              
              <motion.a 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }} 
                href={macAsset || "https://github.com/Aseel-V/MyDesck-PRO-Releases/releases/latest/download/MyDesck-PRO-0.0.34.dmg"} 
                className="px-8 py-4 rounded-full flex items-center gap-3 bg-white dark:bg-slate-800 text-slate-700 dark:text-white font-bold border border-slate-200 dark:border-slate-700 shadow-lg hover:shadow-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
              >
                <Laptop className="w-5 h-5" />
                <div className="flex flex-col items-start leading-none">
                   <span>{t('landing.hero.downloadMac')}</span>
                   {versionTag && <span className="text-[10px] opacity-70 font-normal mt-1 text-slate-500 dark:text-slate-400">Apple Silicon Support</span>}
                </div>
              </motion.a>

              <motion.a 
                whileHover={{ scale: 1.05 }} 
                whileTap={{ scale: 0.95 }} 
                href="https://mail.google.com/mail/?view=cm&fs=1&to=aseelshaheen621@gmail.com" 
                target="_blank" 
                className="px-8 py-4 rounded-full flex items-center gap-3 bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-bold shadow-lg hover:shadow-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-all"
              >
                <Mail className="w-5 h-5" />
                <span>{localT.hero.contact}</span>
              </motion.a>
            </div>

            <button 
               onClick={() => setIsDownloadModalOpen(true)}
               className="text-sm font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors underline decoration-dotted underline-offset-4"
            >
               View all versions & release notes
            </button>
          </div>

          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }} className="text-lg md:text-xl text-slate-500 dark:text-slate-400 max-w-3xl mx-auto mt-12 leading-relaxed">
            {localT.appDesc}
          </motion.p>
          <div className="pt-12">
            <img src="dashboard.png" alt="Dashboard Preview" className="rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 mx-auto w-full max-w-5xl bg-slate-200 dark:bg-slate-800 aspect-video object-cover" onError={(e) => { e.currentTarget.style.display = 'none' }} />
          </div>
        </motion.div>
      </section>
      
      <DownloadModal isOpen={isDownloadModalOpen} onClose={() => setIsDownloadModalOpen(false)} />

      <section className="py-24 bg-slate-50 dark:bg-slate-900 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-slate-700 to-transparent"></div>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="text-center mb-16">
             <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
                <h2 className="text-4xl font-black text-slate-900 dark:text-white mb-4 tracking-tight">
                  {localT.industries.title}
                </h2>
                <div className="w-24 h-1.5 bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full mx-auto"></div>
             </motion.div>
           </div>
           
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              <IndustryGridCard 
                icon={ShoppingCart}
                title={localT.industries.market.title}
                description={localT.industries.market.description}
                features={Object.values(localT.industries.market.features || {})}
                color="emerald"
                onClick={() => navigate('/solutions/market')}
              />
              <IndustryGridCard 
                icon={Bus}
                title={localT.industries.trip.title}
                description={localT.industries.trip.description}
                features={Object.values(localT.industries.trip.features || {})}
                color="blue"
                onClick={() => navigate('/solutions/trip')}
              />
              <IndustryGridCard 
                icon={Utensils}
                title={localT.industries.food.title}
                description={localT.industries.food.description}
                features={Object.values(localT.industries.food.features || {})}
                color="orange"
                onClick={() => navigate('/solutions/food')}
              />

              <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="lg:col-span-3 bg-white/50 dark:bg-slate-800/30 rounded-3xl p-8 border border-dashed border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-center gap-6 text-center md:text-left backdrop-blur-sm">
                <div className="w-14 h-14 bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 rounded-full flex items-center justify-center shrink-0">
                  <Hammer className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex flex-col md:flex-row items-center gap-3 mb-2">
                     <h3 className="text-xl font-bold text-slate-700 dark:text-slate-300">{localT.industries.other.title}</h3>
                     <span className="px-3 py-1 bg-slate-100 dark:bg-slate-700 text-slate-500 text-[10px] font-black rounded-full uppercase tracking-widest border border-slate-200 dark:border-slate-600">
                       {localT.industries.other.badge}
                     </span>
                  </div>
                  <p className="text-slate-500 dark:text-slate-400">{localT.industries.other.description}</p>
                </div>
              </motion.div>
           </div>
        </div>
      </section>

      <section className="py-20 bg-white dark:bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <h2 className="text-3xl font-bold text-center mb-16 dark:text-white">
             {localT.features.title}
           </h2>
           <div className="grid md:grid-cols-3 gap-8">
             {localT.benefits.map((feature: { title: string; icon: React.ElementType }, idx: number) => (
               <SpotlightCard key={idx} className="p-8 h-full" spotlightColor="rgba(59, 130, 246, 0.15)">
                 <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 mb-6">
                   <feature.icon className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">{feature.title}</h3>
               </SpotlightCard>
             ))}
           </div>
        </div>
      </section>

      <section className="py-20 bg-slate-50 dark:bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="text-center mb-16">
             <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">{t('seoFeatures.title')}</h2>
             <div className="w-20 h-1 bg-blue-600 mx-auto rounded-full"></div>
           </div>
           <div className="grid md:grid-cols-3 gap-8">
             <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-xl flex items-center justify-center mb-6">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('seoFeatures.sales.title')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{t('seoFeatures.sales.desc')}</p>
             </div>
             <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-xl flex items-center justify-center mb-6">
                  <Receipt className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('seoFeatures.invoices.title')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{t('seoFeatures.invoices.desc')}</p>
             </div>
             <div className="p-8 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 hover:shadow-md transition-shadow">
                <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-xl flex items-center justify-center mb-6">
                  <PieChart className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{t('seoFeatures.reports.title')}</h3>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{t('seoFeatures.reports.desc')}</p>
             </div>
           </div>
        </div>
      </section>

      <section className="py-20 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
           <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-16 items-center">
             <div>
                <motion.div initial={{ opacity: 0, x: -20 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }}>
                   <h2 className="text-4xl font-bold text-slate-900 dark:text-white mb-6">{localT.demo.title}</h2>
                   <p className="text-lg text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">{localT.demo.description}</p>
                   <div className="space-y-4">
                      {[localT.demo.list.darkMode, localT.demo.list.offline, localT.demo.list.multilang].map((item, i) => (
                        <div key={i} className="flex items-center gap-3">
                           <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 flex items-center justify-center shrink-0">
                             <CheckCircle className="w-4 h-4" />
                           </div>
                           <span className="text-slate-700 dark:text-slate-300 font-medium">{item}</span>
                        </div>
                      ))}
                   </div>
                </motion.div>
             </div>
             <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="relative">
                <div className="aspect-video bg-slate-900 rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center border border-slate-800 group cursor-pointer">
                   <div className="absolute inset-0 bg-gradient-to-tr from-blue-600/20 to-purple-600/20 group-hover:opacity-75 transition-opacity"></div>
                   <div className="text-center p-8">
                      <div className="w-16 h-16 bg-white/10 backdrop-blur-md rounded-full flex items-center justify-center mx-auto mb-4 border border-white/20 group-hover:scale-110 transition-transform">
                         <div className="w-0 h-0 border-t-[10px] border-t-transparent border-l-[18px] border-l-white border-b-[10px] border-b-transparent ml-1"></div>
                      </div>
                      <p className="text-white font-medium">{localT.demo.placeholder}</p>
                   </div>
                </div>
                <div className="absolute -z-10 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-blue-500/10 blur-3xl rounded-full"></div>
             </motion.div>
           </div>
        </div>
      </section>

      <section className="py-20 bg-blue-600 text-white overflow-hidden relative">
        <div className="absolute inset-0 bg-blue-600 opacity-20"></div>
        <div className="max-w-4xl mx-auto px-4 text-center relative z-10">
          <div className="flex justify-center gap-4 mb-6">
            <Globe className="w-12 h-12 text-blue-200" />
            <UserPlus className="w-12 h-12 text-blue-200" />
          </div>
          <h2 className="text-3xl font-bold mb-6">{localT.customizationTitle}</h2>
          <p className="text-xl md:text-2xl font-medium leading-relaxed opacity-90 mb-8">{localT.customizationText}</p>
          <a href="https://mail.google.com/mail/?view=cm&fs=1&to=aseelshaheen621@gmail.com" target="_blank" onClick={() => { navigator.clipboard.writeText('aseelshaheen621@gmail.com'); toast.success('Email copied to clipboard!'); }} className="inline-flex items-center gap-2 px-6 py-3 bg-white text-blue-600 rounded-lg font-bold hover:bg-blue-50 transition-colors shadow-lg shadow-blue-900/20">
            <Mail className="w-5 h-5" />
            aseelshaheen621@gmail.com
          </a>
        </div>
      </section>

      <footer className="bg-slate-900 dark:bg-black text-slate-400 py-12 text-center text-sm border-t border-slate-800 flex flex-col gap-4">
        <div className="flex justify-center gap-6">
          <a onClick={() => navigate('/safety-support')} className="hover:text-white cursor-pointer transition-colors">
            {localT.safetySupport}
          </a>
        </div>
        <p>{localT.footer.replace('{year}', new Date().getFullYear().toString())}</p>
      </footer>
      </div>
    </LanguageAnimationWrapper>
  );
};

export default LandingPage;
