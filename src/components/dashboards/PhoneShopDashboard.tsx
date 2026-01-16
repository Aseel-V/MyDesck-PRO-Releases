import { Smartphone } from "lucide-react";

export default function PhoneShopDashboard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 animate-fadeIn">
      <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 mb-6 dark:bg-blue-900/20 dark:text-blue-400">
        <Smartphone size={40} />
      </div>
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
        Phone Shop Dashboard
      </h1>
      <p className="text-slate-500 max-w-md mx-auto dark:text-slate-400">
        Manage devices, repairs, and accessories. Coming soon to MyDesck PRO.
      </p>
    </div>
  );
}
