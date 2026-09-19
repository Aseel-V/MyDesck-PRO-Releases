import { Cloud, FileKey2, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import FloatingHeader from '../components/FloatingHeader';
import LanguageAnimationWrapper from '../components/LanguageAnimationWrapper';
import SEO from '../components/SEO';
import { useLanguage } from '../contexts/LanguageContext';

const content = {
  en: {
    title: 'Security and data access',
    intro: 'MyDesck PRO uses authenticated cloud access with business-aware data boundaries.',
    items: [
      ['Identity and sessions', 'Firebase Authentication provides sign-in, session handling, and password recovery.'],
      ['Business records', 'Operational data is stored in Firestore and accessed through tenant-aware authorization.'],
      ['Private assets', 'Private business files use authenticated storage access through the production storage layer.'],
      ['Confirmed writes', 'Production writes are confirmed by the server before the application reports success.'],
    ],
    note: 'MyDesck PRO is a cloud-connected product and requires online services for production workflows.',
  },
  ar: {
    title: 'الأمان والوصول إلى البيانات',
    intro: 'يستخدم MyDesck PRO وصولًا سحابيًا موثّقًا مع حدود بيانات واعية بكل نشاط.',
    items: [
      ['الهوية والجلسات', 'توفر Firebase Authentication تسجيل الدخول وإدارة الجلسات واستعادة كلمة المرور.'],
      ['سجلات النشاط', 'تخزن البيانات التشغيلية في Firestore وتصل عبر صلاحيات خاصة بكل نشاط.'],
      ['الأصول الخاصة', 'تستخدم ملفات النشاط الخاصة وصولًا موثّقًا عبر طبقة التخزين الإنتاجية.'],
      ['الكتابة المؤكدة', 'تؤكد الخوادم عمليات الكتابة قبل أن يعرض التطبيق نجاحها.'],
    ],
    note: 'MyDesck PRO منتج متصل بالسحابة، ولا يوصف بأنه محلي فقط أو بلا خوادم أو يعمل 100% دون اتصال.',
  },
  he: {
    title: 'אבטחה וגישה לנתונים',
    intro: 'MyDesck PRO משתמש בגישה מאומתת לענן ובגבולות נתונים מודעי-עסק.',
    items: [
      ['זהות וסשנים', 'Firebase Authentication מספק כניסה, ניהול סשן ואיפוס סיסמה.'],
      ['רשומות עסק', 'נתונים תפעוליים נשמרים ב-Firestore ונגישים באמצעות הרשאות מודעות לעסק.'],
      ['נכסים פרטיים', 'קבצים עסקיים פרטיים משתמשים בגישה מאומתת דרך שכבת האחסון לייצור.'],
      ['כתיבות מאושרות', 'כתיבות לייצור מאושרות בשרת לפני שהאפליקציה מדווחת על הצלחה.'],
    ],
    note: 'MyDesck PRO הוא מוצר מחובר לענן. הוא אינו מתואר כמקומי בלבד, ללא שרתים או 100% אופליין.',
  },
} as const;

const icons = [KeyRound, Cloud, FileKey2, RefreshCw];

export default function SafetySupportPage() {
  const { language, direction } = useLanguage();
  const page = content[language];
  return (
    <LanguageAnimationWrapper>
      <div className="min-h-screen bg-slate-50 text-slate-950 dark:bg-slate-950 dark:text-white" dir={direction}>
        <SEO title={page.title} description={page.intro} canonical="/security" />
        <FloatingHeader />
        <main className="mx-auto max-w-6xl px-5 pb-20 pt-28 sm:px-8 md:pt-36">
          <div className="max-w-3xl"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300"><ShieldCheck className="h-6 w-6" aria-hidden="true" /></div><h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">{page.title}</h1><p className="mt-5 text-lg leading-8 text-slate-600 dark:text-slate-300">{page.intro}</p></div>
          <div className="mt-10 grid gap-5 md:grid-cols-2">{page.items.map(([title, description], index) => { const Icon = icons[index]; return <section key={title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"><Icon className="h-5 w-5 text-sky-700 dark:text-sky-300" aria-hidden="true" /><h2 className="mt-5 text-xl font-bold">{title}</h2><p className="mt-2 text-sm leading-7 text-slate-600 dark:text-slate-300">{description}</p></section>; })}</div>
          <p className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{page.note}</p>
        </main>
      </div>
    </LanguageAnimationWrapper>
  );
}
