

import { motion } from 'framer-motion';
import { useCurrency } from '../../contexts/CurrencyContext';
import { AutoRepairOrder } from '../../types/autoRepair';
import { Calendar, Gauge, CreditCard, User } from 'lucide-react';

interface CarCardProps {
  order: AutoRepairOrder;
  onClick: () => void;
}

export default function CarCard({ order, onClick }: CarCardProps) {
  const { currency, format } = useCurrency();
  const vehicle = order.vehicle;

  // Status colors
  const statusStyles = {
    completed: { bg: 'bg-emerald-500', glow: 'shadow-emerald-500/60', text: 'text-emerald-400' },
    working: { bg: 'bg-sky-500', glow: 'shadow-sky-500/60', text: 'text-sky-400' },
    pending: { bg: 'bg-amber-500', glow: 'shadow-amber-500/60', text: 'text-amber-400' },
  };
  const status = statusStyles[order.status as keyof typeof statusStyles] || statusStyles.pending;

  return (
    <motion.div
      whileHover={{ y: -8, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="group relative cursor-pointer"
    >
      {/* === CAR FRONT VIEW CONTAINER === */}
      <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-b from-slate-200 via-slate-300 to-slate-400 dark:from-slate-700 dark:via-slate-800 dark:to-slate-900 border-2 border-slate-300/50 dark:border-slate-600/50 shadow-2xl transition-all duration-500">
        
        {/* === CAR SILHOUETTE ROOF (Top Curve) === */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[70%] h-6 bg-slate-400/50 dark:bg-slate-600/50 rounded-b-[100%]" />

        {/* === WINDSHIELD AREA === */}
        <div className="relative pt-8 px-6 pb-2">
          {/* Windshield Glass */}
          <div className="relative mx-auto w-[85%] h-14 bg-gradient-to-b from-slate-600/40 via-slate-500/30 to-slate-400/20 dark:from-slate-900/60 dark:via-slate-800/40 dark:to-slate-700/20 rounded-t-[2rem] border-t-2 border-x-2 border-slate-400/30 dark:border-slate-500/30">
            {/* Windshield Reflection */}
            <div className="absolute inset-0 bg-gradient-to-br from-white/30 via-transparent to-transparent rounded-t-[2rem]" />
            
            {/* Owner Name in Windshield */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center gap-1.5 opacity-80">
                <User className="w-3 h-3 text-slate-600 dark:text-slate-300" />
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">{vehicle?.owner_name || 'Owner'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* === HOOD SECTION === */}
        <div className="relative px-4 -mt-1">
          {/* Hood Surface with Car Model */}
          <div className="relative mx-auto w-full py-4 bg-gradient-to-b from-slate-300 via-slate-250 to-slate-350 dark:from-slate-750 dark:via-slate-800 dark:to-slate-850 rounded-lg">
            {/* Hood Lines */}
            <div className="absolute top-0 left-[25%] w-px h-full bg-gradient-to-b from-white/40 via-white/10 to-white/0" />
            <div className="absolute top-0 right-[25%] w-px h-full bg-gradient-to-b from-white/40 via-white/10 to-white/0" />
            
            {/* Car Model Badge */}
            <div className="text-center">
              <h3 className="text-xl font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight drop-shadow-md">
                {vehicle?.model || 'Unknown Model'}
              </h3>
            </div>

          </div>
        </div>

        {/* === HEADLIGHTS & GRILLE SECTION === */}
        <div className="relative px-3 py-3 flex items-center gap-2">
          
          {/* LEFT HEADLIGHT */}
          <div className="relative flex-shrink-0">
            {/* Headlight Housing */}
            <div className="w-14 h-10 bg-slate-900 rounded-l-[2rem] rounded-r-lg border-2 border-slate-700 relative overflow-hidden group-hover:shadow-[0_0_25px_rgba(56,189,248,0.8)] transition-shadow duration-300">
              {/* DRL Strip */}
              <div className="absolute top-1 left-1 right-1 h-1.5 bg-gradient-to-r from-sky-400 to-sky-300 rounded-full blur-[1px] opacity-90" />
              {/* Main LED Cluster */}
              <div className="absolute bottom-1.5 left-1.5 grid grid-cols-3 gap-0.5">
                <div className="w-2.5 h-2.5 bg-amber-300 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                <div className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
                <div className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
              </div>
              {/* Chrome Trim */}
              <div className="absolute inset-0 border border-slate-500/30 rounded-l-[2rem] rounded-r-lg" />
            </div>
          </div>

          {/* CENTER GRILLE */}
          <div className="flex-1 relative">
            {/* Grille Frame */}
            <div className="h-12 bg-slate-900/90 dark:bg-black/90 rounded-lg border-2 border-slate-700 dark:border-slate-600 overflow-hidden">
              {/* Horizontal Slats */}
              <div className="absolute inset-x-1 top-1.5 flex flex-col gap-1">
                <div className="h-1 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 rounded-full" />
                <div className="h-1.5 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 rounded-full" />
                <div className="h-1 bg-gradient-to-r from-slate-700 via-slate-600 to-slate-700 rounded-full" />
              </div>
              
              {/* Center Brand Emblem */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-gradient-to-br from-slate-300 via-slate-400 to-slate-500 rounded-full border-2 border-slate-600 flex items-center justify-center shadow-lg">
                  <div className="w-4 h-4 bg-gradient-to-br from-slate-600 to-slate-800 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT HEADLIGHT */}
          <div className="relative flex-shrink-0">
            {/* Headlight Housing */}
            <div className="w-14 h-10 bg-slate-900 rounded-r-[2rem] rounded-l-lg border-2 border-slate-700 relative overflow-hidden group-hover:shadow-[0_0_25px_rgba(56,189,248,0.8)] transition-shadow duration-300">
              {/* DRL Strip */}
              <div className="absolute top-1 left-1 right-1 h-1.5 bg-gradient-to-l from-sky-400 to-sky-300 rounded-full blur-[1px] opacity-90" />
              {/* Main LED Cluster */}
              <div className="absolute bottom-1.5 right-1.5 grid grid-cols-3 gap-0.5">
                <div className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
                <div className="w-2.5 h-2.5 bg-white rounded-full shadow-[0_0_10px_rgba(255,255,255,0.9)]" />
                <div className="w-2.5 h-2.5 bg-amber-300 rounded-full shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
              </div>
              {/* Chrome Trim */}
              <div className="absolute inset-0 border border-slate-500/30 rounded-r-[2rem] rounded-l-lg" />
            </div>
          </div>
        </div>

        {/* === LICENSE PLATE (BUMPER AREA) === */}
        <div className="relative px-4 pb-4 flex justify-center">
          <div className="relative transform transition-transform duration-300 group-hover:scale-105">
            {/* Israeli License Plate */}
            <div className="flex items-stretch bg-[#FFCC00] rounded-md border-[3px] border-slate-900/80 shadow-[0_4px_15px_rgba(0,0,0,0.4)] w-[200px] h-[44px] overflow-hidden">
              {/* IL Blue Strip */}
              <div className="w-[36px] bg-[#003399] flex flex-col items-center justify-center border-r border-slate-900/20">
                <div className="w-3 h-3 rounded-full border border-white/50 flex items-center justify-center mb-0.5">
                  <div className="w-1.5 h-1.5 border border-white/70 rounded-full" />
                </div>
                <span className="text-white font-bold text-[9px]">IL</span>
              </div>
              {/* Plate Number */}
              <div className="flex-1 flex items-center justify-center bg-[#FFCC00]">
                <span className="font-mono font-black text-xl text-slate-900 tracking-wider drop-shadow-sm">
                  {vehicle?.plate_number ? (
                    vehicle.plate_number.length === 7 
                      ? `${vehicle.plate_number.slice(0,2)}-${vehicle.plate_number.slice(2,5)}-${vehicle.plate_number.slice(5)}`
                      : vehicle.plate_number.length === 8
                        ? `${vehicle.plate_number.slice(0,3)}-${vehicle.plate_number.slice(3,5)}-${vehicle.plate_number.slice(5)}`
                        : vehicle.plate_number
                  ) : '00-000-00'}
                </span>
              </div>
            </div>
            
            {/* Plate Mounting Screws */}
            <div className="absolute top-1/2 -translate-y-1/2 left-10 w-1.5 h-1.5 bg-slate-600 rounded-full border border-slate-400" />
            <div className="absolute top-1/2 -translate-y-1/2 right-3 w-1.5 h-1.5 bg-slate-600 rounded-full border border-slate-400" />
          </div>
        </div>

        {/* === LOWER BUMPER / INFO DASHBOARD === */}
        <div className="relative bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-t-2 border-slate-300/50 dark:border-slate-700/50 p-4">
          
          {/* Status Badge (Engine Start Button Style) */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2">
            <div className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${status.bg} ${status.glow} shadow-lg text-white border border-white/20`}>
              <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
              {order.status}
            </div>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            
            {/* Odometer */}
            <div className="flex flex-col items-center justify-center p-2.5 bg-slate-100 dark:bg-slate-800/60 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
              <span className="text-[8px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider mb-1">KM</span>
              <div className="flex items-center gap-1">
                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-sm font-mono font-bold text-slate-800 dark:text-slate-100">{order.odometer_reading?.toLocaleString() ?? '-'}</span>
              </div>
            </div>
            
            {/* Total Cost */}
            <div className="flex flex-col items-center justify-center p-2.5 bg-slate-100 dark:bg-slate-800/60 rounded-xl border border-slate-200/50 dark:border-slate-700/50">
              <span className="text-[8px] text-slate-500 dark:text-slate-400 uppercase font-bold tracking-wider mb-1">Cost</span>
              <div className="flex items-center gap-1">
                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{format(order.total_amount, currency)}</span>
              </div>
            </div>

          </div>

          {/* Date Footer */}
          <div className="flex items-center justify-center gap-1.5 mt-3 pt-2 border-t border-slate-200/50 dark:border-slate-700/50 text-slate-500 dark:text-slate-400">
            <Calendar className="w-3 h-3" />
            <span className="text-[10px] font-medium">{new Date(order.created_at).toLocaleDateString()}</span>
          </div>
        </div>

      </div>
    </motion.div>
      
  );
}
