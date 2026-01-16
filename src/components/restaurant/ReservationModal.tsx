
import { useState, useEffect } from 'react';
import { 
  X, 
  Users, 
  Phone, 
  ArrowRight, 
  Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useLanguage } from '../../contexts/LanguageContext';
import { GuestProfile } from '../../types/restaurant';

import { toast } from 'sonner';

interface ReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  selectedDate: Date;
  guestSuggestions: GuestProfile[];
  onSearchGuests: (query: string) => void;
  serverOffset?: number;
}

export default function ReservationModal({
  isOpen,
  onClose,
  onSubmit,
  selectedDate,
  guestSuggestions,
  onSearchGuests,
  serverOffset = 0,
}: ReservationModalProps) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    guest_name: '',
    guest_phone: '',
    party_size: 2,
    date: new Date(selectedDate).toISOString().split('T')[0],
    time: '19:00', // Default
    duration_minutes: 90,
    source: 'phone',
    notes: '',
    special_requests: '',
    tags: [] as string[]
  });

  // Reset when opening
  useEffect(() => {
    if (isOpen) {
        setStep(1);
        const now = new Date();
        setFormData(prev => ({
            ...prev,
            date: new Date(selectedDate).toISOString().split('T')[0],
            time: `${String((now.getHours() + 1) % 24).padStart(2, '0')}:00`
        }));
    }
  }, [isOpen, selectedDate]);

  const handleNext = () => setStep(p => p + 1);
  const handleBack = () => setStep(p => p - 1);

  const handleSubmit = async () => {
      // Validate past date
      const serverNow = new Date(Date.now() + serverOffset);
      const selectedDateTime = new Date(`${formData.date}T${formData.time}`);
      
      if (selectedDateTime < serverNow) {
          toast.error(t('reservationsBoard.errorPastTime'));
          return;
      }

      setIsSubmitting(true);
      try {
          // Combine date and time
          const [hours, minutes] = formData.time.split(':');
          const date = new Date(formData.date);
          date.setHours(parseInt(hours), parseInt(minutes));
          
          await onSubmit({
              ...formData,
              reservation_time: date.toISOString()
          });
          onClose();
      } catch (e) {
          console.error(e);
      } finally {
          setIsSubmitting(false);
      }
  };

  const selectGuest = (guest: GuestProfile) => {
      setFormData(prev => ({
          ...prev,
          guest_name: guest.full_name,
          guest_phone: guest.phone || '',
          // Could pre-fill other info
      }));
      // Auto advance
      // setStep(2); 
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <div>
                <h2 className="text-xl font-bold dark:text-white">{t('reservationsBoard.newReservation')}</h2>
                <div className="flex gap-1 mt-1">
                    {[1, 2, 3].map(i => (
                        <div key={i} className={`h-1 w-8 rounded-full transition-colors ${step >= i ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-700'}`} />
                    ))}
                </div>
            </div>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                <X size={20} className="dark:text-slate-400" />
            </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto overflow-x-hidden">
            <AnimatePresence mode="wait">
            {/* STEP 1: GUEST INFO */}
            {step === 1 && (
                <motion.div 
                    key="step1"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                >
                    <h3 className="font-medium text-slate-500 uppercase text-xs tracking-wider mb-4">{t('reservationsBoard.step1Title')}</h3>
                    
                    <div className="relative">
                        <label className="block text-sm font-medium mb-1 dark:text-slate-300">{t('reservationsBoard.phoneNumber')}</label>
                        <div className="relative">
                            <Phone size={16} className="absolute left-3 top-3 text-slate-400" />
                            <input 
                                autoFocus
                                type="tel" 
                                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                                value={formData.guest_phone}
                                onChange={e => {
                                    setFormData({...formData, guest_phone: e.target.value});
                                    onSearchGuests(e.target.value);
                                }}
                                placeholder="050-000-0000"
                            />
                        </div>
                        {/* Suggestions */}
                        {guestSuggestions.length > 0 && formData.guest_phone.length > 2 && (
                             <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-lg">
                                 {guestSuggestions.map(g => (
                                     <button 
                                        key={g.id} 
                                        onClick={() => selectGuest(g)} 
                                        className="w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 flex justify-between items-center border-b last:border-0 dark:border-slate-700 transition-colors"
                                     >
                                         <div className="flex items-center gap-3">
                                             <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold">
                                                 {g.full_name.charAt(0)}
                                             </div>
                                             <div>
                                                 <div className="font-bold dark:text-white flex items-center gap-2">
                                                     {g.full_name}
                                                     {g.vip_level > 0 && (
                                                         <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                                             g.vip_level === 3 ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'
                                                         }`}>
                                                             VIP {g.vip_level}
                                                         </span>
                                                     )}
                                                 </div>
                                                 <div className="text-xs text-slate-500">{g.phone || ''}</div>
                                             </div>
                                         </div>
                                         <div className="text-right">
                                             <div className="text-xs font-bold text-slate-400 uppercase tracking-tighter">Visits</div>
                                             <div className="text-sm font-bold text-slate-700 dark:text-slate-300">{g.visit_count || 0}</div>
                                         </div>
                                     </button>
                                 ))}
                             </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 dark:text-slate-300">{t('reservationsBoard.guestName')}</label>
                        <div className="relative">
                            <Users size={16} className="absolute left-3 top-3 text-slate-400" />
                            <input 
                                type="text"
                                className="w-full pl-10 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 dark:text-white focus:ring-2 focus:ring-blue-500"
                                value={formData.guest_name}
                                onChange={e => setFormData({...formData, guest_name: e.target.value})}
                                placeholder="John Doe"
                            />
                        </div>
                    </div>
                </motion.div>
            )}

            {/* STEP 2: DETAILS */}
            {step === 2 && (
                <motion.div
                    key="step2"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-6"
                >
                     <h3 className="font-medium text-slate-500 uppercase text-xs tracking-wider mb-4">{t('reservationsBoard.step2Title')}</h3>
                     
                     {/* Party Size */}
                     <div>
                        <label className="block text-sm font-medium mb-2 dark:text-slate-300">{t('reservationsBoard.partySizeLabel')}</label>
                        <div className="grid grid-cols-5 gap-2">
                            {[1,2,3,4,5,6,7,8,9,10].map(num => (
                                <button
                                    key={num}
                                    onClick={() => setFormData({...formData, party_size: num})}
                                    className={`py-2 rounded-lg font-bold transition-colors ${
                                        formData.party_size === num 
                                        ? 'bg-blue-500 text-white shadow-md' 
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                    }`}
                                >
                                    {num}{num === 10 ? '+' : ''}
                                </button>
                            ))}
                        </div>
                     </div>

                     {/* Date & Time & Duration */}
                     <div className="grid grid-cols-1 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-1 dark:text-slate-300">{t('reservationsBoard.startDate') || 'Date'}</label>
                            <input 
                                type="date"
                                min={new Date().toISOString().split('T')[0]}
                                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                value={formData.date}
                                onChange={e => setFormData({...formData, date: e.target.value})}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-slate-300">{t('reservationsBoard.time')}</label>
                                <input 
                                    type="time"
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                    value={formData.time}
                                    onChange={e => setFormData({...formData, time: e.target.value})}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium mb-1 dark:text-slate-300">{t('reservationsBoard.duration')}</label>
                                <select 
                                    className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                                    value={formData.duration_minutes}
                                    onChange={e => setFormData({...formData, duration_minutes: Number(e.target.value)})}
                                >
                                    <option value={60}>60 min</option>
                                    <option value={90}>90 min</option>
                                    <option value={120}>120 min</option>
                                    <option value={180}>180 min</option>
                                </select>
                            </div>
                        </div>
                     </div>
                </motion.div>
            )}

            {/* STEP 3: EXTRAS */}
            {step === 3 && (
                <motion.div
                    key="step3"
                    initial={{ x: 20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    exit={{ x: -20, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="space-y-4"
                >
                     <h3 className="font-medium text-slate-500 uppercase text-xs tracking-wider mb-4">{t('reservationsBoard.step3Title')}</h3>
                     
                     <div>
                         <label className="block text-sm font-medium mb-1 dark:text-slate-300">{t('reservationsBoard.source')}</label>
                         <div className="grid grid-cols-2 gap-2">
                             {['phone', 'website', 'walk_in', 'whatsapp'].map(src => (
                                 <button
                                    key={src}
                                    onClick={() => setFormData({...formData, source: src})}
                                    className={`py-2 px-3 rounded-lg border text-sm font-medium transition-colors ${
                                        formData.source === src
                                        ? 'bg-blue-50 border-blue-500 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                                    }`}
                                 >
                                    {t(`reservationsBoard.sources.${src}` as any)}
                                 </button>
                             ))}
                         </div>
                     </div>

                     <div>
                        <label className="block text-sm font-medium mb-1 dark:text-slate-300">{t('reservationsBoard.notes')}</label>
                        <textarea 
                            className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 dark:text-white h-20 resize-none"
                            placeholder="Allergies, seating preference..."
                            value={formData.notes}
                            onChange={e => setFormData({...formData, notes: e.target.value})}
                        />
                     </div>
                </motion.div>
            )}
            </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex justify-between gap-3">
             {step > 1 ? (
                 <button onClick={handleBack} className="px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg font-medium text-slate-600 dark:text-slate-400">
                     {t('common.back')}
                 </button>
             ) : (
                 <div /> // Spacer
             )}

             {step < 3 ? (
                 <button 
                    onClick={handleNext}
                    disabled={!formData.guest_name || !formData.guest_phone} 
                    className="px-6 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-bold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                 >
                     {t('common.next')}
                     <ArrowRight size={18} />
                 </button>
             ) : (
                 <button 
                    onClick={handleSubmit} 
                    disabled={isSubmitting}
                    className="px-6 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-bold flex items-center gap-2"
                 >
                     {isSubmitting ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                     ) : (
                        <Check size={18} />
                     )}
                     {t('reservationsBoard.createReservation')}
                 </button>
             )}
        </div>

      </div>
    </div>
  );
}
