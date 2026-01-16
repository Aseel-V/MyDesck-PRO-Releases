import { ShoppingCart } from "lucide-react";

export default function SupermarketDashboard() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8 animate-fadeIn">
      <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center text-green-600 mb-6 dark:bg-green-900/20 dark:text-green-400">
        <ShoppingCart size={40} />
      </div>
      <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-2">
        Supermarket Dashboard
      </h1>
      <p className="text-slate-500 max-w-md mx-auto dark:text-slate-400">
        Track inventory, sales, and products. This module is currently under development.
      </p>
    </div>
  );
}
