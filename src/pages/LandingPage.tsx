import { motion } from 'framer-motion';
import { Download, CheckCircle, Mail, FileText, TrendingUp } from 'lucide-react';
import Logo from '../components/Logo';
import { useLanguage } from '../contexts/LanguageContext';
import { useNavigate } from 'react-router-dom';

const LandingPage = () => {
    const { language, setLanguage, direction } = useLanguage();
    const navigate = useNavigate();

    const isRtl = direction === 'rtl';

    const content = {
        en: {
            nav: {
                login: "Login",
            },
            hero: {
                headline: "Say Goodbye to Receipt Books",
                subHeadline: "The smart accounting system that replaces paper. Use it as a Website or Desktop App - your choice.",
                cta: "Download for Windows",
                platforms: "Available now on Windows. Mobile App coming soon.",
            },
            dashboard: {
                title: "Real-Time Dashboard",
                description: "Track your profits, losses, and percentages instantly.",
            },
            accountants: {
                title: "For Accountants",
                text: "Easy export for your accountant. Save hours of work.",
                highlight: "Your accountant will love this.",
            },
            customization: {
                title: "Need for Supermarket?", // Shortened for card title
                subtitle: "Built to be upgraded for any business.",
                cta: "Contact us to customize.",
                process: "Request your industry setup",
                contact: "Contact:",
                fullText: "Contact the developer to customize your workspace."
            },
            pricing: {
                offer: "First 3 Months Free",
                price: "$20 / month",
                cta: "Start Free Trial",
            },
            footer: {
                copyright: `© ${new Date().getFullYear()} MyDesck PRO. All rights reserved.`,
            }
        },
        he: {
            nav: {
                login: "התחבר",
            },
            hero: {
                headline: "אין צורך יותר בפנקסי קבלות",
                subHeadline: "מערכת הנהלת החשבונות החכמה שמחליפה את הנייר. השתמש בה כאתר או כאפליקציה - לבחירתך.",
                cta: "הורד עבור Windows",
                platforms: "זמין כעת ב-Windows. אפליקציה לנייד בקרוב.",
            },
            dashboard: {
                title: "לוח בקרה בזמן אמת",
                description: "עקוב אחר הרווחים, ההפסדים והאחוזים שלך באופן מיידי.",
            },
            accountants: {
                title: "עבור רואי חשבון",
                text: "ייצוא קל לרואה החשבון שלך. חסוך שעות של עבודה.",
                highlight: "רואה החשבון שלך יאהב את זה.",
            },
            customization: {
                title: "צריך לסופרמרקט?",
                subtitle: "נבנה כדי להיות משודרג לכל עסק.",
                cta: "צור קשר להתאמה אישית.",
                process: "בקש הגדרות לתעשייה שלך",
                contact: "צור קשר:",
                fullText: "צור קשר עם המפתח להתאמת סביבת העבודה שלך."
            },
            pricing: {
                offer: "3 חודשי ניסיון חינם",
                price: "לאחר מכן $20 / חודש",
                cta: "התחל ניסיון חינם",
            },
            footer: {
                copyright: `© ${new Date().getFullYear()} MyDesck PRO. כל הזכויות שמורות.`,
            }
        },
        ar: {
            nav: {
                login: "تسجيل الدخول",
            },
            hero: {
                headline: "لا داعي لدفاتر الايصالات",
                subHeadline: "نظام المحاسبة الذكي الذي يحل محل الورق. استخدمه كموقع ويب أو تطبيق - الخيار لك.",
                cta: "تحميل لـ Windows",
                platforms: "متاح الآن على Windows. تطبيق الهاتف قريبا.",
            },
            dashboard: {
                title: "لوحة تحكم فورية",
                description: "تتبع أرباحك وخسائرك ونسبك على الفور.",
            },
            accountants: {
                title: "للمحاسبين",
                text: "تصدير سهل لمحاسبك. وفر ساعات من العمل.",
                highlight: "محاسبك سيحب هذا.",
            },
            customization: {
                title: "هل تحتاجه لمحل او سوبرماركت؟",
                subtitle: "مصمم ليكون قابل للترقية لأي نشاط تجاري.",
                cta: "تواصل معنا للتخصيص.",
                process: "اطلب إعداد مجالك",
                contact: "تواصل معنا:",
                fullText: "تواصل مع المطور لتخصيص مساحة العمل الخاصة بك."
            },
            pricing: {
                offer: "3 أشهر مجاناً",
                price: "ثم 20 دولار / شهر",
                cta: "ابدأ التجربة المجانية",
            },
            footer: {
                copyright: `© ${new Date().getFullYear()} MyDesck PRO. جميع الحقوق محفوظة.`,
            }
        }
    };

    const t = content[language as keyof typeof content] || content.en;

    const fadeInUp = {
        initial: { opacity: 0, y: 10 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4 }
    };

    return (
        <div className={`min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col ${isRtl ? 'rtl' : 'ltr'}`} dir={isRtl ? 'rtl' : 'ltr'}>
            {/* Compact Navbar */}
            <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200">
                <div className="max-w-7xl mx-auto px-4 lg:px-6">
                    <div className="flex justify-between items-center h-16">
                        <div className="flex-shrink-0 flex items-center gap-2">
                            <Logo className="h-8 w-auto" />
                            <span className="font-bold text-lg text-blue-600 sm:block">MyDesck PRO</span>
                        </div>
                        
                        <div className="flex items-center gap-3">
                            <div className="flex items-center bg-slate-100 rounded-full p-1">
                                {(['en', 'he', 'ar'] as const).map((lang) => (
                                    <button
                                        key={lang}
                                        onClick={() => setLanguage(lang)}
                                        className={`px-3 py-1 text-[10px] font-bold rounded-full transition-all ${
                                            language === lang 
                                            ? 'bg-blue-600 text-white shadow-sm' 
                                            : 'text-slate-500 hover:text-slate-800'
                                        }`}
                                    >
                                        {lang.toUpperCase()}
                                    </button>
                                ))}
                            </div>
                            <button 
                                onClick={() => navigate('/login')} 
                                className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                {t.nav.login}
                            </button>
                        </div>
                    </div>
                </div>
            </nav>

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 lg:px-6 py-6 flex flex-col gap-5">
                
                {/* Hero + Dashboard Visual (Combined) */}
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="grid lg:grid-cols-12 gap-6 bg-white rounded-3xl p-6 md:p-10 shadow-sm border border-slate-200 items-center"
                >
                    <div className="lg:col-span-7 space-y-6">
                         <h1 className="text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-slate-900 leading-tight">
                            {t.hero.headline}
                        </h1>
                        <p className="text-lg text-slate-600 leading-relaxed max-w-2xl">
                            {t.hero.subHeadline}
                        </p>
                        
                        <div className="flex flex-col sm:flex-row gap-4 pt-2">
                            <a 
                                href="https://github.com/Aseel-V/MyDesck-PRO-Releases/releases/latest"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-base px-6 py-3 rounded-xl font-bold transition-all shadow-lg shadow-blue-200 hover:shadow-xl hover:scale-105"
                            >
                                <Download className="w-5 h-5" />
                                {t.hero.cta}
                            </a>
                        </div>
                        <div className="flex items-center gap-2 text-xs font-medium text-slate-400">
                             <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                             {t.hero.platforms}
                        </div>
                    </div>

                    {/* Dashboard Visual Mini */}
                    <div className="lg:col-span-5 w-full bg-slate-50 rounded-2xl border border-slate-100 p-5 relative overflow-hidden group">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <TrendingUp className="w-5 h-5 text-blue-600" />
                                <span className="font-bold text-slate-700">{t.dashboard.title}</span>
                            </div>
                            <div className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded-full">+12%</div>
                        </div>
                        <div className="h-32 flex items-end justify-between gap-2">
                             {[35, 60, 40, 80, 55, 90, 45].map((h, i) => (
                                <div key={i} className="w-full bg-blue-100 rounded-t-md relative overflow-hidden h-full"> 
                                     <motion.div 
                                        initial={{ height: 0 }}
                                        whileInView={{ height: `${h}%` }}
                                        transition={{ duration: 1, delay: i * 0.1 }}
                                        className="absolute bottom-0 inset-x-0 bg-blue-500 rounded-t-md" 
                                     />
                                </div>
                            ))}
                        </div>
                    </div>
                </motion.div>

                {/* 3-Column Features Grid */}
                <div className="grid md:grid-cols-3 gap-5">
                    
                    {/* Accountants Card */}
                    <motion.div 
                        variants={fadeInUp}
                        className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow"
                    >
                         <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center mb-4">
                            <FileText className="w-5 h-5" />
                         </div>
                         <h3 className="text-lg font-bold text-slate-900 mb-2">{t.accountants.title}</h3>
                         <p className="text-sm text-slate-500 mb-4">{t.accountants.text}</p>
                         <div className="text-xs font-semibold text-indigo-600 flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            {t.accountants.highlight}
                         </div>
                    </motion.div>

                    {/* Pricing Card */}
                    <motion.div 
                        variants={fadeInUp}
                        className="bg-slate-900 text-white p-6 rounded-3xl shadow-lg relative overflow-hidden group"
                    >
                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/20 blur-2xl rounded-full -mr-10 -mt-10" />
                        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-widest mb-4">Pro Plan</h3>
                        <div className="flex items-baseline gap-1 mb-2">
                             <span className="text-3xl font-bold">{t.pricing.price}</span>
                        </div>
                        <div className="inline-block bg-green-500/20 text-green-300 text-xs px-2 py-1 rounded mb-4">
                            {t.pricing.offer}
                        </div>
                         <button className="w-full bg-white text-slate-900 py-3 rounded-xl font-bold text-sm hover:bg-slate-100 transition-colors">
                            {t.pricing.cta}
                        </button>
                    </motion.div>

                    {/* Customization Card */}
                    <motion.div 
                        variants={fadeInUp}
                        className="bg-gradient-to-br from-blue-50 to-white p-6 rounded-3xl border border-blue-100 shadow-sm"
                    >
                        <h3 className="text-lg font-bold text-blue-900 mb-2">{t.customization.title}</h3>
                        <p className="text-sm text-slate-600 mb-4">{t.customization.fullText}</p>
                        <a 
                           href="https://mail.google.com/mail/?view=cm&fs=1&to=aseelshaheen621@gmail.com"
                           target="_blank"
                           rel="noopener noreferrer"
                           className="inline-flex items-center gap-2 text-sm font-bold text-blue-600 hover:text-blue-700 group"
                        >
                            <Mail className="w-4 h-4 group-hover:scale-110 transition-transform" />
                            {t.customization.cta}
                        </a>
                         <div className="mt-3 text-xs text-slate-400 flex items-center gap-1">
                             <span>→</span> {t.customization.process}
                         </div>
                    </motion.div>

                </div>
            </main>

            {/* Micro Footer */}
            <footer className="py-6 border-t border-slate-100 text-center">
                 <p className="text-xs text-slate-400">{t.footer.copyright}</p>
            </footer>
        </div>
    );
};

export default LandingPage;
