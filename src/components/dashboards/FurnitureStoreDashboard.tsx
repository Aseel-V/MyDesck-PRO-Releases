import { Armchair } from "lucide-react";

export default function FurnitureStoreDashboard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 animate-fadeIn">
      <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 mb-6 dark:bg-amber-900/20 dark:text-amber-400">
        <Armchair size={40} />
      </div>
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
        Home Furniture Store
      </h1>
      <p className="text-slate-500 max-w-md mx-auto dark:text-slate-400">
        Manage furniture catalog, deliveries, and stock. This module is under development.
      </p>
    </div>
  );
}
