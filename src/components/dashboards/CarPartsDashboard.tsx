import { Wrench } from "lucide-react";

export default function CarPartsDashboard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 animate-fadeIn">
      <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center text-slate-600 mb-6 dark:bg-slate-800 dark:text-slate-400">
        <Wrench size={40} />
      </div>
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
        Car Parts Dashboard
      </h1>
      <p className="text-slate-500 max-w-md mx-auto dark:text-slate-400">
        Inventory management for auto parts and accessories. This feature is coming soon.
      </p>
    </div>
  );
}
