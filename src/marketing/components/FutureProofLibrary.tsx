export interface TestimonialProof { quote: string; personName: string; role: string; organization: string; verified: boolean }
export interface CaseStudyProof { title: string; organization: string; summary: string; href: string; verified: boolean }
export interface CustomerLogoProof { organization: string; imageUrl: string; permissionConfirmed: boolean }

interface FutureProofLibraryProps {
  testimonials?: readonly TestimonialProof[];
  caseStudies?: readonly CaseStudyProof[];
  customerLogos?: readonly CustomerLogoProof[];
}

/**
 * Reserved renderer boundary for verified social proof. It intentionally stays
 * hidden until at least one supplied item is both real and explicitly cleared.
 */
export function FutureProofLibrary({ testimonials = [], caseStudies = [], customerLogos = [] }: FutureProofLibraryProps) {
  const verifiedTestimonials = testimonials.filter((item) => item.verified);
  const verifiedCases = caseStudies.filter((item) => item.verified);
  const permittedLogos = customerLogos.filter((item) => item.permissionConfirmed);
  if (!verifiedTestimonials.length && !verifiedCases.length && !permittedLogos.length) return null;
  return (
    <section aria-label="Customer evidence" className="border-y border-slate-200 bg-white py-12">
      <div className="mx-auto grid w-full max-w-[80rem] gap-6 px-5 sm:px-8 lg:grid-cols-3 lg:px-10">
        {verifiedTestimonials.map((item) => <blockquote key={`${item.organization}-${item.personName}`} className="rounded-2xl border border-slate-200 p-6"><p className="text-sm leading-7 text-slate-700">“{item.quote}”</p><footer className="mt-4 text-xs font-semibold text-slate-500"><bdi>{item.personName}</bdi> · <bdi>{item.role}</bdi>, <bdi>{item.organization}</bdi></footer></blockquote>)}
        {verifiedCases.map((item) => <a key={item.href} href={item.href} className="rounded-2xl border border-slate-200 p-6 hover:border-sky-300"><strong className="text-slate-950"><bdi>{item.title}</bdi></strong><p className="mt-2 text-sm leading-6 text-slate-600"><bdi>{item.summary}</bdi></p></a>)}
        {permittedLogos.map((item) => <div key={item.organization} className="flex min-h-24 items-center justify-center rounded-2xl border border-slate-200 p-6"><img src={item.imageUrl} alt={item.organization} className="max-h-10 max-w-40 object-contain" /></div>)}
      </div>
    </section>
  );
}
