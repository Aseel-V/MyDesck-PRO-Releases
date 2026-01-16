import { Shirt } from "lucide-react";

export default function ClothesShopDashboard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 animate-fadeIn">
      <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center text-pink-600 mb-6 dark:bg-pink-900/20 dark:text-pink-400">
        <Shirt size={40} />
      </div>
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
        Clothes Shop Dashboard
      </h1>
      <p className="text-slate-500 max-w-md mx-auto dark:text-slate-400">
        Manage your clothing inventory, sizes, and collections. Coming soon.
      </p>
    </div>
  );
}
