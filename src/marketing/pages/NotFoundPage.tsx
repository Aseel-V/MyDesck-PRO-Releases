import { useMarketingLanguage } from '../content/MarketingLanguageContext';
import { MarketingButton, MarketingContainer, MarketingSection } from '../components/primitives';
import { NoIndexSEO } from '../seo/MarketingSEO';

export default function NotFoundPage() {
  const { copy, locale } = useMarketingLanguage();
  const title = locale === 'ar' ? 'الصفحة غير موجودة' : locale === 'he' ? 'העמוד לא נמצא' : 'Page not found';
  const description = locale === 'ar' ? 'هذا الرابط لا يشير إلى صفحة عامة متاحة.' : locale === 'he' ? 'הקישור אינו מפנה לעמוד ציבורי זמין.' : 'This link does not point to an available public page.';
  return <MarketingSection className="min-h-[55vh]"><NoIndexSEO path="/" /><MarketingContainer className="text-center"><p className="text-sm font-bold text-sky-800">404</p><h1 className="mt-4 text-4xl font-semibold text-slate-950">{title}</h1><p className="mx-auto mt-4 max-w-xl text-slate-600">{description}</p><MarketingButton to="/" className="mt-8">{copy.common.backHome}</MarketingButton></MarketingContainer></MarketingSection>;
}

