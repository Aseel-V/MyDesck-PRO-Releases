import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Hash, Car, FileText, Plus, Minus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../../contexts/LanguageContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { CarPart, CarPartInput } from '../../types/carParts';

interface PartFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: CarPartInput) => void;
  initialData?: CarPart;
}

export default function PartFormModal({ isOpen, onClose, onSubmit, initialData }: PartFormModalProps) {
  const { t, direction } = useLanguage();
  const { symbol } = useCurrency();
  const [formData, setFormData] = useState<CarPartInput>({
    part_name: '',
    description: '',
    serial_number: '',
    compatible_cars: [],
    quantity: 1,
    purchase_price_unit: undefined,
    purchase_price_total: undefined,
    selling_price_unit: undefined,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialData && isOpen) {
      setFormData({
        part_name: initialData.part_name,
        description: initialData.description || '',
        serial_number: initialData.serial_number || '',
        compatible_cars: initialData.compatible_cars || [],
        quantity: initialData.quantity,
        purchase_price_unit: initialData.purchase_price_unit || undefined,
        purchase_price_total: initialData.purchase_price_total || undefined,
        selling_price_unit: initialData.selling_price_unit || undefined,
      });
    } else if (isOpen) {
      setFormData({
        part_name: '',
        description: '',
        serial_number: '',
        compatible_cars: [],
        quantity: 1,
        purchase_price_unit: undefined,
        purchase_price_total: undefined,
        selling_price_unit: undefined,
      });
    }
  }, [initialData, isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.part_name.trim()) return;
    
    setLoading(true);
    try {
      await onSubmit(formData);
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999]"
          />
          
          <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 pointer-events-none overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md pointer-events-auto my-4 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-700">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Package className="w-5 h-5 text-sky-500" />
                  {initialData ? t('carParts.editPart') : t('carParts.addPart')}
                </h2>
                <button
                  onClick={onClose}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
                >
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {t('carParts.partName')} *
                  </label>
                  <div className="relative">
                    <div className={`absolute ${direction === 'rtl' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2`}>
                      <Package className="w-4 h-4 text-slate-400 dark:text-slate-300" />
                    </div>
                    <input
                      required
                      type="text"
                      value={formData.part_name}
                      onChange={(e) => setFormData({ ...formData, part_name: e.target.value })}
                      className={`w-full ${direction === 'rtl' ? 'pr-10 pl-3 text-right text-sm' : 'pl-10 pr-3 text-left text-sm'} py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 dark:placeholder-slate-500 outline-none transition-all`}
                      placeholder={t('carParts.partNamePlaceholder')}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {t('carParts.serialNumber')}
                    </label>
                    <div className="relative">
                      <div className={`absolute ${direction === 'rtl' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2`}>
                        <Hash className="w-4 h-4 text-slate-400 dark:text-slate-300" />
                      </div>
                      <input
                        type="text"
                        value={formData.serial_number || ''}
                        onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })}
                        className={`w-full ${direction === 'rtl' ? 'pr-10 pl-3 text-right text-sm' : 'pl-10 pr-3 text-left text-sm'} py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 dark:placeholder-slate-500 outline-none transition-all font-mono`}
                        placeholder={t('carParts.serialNumberPlaceholder')}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                      {t('carParts.quantity')}
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const newQty = Math.max(0, formData.quantity - 1);
                          setFormData({ 
                            ...formData, 
                            quantity: newQty,
                            purchase_price_total: (formData.purchase_price_unit || 0) * newQty
                          });
                        }}
                        className="p-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
                      >
                        <Minus className="w-4 h-4 text-slate-600 dark:text-slate-200" />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={formData.quantity}
                        onChange={(e) => {
                          const newQty = parseInt(e.target.value) || 0;
                          setFormData({ 
                            ...formData, 
                            quantity: newQty,
                            purchase_price_total: (formData.purchase_price_unit || 0) * newQty
                          });
                        }}
                        className="w-full py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl text-center font-bold text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          const newQty = formData.quantity + 1;
                          setFormData({ 
                            ...formData, 
                            quantity: newQty,
                            purchase_price_total: (formData.purchase_price_unit || 0) * newQty
                          });
                        }}
                        className="p-2.5 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-xl transition-colors"
                      >
                        <Plus className="w-4 h-4 text-slate-600 dark:text-slate-200" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-600">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {t('carParts.purchasePriceUnit').split(' (')[0]}
                    </label>
                    <div className="relative">
                      <div className={`absolute ${direction === 'rtl' ? 'right-2' : 'left-2'} top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex items-center justify-center text-slate-400 dark:text-slate-300 font-bold text-xs`}>
                        {symbol}
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.purchase_price_unit || ''}
                        onChange={(e) => setFormData({ 
                          ...formData, 
                          purchase_price_unit: parseFloat(e.target.value) || 0,
                          purchase_price_total: (parseFloat(e.target.value) || 0) * formData.quantity
                        })}
                        className={`w-full ${direction === 'rtl' ? 'pr-7 pl-1 text-right text-sm' : 'pl-7 pr-1 text-left text-sm'} py-1.5 bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-sky-500 dark:text-white outline-none transition-all font-bold`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      {t('carParts.purchasePriceTotal')}
                    </label>
                    <div className="relative">
                      <div className={`absolute ${direction === 'rtl' ? 'right-2' : 'left-2'} top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex items-center justify-center text-slate-400 dark:text-slate-300 font-bold text-xs`}>
                        {symbol}
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.purchase_price_total || ''}
                        onChange={(e) => {
                          const newTotal = parseFloat(e.target.value) || 0;
                          setFormData({ 
                            ...formData, 
                            purchase_price_total: newTotal,
                            purchase_price_unit: formData.quantity > 0 ? newTotal / formData.quantity : 0
                          });
                        }}
                        className={`w-full ${direction === 'rtl' ? 'pr-7 pl-1 text-right text-sm' : 'pl-7 pr-1 text-left text-sm'} py-1.5 bg-transparent border-b border-slate-200 dark:border-slate-700 focus:border-sky-500 dark:text-white outline-none transition-all font-bold text-slate-900 dark:text-slate-200`}
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
                      {t('carParts.sellingPriceUnit').split(' (')[0]}
                    </label>
                    <div className="relative">
                      <div className={`absolute ${direction === 'rtl' ? 'right-2' : 'left-2'} top-1/2 -translate-y-1/2 w-3.5 h-3.5 flex items-center justify-center text-sky-500 dark:text-sky-300 font-bold text-xs`}>
                        {symbol}
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formData.selling_price_unit || ''}
                        onChange={(e) => setFormData({ ...formData, selling_price_unit: parseFloat(e.target.value) || 0 })}
                        className={`w-full ${direction === 'rtl' ? 'pr-7 pl-1 text-right text-sm' : 'pl-7 pr-1 text-left text-sm'} py-1.5 bg-transparent border-b border-sky-200 dark:border-sky-800 focus:border-sky-500 outline-none transition-all font-bold text-sky-600 dark:text-sky-300`}
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {t('carParts.description')}
                  </label>
                  <div className="relative">
                    <div className={`absolute ${direction === 'rtl' ? 'right-3' : 'left-3'} top-2.5`}>
                      <FileText className="w-4 h-4 text-slate-400 dark:text-slate-300" />
                    </div>
                    <textarea
                      rows={2}
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      className={`w-full ${direction === 'rtl' ? 'pr-10 pl-3 text-right text-sm' : 'pl-10 pr-3 text-left text-sm'} py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 dark:placeholder-slate-500 outline-none transition-all resize-none`}
                      placeholder={t('carParts.descriptionPlaceholder')}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-200">
                    {t('carParts.compatibleCars')}
                  </label>
                  <div className="relative">
                    <div className={`absolute ${direction === 'rtl' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2`}>
                      <Car className="w-4 h-4 text-slate-400 dark:text-slate-300" />
                    </div>
                    <input
                      type="text"
                      value={formData.compatible_cars?.join(', ') || ''}
                      onChange={(e) => setFormData({ 
                        ...formData, 
                        compatible_cars: e.target.value.split(',').map(s => s.trim()).filter(s => s !== '') 
                      })}
                      className={`w-full ${direction === 'rtl' ? 'pr-10 pl-3 text-right text-sm' : 'pl-10 pr-3 text-left text-sm'} py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 dark:placeholder-slate-500 outline-none transition-all`}
                      placeholder={t('carParts.compatibleCarsPlaceholder')}
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-100 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 px-4 py-2.5 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold rounded-xl text-sm hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    {t('carParts.cancel')}
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 px-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold rounded-xl text-sm shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? t('common.saving') : (initialData ? t('carParts.savePart') : t('carParts.addPart'))}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
