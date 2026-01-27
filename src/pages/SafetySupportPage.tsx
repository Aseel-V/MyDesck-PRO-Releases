
import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { motion } from 'framer-motion';
import { 
  Shield, Lock, FileCheck, Headphones, Mail, Eye, 
  CheckCircle, Server, WifiOff, HardDrive
} from 'lucide-react';
import SEO from '../components/SEO';
import FloatingHeader from '../components/FloatingHeader';
import LanguageAnimationWrapper from '../components/LanguageAnimationWrapper';

// --- Spotlight Card Component ---
// --- Spotlight Card Component (Optimized) ---
const SpotlightCard = ({ children, className = "", spotlightColor = "rgba(99, 102, 241, 0.15)" }: { children: React.ReactNode, className?: string, spotlightColor?: string }) => {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-shadow group ${className}`}
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
    </div>
  );
};

const SafetySupportPage = () => {
  const { direction, language } = useLanguage();

  // --- LEGAL CONTENT PRESERVED EXACTLY ---
  const translations = {
    en: {
      title: "Legal Center & Support",
      subtitle: "Comprehensive protection, transparency, and support for your business.",
      nav: { home: "Home", login: "Login" },
      sections: {
        security: "Security & Data Protection",
        privacy: "Privacy & Data Usage",
        terms: "Terms of Service & Licensing",
        support: "Enterprise Support"
      },
      security: {
        title: "Security Architecture",
        desc: "MyDesck PRO employs a 'Local-First' architecture. Your data resides physically on your hardware, ensuring you have total control without reliance on third-party cloud servers.",
        features: [
          { title: "Local Data Sovereignty", desc: "Your financial records and client lists are stored firmly on your local hard drive. We do not have remote access to your database.", icon: HardDrive },
          { title: "Offline Capability", desc: "The system functions 100% offline. No internet connection is required for daily operations, eliminating web-based attack vectors.", icon: WifiOff },
          { title: "User-Controlled Backups", desc: "You are responsible for your own data. We provide tools to export data, but we do not store copies on our servers.", icon: Server }
        ]
      },
      privacy: {
        title: "Privacy Policy",
        intro: "This Privacy Policy describes how MyDesck PRO collects, uses, and discloses your Personal Information when you use our software.",
        points: [
          "Data Minimizaton: We only collect account credentials (email) for license verification. All business data (sales, inventory) is processed locally.",
          "No Data Selling: We do not sell, trade, or rent your personal identification information to others. We are a paid software provider, not a data broker.",
          "User Rights: You retain full ownership of all data entered into the system. You may export your data to standard formats (CSV/PDF) at any time."
        ]
      },
      terms: {
        title: "Terms of Service",
        intro: "These Terms constitute a legally binding agreement between you ('The User') and MyDesck PRO.",
        points: [
          "Strict No-Refund Policy: MyDesck PRO operates on a strict pay-as-you-go basis. Payments are non-refundable. Service terminates immediately upon cancellation or failure to pay.",
          "Indemnification: You agree to indemnify, defend, and hold harmless MyDesck PRO from any claims, liabilities, or expenses arising from your use of the software, including illegal business activities.",
          "Force Majeure: MyDesck PRO shall not be liable for any failure to perform its obligations where such failure results from any cause beyond MyDesck PRO's reasonable control.",
          "Limitation of Liability: In no event shall MyDesck PRO be liable for any indirect, incidental, special, consequential or punitive damages, including loss of data or business interruption.",
          "Prohibited Uses: You may not use the software for any illegal activities. You are solely responsible for ensuring your business complies with local laws.",
          "License Grant: We grant you a revocable, non-exclusive, non-transferable, limited license to use the Application regarding these Terms.",
          "Governing Law: These Terms shall be governed and construed in accordance with the laws of Israel."
        ]
      },
      support: {
        title: "Priority Support",
        desc: "Our legal and technical teams are available to address any concerns. For critical issues, data recovery assistance, or licensing questions, please contact us directly.",
        email: "aseelshaheen621@gmail.com",
        action: "Contact Legal & Support"
      }
    },
    he: {
      title: "מרכז משפטי ותמיכה",
      subtitle: "הגנה מקיפה, שקיפות ותמיכה לעסק שלך.",
      nav: { home: "בית", login: "התחברות" },
      sections: {
        security: "אבטחה והגנת נתונים",
        privacy: "פרטיות ושימוש בנתונים",
        terms: "תנאי שימוש ורישוי",
        support: "תמיכה עסקית"
      },
      security: {
        title: "ארכיטקטורת אבטחה",
        desc: "MyDesck PRO פועלת בארכיטקטורת 'מקומי-תחילה'. הנתונים שלך נמצאים פיזית על החומרה שלך, מה שמבטיח שליטה מלאה ללא תלות בשרתי ענן חיצוניים.",
        features: [
          { title: "ריבונות נתונים", desc: "הרישומים הפיננסיים ורשימות הלקוחות מאוחסנים באופן מאובטח בדיסק הקשיח המקומי שלך. אין לנו גישה מרחוק למסד הנתונים שלך.", icon: HardDrive },
          { title: "יכולת לא מקוונת (Offline)", desc: "המערכת פועלת ב-100% ללא אינטרנט. אין צורך בחיבור לרשת לפעולות יומיומיות, מה שמונע וקטורים של התקפות רשת.", icon: WifiOff },
          { title: "גיבויים בשליטת המשתמש", desc: "אתה אחראי לנתונים שלך. אנו מספקים כלים לייצוא נתונים, אך איננו שומרים עותקים בשרתים שלנו.", icon: Server }
        ]
      },
      privacy: {
        title: "מדיניות פרטיות",
        intro: "מדיניות פרטיות זו מתארת כיצד MyDesck PRO אוספת, משתמשת וחושפת את המידע האישי שלך.",
        points: [
          "מזעור נתונים: אנו אוספים רק אישורי חשבון (אימייל) לצורך אימות רישיון. כל הנתונים העסקיים מעובדים מקומית אצלך.",
          "ללא מכירת נתונים: איננו מוכרים, סוחרים או משכירים את פרטי הזיהוי האישיים שלך. אנו ספק תוכנה בתשלום, לא סוחר נתונים.",
          "זכויות המשתמש: אתה שומר על בעלות מלאה על כל הנתונים שהוזנו למערכת. ניתן לייצא אותם בכל עת."
        ]
      },
      terms: {
        title: "תנאי שימוש ורישוי",
        intro: "תנאים אלה מהווים הסכם מחייב משפטית בינך ('המשתמש') לבין MyDesck PRO.",
        points: [
          "מדיניות ללא החזרים (נוקשה): תשלומים אינם ניתנים להחזר. השירות יופסק מיד עם ביטול או אי-תשלום.",
          "שיפוי (Indemnification): אתה מסכים לשפות ולהגן על MyDesck PRO מפני כל תביעה או חבות הנובעת מהשימוש שלך בתוכנה, כולל פעילות עסקית לא חוקית.",
          "כוח עליון: MyDesck PRO לא תהיה אחראית לכל כשל בביצוע התחייבויותיה הנובע מסיבות שאינן בשליטתה הסבירה.",
          "הגבלת אחריות: בשום מקרה MyDesck PRO לא תהיה אחראית לכל נזק עקיף, כולל אובדן נתונים או הפרעה עסקית.",
          "שימושים אסורים: אין להשתמש בתוכנה לפעילות לא חוקית. הרישיון ישלל מידית במקרה של שימוש לרעה.",
          "הענקת רישיון: רישיון מוגבל, הניתן לביטול ולא בלעדי לשימוש באפליקציה.",
          "סמכות שיפוט: תנאים אלה יהיו כפופים לחוקי מדינת ישראל."
        ]
      },
      support: {
        title: "תמיכה בעדיפות גבוהה",
        desc: "הצוותים שלנו זמינים לטפל בכל חשש. לנושאים קריטיים, סיוע בשחזור נתונים או שאלות רישוי, אנא צור קשר ישירות.",
        email: "aseelshaheen621@gmail.com",
        action: "צור קשר עם המחלקה המשפטית"
      }
    },
    ar: {
      title: "المركز القانوني والدعم",
      subtitle: "حماية شاملة، شفافية، ودعم لعملك.",
      nav: { home: "الرئيسية", login: "تسجيل الدخول" },
      sections: {
        security: "الأمن وحماية البيانات",
        privacy: "الخصوصية واستخدام البيانات",
        terms: "شروط الخدمة والترخيص",
        support: "دعم مخصص"
      },
      security: {
        title: "هندسة الأمان",
        desc: "يعمل MyDesck PRO ببيئة 'المحلية أولاً'. بياناتك موجودة فعلياً على جهازك، مما يضمن تحكماً كاملاً دون الاعتماد على خوادم سحابية خارجية.",
        features: [
          { title: "سيادة البيانات", desc: "يتم تخزين سجلاتك المالية وقوائم العملاء بشكل آمن على القرص الصلب المحلي الخاص بك. ليس لدينا وصول عن بعد إلى قاعدة البيانات الخاصة بك.", icon: HardDrive },
          { title: "العمل دون اتصال", desc: "يعمل النظام بنسبة 100% دون إنترنت. لا حاجة لاتصال بالشبكة للعمليات اليومية، مما يزيل مخاطر الهجمات عبر الويب.", icon: WifiOff },
          { title: "نسخ احتياطية بقرارك", desc: "أنت مسؤول عن بياناتك. نحن نوفر أدوات لتصدير البيانات، لكننا لا نخزن نسخاً على خوادمنا.", icon: Server }
        ]
      },
      privacy: {
        title: "سياسة الخصوصية",
        intro: "تصف هذه السياسة كيفية التعامل مع بياناتك.",
        points: [
          "تقليل البيانات: نجمع فقط البريد الإلكتروني للترخيص. تتم معالجة جميع بيانات الأعمال محلياً.",
          "لا لبيع البيانات: نحن لا نبيع أو نتاجر بمعلوماتك. نحن شركة برمجيات مدفوعة.",
          "حقوق المستخدم: تحتفظ بملكية كاملة لجميع البيانات المدخلة. يمكنك التصدير في أي وقت."
        ]
      },
      terms: {
        title: "شروط الخدمة",
        intro: "تشكل هذه الشروط اتفاقية ملزمة قانوناً.",
        points: [
          "سياسة عدم الاسترداد: المدفوعات غير قابلة للاسترداد. تتوقف الخدمة فوراً عند الإلغاء.",
          "التعويض (Indemnification): أنت توافق على تعويض MyDesck PRO وحمايتها من أي مطالبات تنشأ عن استخدامك للبرنامج، بما في ذلك الأنشطة غير القانونية.",
          "القوة القاهرة: MyDesck PRO ليست مسؤولة عن الفشل في الأداء الناتج عن أسباب خارجة عن سيطرتها.",
          "حدود المسؤولية: لا نتحمل المسؤولية عن فقدان البيانات أو تعطل الأعمال.",
          "الاستخدامات المحظورة: يمنع استخدام البرنامج في أنشطة غير قانونية.",
          "الترخيص: نمنحك ترخيصاً محدوداً وقابلاً للإلغاء.",
          "القانون الحاكم: تخضع هذه الشروط لقوانين دولة إسرائيل."
        ]
      },
      support: {
        title: "أولوية الدعم",
        desc: "فرقنا متاحة لمعالجة أي مخاوف. للمشكلات الحرجة أو المساعدة التقنية، تواصل معنا.",
        email: "aseelshaheen621@gmail.com",
        action: "تواصل مع القسم القانوني والدعم"
      }
    }
  };

  const t = translations[language as keyof typeof translations] || translations.en;

  return (
    <LanguageAnimationWrapper>
      <div 
        className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans ${direction === 'rtl' ? 'rtl' : 'ltr'}`} 
        dir={direction}
      >
      <SEO 
        title={`${t.title} - MyDesck PRO`}
        description={t.subtitle}
      />
      
      {/* --- NOISE TEXTURE --- */}
{/* --- Backgrounds Removed for Performance --- */}

      {/* --- NAVBAR --- */}
      {/* --- NAVBAR --- */}
      <FloatingHeader />

      <main className="relative z-10 pt-24 md:pt-32 pb-16 md:pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        
        {/* --- HERO --- */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="text-center mb-24 max-w-4xl mx-auto"
        >
          <div className="flex justify-center mb-10">
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="relative w-24 h-24 bg-gradient-to-br from-indigo-500 to-cyan-500 rounded-3xl flex items-center justify-center shadow-2xl shadow-indigo-500/30"
            >
              <Shield className="w-12 h-12 text-white" />
              <div className="absolute inset-0 bg-white/20 blur-xl rounded-3xl -z-10"></div>
            </motion.div>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-7xl font-black mb-8 tracking-tight text-slate-900 dark:text-white">
            {t.title}
          </h1>
          <p className="text-xl md:text-2xl text-slate-600 dark:text-slate-400 leading-relaxed max-w-2xl mx-auto font-medium">
            {t.subtitle}
          </p>
        </motion.div>

        {/* --- BENTO GRID LAYOUT --- */}
        {/* Note: text-start ensures correct alignment for both LTR and RTL */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4 md:gap-6 auto-rows-[minmax(180px,auto)] text-start">
          
          {/* SECURITY CARD (Large) */}
          <div className="lg:col-span-8">
            <SpotlightCard className="h-full p-8" spotlightColor="rgba(16, 185, 129, 0.15)">
              <div className="flex items-center gap-4 mb-8">
                  <div className="p-3 bg-emerald-500/10 rounded-2xl text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    <Lock className="w-8 h-8" />
                  </div>
                    <h2 className="text-2xl md:text-3xl font-bold text-slate-900 dark:text-white">
                      {t.sections.security}
                    </h2>
              </div>
              
              <div className="grid md:grid-cols-2 gap-6">
                  {t.security.features.map((feature, i) => (
                    <div key={i} className="p-5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-black/40 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors">
                      <div className="mb-4 text-emerald-600 dark:text-emerald-400">
                        <feature.icon className="w-6 h-6" />
                      </div>
                      <h3 className="font-bold text-lg mb-2 text-slate-900 dark:text-slate-100">{feature.title}</h3>
                      <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{feature.desc}</p>
                    </div>
                  ))}
              </div>
            </SpotlightCard>
          </div>

          {/* PRIVACY CARD (Tall) */}
          <div className="lg:col-span-4 lg:row-span-2">
            <SpotlightCard className="h-full p-8 flex flex-col" spotlightColor="rgba(99, 102, 241, 0.15)">
              <div className="flex items-center gap-4 mb-6">
                <div className="p-3 bg-indigo-500/10 rounded-2xl text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  <Eye className="w-8 h-8" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                  {t.privacy.title}
                </h2>
              </div>
              <p className="text-slate-600 dark:text-slate-400 mb-8 leading-relaxed">
                {t.privacy.intro}
              </p>
              <ul className="space-y-6">
                {t.privacy.points.map((point, i) => (
                  <li key={i} className="flex gap-4 group">
                    <div className="mt-1 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 flex items-center justify-center shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                      <CheckCircle className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{point}</span>
                  </li>
                ))}
              </ul>
            </SpotlightCard>
          </div>

          {/* TERMS CARD (Wide) */}
          <div className="lg:col-span-8">
            <SpotlightCard className="h-full p-8" spotlightColor="rgba(249, 115, 22, 0.15)">
              <div className="flex flex-col md:flex-row gap-8 h-full">
                <div className="md:w-1/3 flex flex-col">
                  <div className="flex items-center gap-4 mb-4">
                      <div className="p-3 bg-orange-500/10 rounded-2xl text-orange-600 dark:text-orange-400 border border-orange-500/20">
                        <FileCheck className="w-8 h-8" />
                      </div>
                         <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                           {t.terms.title}
                         </h2>
                  </div>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                    {t.terms.intro}
                  </p>
                </div>
                <div className="md:w-2/3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {t.terms.points.map((point, i) => (
                        <div key={i} className="flex gap-3 items-start p-3 rounded-xl hover:bg-slate-50 dark:hover:bg-white/5 transition-colors border border-transparent hover:border-slate-100 dark:hover:border-slate-800">
                          <div className="w-1.5 h-1.5 rounded-full bg-orange-500 mt-2 shrink-0"></div>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed">{point}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            </SpotlightCard>
          </div>

          {/* SUPPORT CARD (Compact Horizontal) */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="lg:col-span-12 relative group rounded-3xl p-[1px] overflow-hidden mt-6"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 via-cyan-500 to-indigo-500 opacity-50 group-hover:opacity-100 transition-opacity duration-500 animate-gradient-xy"></div>
            <div className="relative bg-white dark:bg-slate-950 rounded-[23px] p-6 lg:p-8 flex flex-col lg:flex-row items-center gap-6 lg:gap-10 text-center lg:text-start shadow-xl">
               
               {/* Icon */}
               <motion.div 
                 whileHover={{ scale: 1.1, rotate: 10 }}
                 className="w-16 h-16 shrink-0 bg-gradient-to-tr from-indigo-500 to-cyan-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/20"
               >
                 <Headphones className="w-8 h-8 text-white" />
               </motion.div>
               
               {/* Text Content */}
               <div className="flex-1 min-w-0">
                   <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 mb-2">
                     {t.support.title}
                   </h2>
                 <p className="text-slate-500 dark:text-slate-400 text-sm lg:text-base leading-relaxed">
                   {t.support.desc}
                 </p>
               </div>
               
               {/* Action Button */}
               <motion.a 
                 href={`mailto:${t.support.email}`} 
                 whileHover={{ scale: 1.05 }}
                 whileTap={{ scale: 0.95 }}
                 className="shrink-0 inline-flex items-center gap-3 px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl font-bold text-sm lg:text-base transition-all hover:shadow-xl hover:shadow-indigo-500/20"
               >
                 <Mail className="w-5 h-5" />
                 <span>{t.support.email}</span>
               </motion.a>
            </div>
          </motion.div>
        </div>

      </main>

      <footer className="bg-white/50 dark:bg-slate-950/50 backdrop-blur-md text-slate-400 py-12 text-center text-sm border-t border-slate-200 dark:border-slate-800 mix-blend-plus-lighter">
        <p>© {new Date().getFullYear()} MyDesck PRO. All rights reserved.</p>
      </footer>
      </div>
    </LanguageAnimationWrapper>
  );
};

export default SafetySupportPage;
