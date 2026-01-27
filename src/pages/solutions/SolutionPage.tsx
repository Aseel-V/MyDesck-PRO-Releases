
import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { motion } from 'framer-motion';
import { 
  CheckCircle,
  ShoppingCart, Bus, Utensils, LayoutDashboard, BarChart3, 
  ScanBarcode, Clock, Receipt, Users, ChefHat, FileText, Monitor, Laptop, HelpCircle
} from 'lucide-react';
import SEO from '../../components/SEO';
import { DownloadModal } from '../../components/DownloadModal';
import { useGitHubRelease } from '../../hooks/useGitHubRelease';
import FloatingHeader from '../../components/FloatingHeader';
import LanguageAnimationWrapper from '../../components/LanguageAnimationWrapper';

// --- Dynamic Spotlight Card ---
interface SpotlightCardProps {
  children: React.ReactNode;
  className?: string;
  spotlightColor?: string;
}

const SpotlightCard = ({ children, className = "", spotlightColor = "rgba(99, 102, 241, 0.15)" }: SpotlightCardProps) => {
  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm hover:shadow-md transition-all group ${className}`}
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

interface IndustryConfig {
  icon: React.ElementType;
  color: string;
  gradient: string;
  shadowColor: string;
  spotlight: string;
  mesh1: string;
  mesh2: string;
  screenshot: string;
}

const SolutionPage = () => {
  const { type } = useParams<{ type: string }>();
  const { direction, t } = useLanguage();
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);

  // Fetch latest release
  const { data: releaseData } = useGitHubRelease();
  const windowsAsset = releaseData?.assets.find(a => a.name.endsWith('.exe'))?.browser_download_url;
  const macAsset = releaseData?.assets.find(a => a.name.endsWith('.dmg'))?.browser_download_url;
  const versionTag = releaseData?.tag_name;

  // Configuration for each industry
  const config: Record<string, IndustryConfig> = {
    market: {
      icon: ShoppingCart,
      color: 'emerald', 
      gradient: 'from-emerald-500 to-teal-500',
      shadowColor: 'shadow-emerald-500/30',
      spotlight: 'rgba(16, 185, 129, 0.15)',
      mesh1: 'bg-emerald-500/20',
      mesh2: 'bg-teal-500/20',
      screenshot: 'market_dashboard.png'
    },
    trip: {
      icon: Bus,
      color: 'blue',
      gradient: 'from-blue-600 to-indigo-600',
      shadowColor: 'shadow-blue-500/30',
      spotlight: 'rgba(59, 130, 246, 0.15)',
      mesh1: 'bg-blue-600/20',
      mesh2: 'bg-indigo-600/20',
      screenshot: 'dashboard.png'
    },
    food: {
      icon: Utensils,
      color: 'orange',
      gradient: 'from-orange-500 to-red-500',
      shadowColor: 'shadow-orange-500/30',
      spotlight: 'rgba(249, 115, 22, 0.15)',
      mesh1: 'bg-orange-500/20',
      mesh2: 'bg-red-500/20',
      screenshot: 'restaurant_mockup.png'
    }
  };

  const c = config[type || 'market'] || config.market;
  const translationKey = `landing.industries.${type}`;

  return (
    <LanguageAnimationWrapper>
      <div 
        className={`min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans ${direction === 'rtl' ? 'rtl' : 'ltr'}`} 
        dir={direction}
      >
      <SEO 
        title={`${t(`${translationKey}.title`)} - MyDesck PRO`}
        description={t(`${translationKey}.description`)}
      />

{/* --- Backgrounds Removed for Performance --- */}

      {/* --- NAVBAR --- */}
      {/* --- NAVBAR --- */}
      <FloatingHeader />

      <main className="relative z-10 pt-24 md:pt-32 pb-16 md:pb-24 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
        
        {/* --- HERO SECTION --- */}
        <section className="mb-24">
           <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <motion.div 
                initial={{ opacity: 0, x: direction === 'rtl' ? 20 : -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.6 }}
              >
                 <motion.div 
                   animate={{ y: [0, -5, 0] }}
                   transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                   className={`inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm mb-8`}
                 >
                    <c.icon className={`w-5 h-5 text-${c.color}-500`} />
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm tracking-wide uppercase">
                      {t('landing.industries.title')}
                    </span>
                 </motion.div>
                 
                 <h1 className="text-4xl md:text-5xl lg:text-7xl font-black text-slate-900 dark:text-white mb-8 leading-tight">
                   {t(`${translationKey}.title`)}
                 </h1>
                 <p className="text-xl text-slate-600 dark:text-slate-400 leading-relaxed mb-10 font-medium">
                   {t(`${translationKey}.description`)}
                 </p>
                 
                 {/* --- PILL DOWNLOAD BUTTONS --- */}
                 <div className="flex flex-col items-start gap-4">
                   <div className="flex flex-wrap gap-4">
                     {/* Windows Button */}
                     <motion.a 
                       whileHover={{ scale: 1.05 }}
                       whileTap={{ scale: 0.95 }}
                       href={windowsAsset || "https://github.com/Aseel-V/MyDesck-PRO-Releases/releases/latest/download/MyDesck-PRO-Setup.exe"} 
                       className={`
                         px-8 py-4 rounded-full flex items-center gap-3
                         bg-gradient-to-r ${c.gradient} text-white font-bold
                         shadow-lg shadow-${c.color}-500/25 hover:shadow-xl hover:shadow-${c.color}-500/40 transition-all
                       `}
                     >
                       <Monitor className="w-5 h-5" />
                       <div className="flex flex-col items-start leading-none">
                          <span>{t('landing.hero.download')}</span>
                          {versionTag && <span className="text-[10px] opacity-80 font-normal mt-1">{versionTag} • Installer</span>}
                       </div>
                     </motion.a>
                     
                     {/* Mac Button */}
                     <motion.a 
                       whileHover={{ scale: 1.05 }}
                       whileTap={{ scale: 0.95 }}
                       href={macAsset || "https://github.com/Aseel-V/MyDesck-PRO-Releases/releases/latest/download/MyDesck-PRO-0.0.34.dmg"} 
                       className="
                         px-8 py-4 rounded-full flex items-center gap-3
                         bg-white dark:bg-slate-800 text-slate-700 dark:text-white font-bold
                         border border-slate-200 dark:border-slate-700
                         shadow-lg hover:shadow-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all
                       "
                     >
                       <Laptop className="w-5 h-5" />
                       <div className="flex flex-col items-start leading-none">
                          <span>{t('landing.hero.downloadMac')}</span>
                          {versionTag && <span className="text-[10px] opacity-70 font-normal mt-1 text-slate-500 dark:text-slate-400">Apple Silicon Support</span>}
                       </div>
                     </motion.a>
                   </div>
                   
                   <button 
                     onClick={() => setIsDownloadModalOpen(true)}
                     className="text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors underline decoration-dotted underline-offset-4 pl-2"
                   >
                     View all versions & release notes
                   </button>
                 </div>

                 <div className="mt-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                    <HelpCircle className="w-4 h-4" />
                    <span>Need help? <a href="#" className="underline hover:text-slate-900 dark:hover:text-white">Read installation guide</a></span>
                 </div>

              </motion.div>
              
              <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="relative"
              >
                 <div className={`relative z-10 rounded-3xl overflow-hidden shadow-2xl ${c.shadowColor} border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900`}>
                    <img 
                       src={`/${c.screenshot}?v=updated_v5`} 
                       alt="Dashboard Interface" 
                       className="w-full h-auto object-cover" 
                       loading="lazy"
                    />
                    {/* Glass Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent flex items-end p-8">
                       <div className="text-white">
                         <div className="flex items-center gap-2 mb-2">
                            <span className={`w-2 h-2 rounded-full bg-${c.color}-500 animate-pulse`}></span>
                            <p className="font-bold text-lg">{t(`${translationKey}.title`)}</p>
                         </div>
                         <p className="text-sm opacity-80">{t('landing.hero.realtime')}</p>
                       </div>
                    </div>
                 </div>
                 
                 {/* Decorative Blobs */}
                 <div className={`absolute -top-10 -right-10 w-40 h-40 ${c.mesh1} rounded-full blur-3xl -z-10`}></div>
                 <div className={`absolute -bottom-10 -left-10 w-40 h-40 ${c.mesh2} rounded-full blur-3xl -z-10`}></div>
              </motion.div>
           </div>
        </section>

        {/* --- FEATURES GRID (Existing) --- */}
        <section className="mb-24">
           {/* ...rest of existing code... */}
           <div className="text-center mb-16">
               <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-4">
                 {t('landing.features.title')}
               </h2>
              <div className={`w-24 h-1.5 bg-gradient-to-r ${c.gradient} rounded-full mx-auto`}></div>
           </div>

           <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
               {type === 'market' && (
                <>
                   <SpotlightCard className="p-8" spotlightColor={c.spotlight}>
                     <FeatureContent icon={ScanBarcode} title={t('landing.industries.market.features.scan')} desc={t('landing.industries.market.features.scanDesc')} color={c.color} />
                   </SpotlightCard>
                   <SpotlightCard className="p-8" spotlightColor={c.spotlight}>
                     <FeatureContent icon={Clock} title={t('landing.industries.market.features.inventory')} desc={t('landing.industries.market.features.inventoryDesc')} color={c.color} />
                   </SpotlightCard>
                   <SpotlightCard className="p-8" spotlightColor={c.spotlight}>
                     <FeatureContent icon={BarChart3} title={t('landing.industries.market.features.profit')} desc={t('landing.industries.market.features.profitDesc')} color={c.color} />
                   </SpotlightCard>
                   <SpotlightCard className="p-8 lg:col-span-2" spotlightColor={c.spotlight}>
                     <FeatureContent icon={Receipt} title={t('landing.industries.market.features.receipts')} desc={t('landing.industries.market.features.receiptsDesc')} color={c.color} />
                   </SpotlightCard>
                   <SpotlightCard className="p-8" spotlightColor={c.spotlight}>
                     <FeatureContent icon={LayoutDashboard} title={t('landing.industries.market.features.admin')} desc={t('landing.industries.market.features.adminDesc')} color={c.color} />
                   </SpotlightCard>
                </>
              )}

              {type === 'trip' && (
                <>
                   <SpotlightCard className="p-8 lg:col-span-2" spotlightColor={c.spotlight}>
                     <FeatureContent icon={Bus} title={t('landing.industries.trip.features.trips')} desc={t('landing.industries.trip.features.tripsDesc')} color={c.color} />
                   </SpotlightCard>
                   <SpotlightCard className="p-8" spotlightColor={c.spotlight}>
                     <FeatureContent icon={BarChart3} title={t('landing.industries.trip.features.financials')} desc={t('landing.industries.trip.features.financialsDesc')} color={c.color} />
                   </SpotlightCard>
                   <SpotlightCard className="p-8" spotlightColor={c.spotlight}>
                     <FeatureContent icon={FileText} title={t('landing.industries.trip.features.quote')} desc={t('landing.industries.trip.features.quoteDesc')} color={c.color} />
                   </SpotlightCard>
                   <SpotlightCard className="p-8 lg:col-span-2" spotlightColor={c.spotlight}>
                     <FeatureContent icon={Users} title={t('landing.industries.trip.features.clients')} desc={t('landing.industries.trip.features.clientsDesc')} color={c.color} />
                   </SpotlightCard>
                </>
              )}

               {type === 'food' && (
                <>
                   <SpotlightCard className="p-8" spotlightColor={c.spotlight}>
                     <FeatureContent icon={LayoutDashboard} title={t('landing.industries.food.features.tables')} desc={t('landing.industries.food.features.tablesDesc')} color={c.color} />
                   </SpotlightCard>
                   <SpotlightCard className="p-8 lg:col-span-2" spotlightColor={c.spotlight}>
                     <FeatureContent icon={ChefHat} title={t('landing.industries.food.features.kitchen')} desc={t('landing.industries.food.features.kitchenDesc')} color={c.color} />
                   </SpotlightCard>
                   <SpotlightCard className="p-8 lg:col-span-2" spotlightColor={c.spotlight}>
                      <FeatureContent icon={Utensils} title={t('landing.industries.food.features.menu')} desc={t('landing.industries.food.features.menuDesc')} color={c.color} />
                   </SpotlightCard>
                   <SpotlightCard className="p-8" spotlightColor={c.spotlight}>
                     <FeatureContent icon={Receipt} title={t('landing.industries.food.features.zreport')} desc={t('landing.industries.food.features.zreportDesc')} color={c.color} />
                   </SpotlightCard>
                </>
              )}
           </div>
        </section>

        {/* --- DEMO SECTION (Visual) --- */}
        <section className="relative rounded-[3rem] overflow-hidden bg-slate-900 text-white">
           <div className={`absolute inset-0 bg-gradient-to-br ${c.gradient} opacity-10`}></div>
           <div className="relative z-10 px-8 py-20 lg:p-24 grid md:grid-cols-2 gap-16 items-center">
              <div>
                  <h2 className="text-3xl md:text-4xl font-bold mb-6">
                    {t('landing.demo.title')}
                  </h2>
                 <p className="text-slate-300 text-lg mb-10 leading-relaxed font-medium opacity-90">
                    {t('landing.demo.description')}
                 </p>
                 <ul className="space-y-4">
                    <li className="flex items-center gap-4">
                       <div className={`p-1 rounded-full bg-${c.color}-500/20 text-${c.color}-400`}>
                          <CheckCircle className="w-5 h-5" />
                       </div>
                       <span className="text-lg">{t('landing.demo.list.darkMode')}</span>
                    </li>
                    <li className="flex items-center gap-4">
                       <div className={`p-1 rounded-full bg-${c.color}-500/20 text-${c.color}-400`}>
                          <CheckCircle className="w-5 h-5" />
                       </div>
                       <span className="text-lg">{t('landing.demo.list.offline')}</span>
                    </li>
                    <li className="flex items-center gap-4">
                       <div className={`p-1 rounded-full bg-${c.color}-500/20 text-${c.color}-400`}>
                           <CheckCircle className="w-5 h-5" />
                       </div>
                       <span className="text-lg">{t('landing.demo.list.multilang')}</span>
                    </li>
                 </ul>
              </div>
              <div className="relative">
                 <div className="absolute inset-0 bg-gradient-to-tr from-white/10 to-transparent rounded-2xl transform rotate-3 scale-105"></div>
                 <div className="relative rounded-2xl overflow-hidden shadow-2xl bg-black/40 border border-white/10 backdrop-blur-md aspect-video flex flex-col items-center justify-center p-8 group cursor-default">
                    <span className="text-5xl md:text-6xl font-black text-white/5 uppercase tracking-widest group-hover:text-white/20 transition-colors duration-500">
                      {t('common.comingSoon') || 'DEMO'}
                    </span>
                    <p className="font-mono text-${c.color}-400 text-sm text-center px-4 mt-4 opacity-70">
                      {t('landing.demo.placeholder')}
                    </p>
                 </div>
              </div>
           </div>
        </section>

      </main>
      
      <DownloadModal isOpen={isDownloadModalOpen} onClose={() => setIsDownloadModalOpen(false)} />
      </div>
    </LanguageAnimationWrapper>
  );
};

interface FeatureContentProps {
  icon: React.ElementType;
  title: string;
  desc: string;
  color: string;
}

// Helper for card content consistency
const FeatureContent = ({ icon: Icon, title, desc, color }: FeatureContentProps) => (
  <div className="h-full flex flex-col items-start text-start">
    <div className={`w-12 h-12 rounded-2xl bg-${color}-500/10 flex items-center justify-center text-${color}-600 dark:text-${color}-400 mb-6`}>
       <Icon className="w-6 h-6" />
    </div>
    <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-3">{title}</h3>
    <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-sm">
       {desc}
    </p>
  </div>
);

export default SolutionPage;
