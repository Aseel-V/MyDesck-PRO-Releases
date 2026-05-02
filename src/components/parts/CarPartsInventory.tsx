import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Search, Package, Edit2, Trash2, Car, Hash, 
  FileText, Loader2, AlertCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useCurrency } from '../../contexts/CurrencyContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { CarPart, CarPartInput } from '../../types/carParts';
import PartFormModal from './PartFormModal';
import { toast } from 'sonner';

export default function CarPartsInventory() {
  const { profile } = useAuth();
  const { format } = useCurrency();
  const { t, direction } = useLanguage();
  const [parts, setParts] = useState<CarPart[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'inStock' | 'lowStock' | 'outOfStock'>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPart, setEditingPart] = useState<CarPart | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      fetchParts();
    }
  }, [profile?.id]);

  const fetchParts = async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      // @ts-ignore - car_parts table will be added after migration
      const { data, error } = await supabase
        .from('car_parts')
        .select('*')
        .eq('business_id', profile.id)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setParts((data as unknown as CarPart[]) || []);
    } catch (error) {
      console.error('Error fetching parts:', error);
      toast.error(t('carParts.errorLoading'));
    } finally {
      setLoading(false);
    }
  };

  const handleAddPart = async (partData: CarPartInput) => {
    if (!profile?.id) return;
    try {
      // @ts-ignore - car_parts table will be added after migration
      const { data, error } = await supabase
        .from('car_parts')
        .insert({ ...partData, business_id: profile.id })
        .select()
        .single();
      
      if (error) throw error;
      setParts([(data as unknown as CarPart), ...parts]);
      toast.success(t('carParts.addSuccess'));
      setShowAddModal(false);
    } catch (error) {
      console.error('Error adding part:', error);
      toast.error(t('carParts.errorSaving'));
    }
  };

  const handleUpdatePart = async (id: string, partData: CarPartInput) => {
    try {
      // @ts-ignore - car_parts table will be added after migration
      const { data, error } = await supabase
        .from('car_parts')
        .update(partData)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      setParts(parts.map(p => p.id === id ? (data as unknown as CarPart) : p));
      toast.success(t('carParts.updateSuccess'));
      setEditingPart(null);
    } catch (error) {
      console.error('Error updating part:', error);
      toast.error(t('carParts.errorSaving'));
    }
  };

  const handleDeletePart = async (id: string) => {
    try {
      // @ts-ignore - car_parts table will be added after migration
      const { error } = await supabase
        .from('car_parts')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
      setParts(parts.filter(p => p.id !== id));
      toast.success(t('carParts.deleteSuccess'));
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Error deleting part:', error);
      toast.error(t('carParts.errorDeleting'));
    }
  };

  const counts = {
    all: parts.length,
    inStock: parts.filter(p => (p.quantity || 0) > 5).length,
    lowStock: parts.filter(p => (p.quantity || 0) > 0 && (p.quantity || 0) <= 5).length,
    outOfStock: parts.filter(p => (p.quantity || 0) === 0).length,
  };

  const totalInventoryValue = parts.reduce((acc, part) => 
    acc + ((part.quantity || 0) * (part.purchase_price_unit || 0)), 0
  );

  const filteredParts = parts.filter(part => {
    const query = searchQuery.toLowerCase();
    const searchMatch = 
      part.part_name.toLowerCase().includes(query) ||
      part.serial_number?.toLowerCase().includes(query) ||
      part.description?.toLowerCase().includes(query) ||
      part.compatible_cars?.some(car => car.toLowerCase().includes(query));

    const quantity = part.quantity || 0;
    const filterMatch = 
      selectedFilter === 'all' ||
      (selectedFilter === 'inStock' && quantity > 5) ||
      (selectedFilter === 'lowStock' && quantity > 0 && quantity <= 5) ||
      (selectedFilter === 'outOfStock' && quantity === 0);

    return searchMatch && filterMatch;
  });

  const calculateProfit = (part: CarPart) => {
    if (!part.selling_price_unit || !part.purchase_price_unit) return null;
    return part.selling_price_unit - part.purchase_price_unit;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-slate-900 dark:text-white flex items-center gap-3">
            <Package className="w-8 h-8 text-sky-500" />
            {t('carParts.title')}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">
            {t('carParts.subtitle')}
          </p>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-shadow"
        >
          <Plus className="w-5 h-5" />
          {t('carParts.addPart')}
        </motion.button>
      </div>

      {/* Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('carParts.itemsCount')}</p>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{counts.all}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('carParts.totalValue')}</p>
          <p className="text-2xl font-black text-sky-600 dark:text-sky-400">{format(totalInventoryValue, 'ILS')}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md border-l-4 border-l-amber-500">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('carParts.lowStock')}</p>
          <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{counts.lowStock}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm transition-all hover:shadow-md border-l-4 border-l-rose-500">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1">{t('carParts.filters.outOfStock')}</p>
          <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{counts.outOfStock}</p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="space-y-4 mb-8">
        <div className="relative">
          <Search className={`absolute ${direction === 'rtl' ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400`} />
          <input
            type="text"
            placeholder={t('carParts.searchPlaceholder')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full ${direction === 'rtl' ? 'pr-12 pl-4' : 'pl-12 pr-4'} py-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500 outline-none transition-all shadow-sm`}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: t('carParts.filters.all'), count: counts.all, color: 'slate' },
            { id: 'inStock', label: t('carParts.filters.inStock'), count: counts.inStock, color: 'emerald' },
            { id: 'lowStock', label: t('carParts.filters.lowStock'), count: counts.lowStock, color: 'amber' },
            { id: 'outOfStock', label: t('carParts.filters.outOfStock'), count: counts.outOfStock, color: 'rose' }
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setSelectedFilter(filter.id as any)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                selectedFilter === filter.id
                  ? `bg-${filter.color}-500 text-white shadow-lg ring-2 ring-${filter.color}-500/20`
                  : `bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-${filter.color}-500 dark:hover:border-${filter.color}-500`
              }`}
            >
              {filter.label}
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] ${
                selectedFilter === filter.id 
                  ? 'bg-white/20 text-white' 
                  : `bg-${filter.color}-100 dark:bg-${filter.color}-900/30 text-${filter.color}-600 dark:text-${filter.color}-400`
              }`}>
                {filter.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Parts Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 text-sky-500 animate-spin" />
        </div>
      ) : filteredParts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
            <Package className="w-10 h-10 text-slate-300 dark:text-slate-600" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{t('carParts.noParts')}</h3>
          <p className="text-slate-500 dark:text-slate-400 mt-1 max-w-xs mx-auto">
            {searchQuery || selectedFilter !== 'all' 
              ? t('carParts.errorLoading').split(' ')[0] + ' ' + t('carParts.noParts').toLowerCase()
              : t('carParts.addFirst')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {filteredParts.map((part) => (
              <motion.div
                key={part.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-xl transition-shadow group"
              >
                {/* Part Header */}
                <div className="p-4 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-slate-50 to-white dark:from-slate-800 dark:to-slate-900">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg text-slate-900 dark:text-white truncate">{part.part_name}</h3>
                      {part.serial_number && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-mono flex items-center gap-1 mt-0.5">
                          <Hash className="w-3 h-3" />
                          {part.serial_number}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => setEditingPart(part)}
                        className="p-2 text-slate-400 hover:text-sky-500 hover:bg-sky-50 dark:hover:bg-sky-900/20 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(part.id)}
                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Part Details */}
                <div className="p-4 space-y-3">
                  {part.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">
                      <FileText className="w-3.5 h-3.5 inline mr-1 text-slate-400" />
                      {part.description}
                    </p>
                  )}

                  {/* Quantity Badge */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">{t('carParts.quantity')}</span>
                    <span className={`px-3 py-1 rounded-full text-sm font-bold ${
                      part.quantity > 5 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                      part.quantity > 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                      'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
                    }`}>
                      {part.quantity} units
                    </span>
                  </div>

                  {/* Prices */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-700">
                    <div className="text-center p-2 bg-slate-50 dark:bg-slate-900/50 rounded-lg">
                      <p className="text-xs text-slate-500 mb-0.5">{t('carParts.purchasePriceUnit').split(' (')[0]}</p>
                      <p className="font-bold text-slate-700 dark:text-slate-300">
                        {part.purchase_price_unit ? format(part.purchase_price_unit, 'ILS') : '-'}
                      </p>
                    </div>
                    <div className="text-center p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                      <p className="text-xs text-slate-500 mb-0.5">{t('carParts.sellingPriceUnit').split(' (')[0]}</p>
                      <p className="font-bold text-emerald-600 dark:text-emerald-400">
                        {part.selling_price_unit ? format(part.selling_price_unit, 'ILS') : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Profit */}
                  {calculateProfit(part) !== null && (
                    <div className="text-center p-2 bg-sky-50 dark:bg-sky-900/20 rounded-lg">
                      <p className="text-xs text-slate-500 mb-0.5">{t('trips.profit')}</p>
                      <p className="font-bold text-sky-600 dark:text-sky-400">
                        {format(calculateProfit(part)!, 'ILS')}
                      </p>
                    </div>
                  )}

                  {/* Compatible Cars */}
                  {part.compatible_cars && part.compatible_cars.length > 0 && (
                    <div className="pt-2">
                      <p className="text-xs text-slate-500 mb-1.5 flex items-center gap-1">
                        <Car className="w-3 h-3" /> {t('carParts.compatibleCars')}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {part.compatible_cars.slice(0, 3).map((car, i) => (
                          <span key={i} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs rounded-md">
                            {car}
                          </span>
                        ))}
                        {part.compatible_cars.length > 3 && (
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 text-xs rounded-md">
                            +{part.compatible_cars.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Delete Confirmation */}
      <AnimatePresence>
        {deleteConfirm && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirm(null)}
              className="fixed inset-0 bg-black/50 z-50"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white dark:bg-slate-800 rounded-2xl p-6 shadow-2xl max-w-sm w-full mx-4"
            >
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center">
                  <AlertCircle className="w-6 h-6 text-rose-600" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">{t('carParts.deletePart')}?</h3>
                <p className="text-slate-500 dark:text-slate-400 mb-6">{t('carParts.confirmDelete')}</p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    className="flex-1 px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                  >
                    {t('carParts.cancel')}
                  </button>
                  <button
                    onClick={() => handleDeletePart(deleteConfirm)}
                    className="flex-1 px-4 py-2 bg-rose-500 text-white rounded-xl font-bold hover:bg-rose-600 transition-colors"
                  >
                    {t('trips.delete')}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Add/Edit Modals */}
      <PartFormModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddPart}
      />

      <PartFormModal
        isOpen={!!editingPart}
        onClose={() => setEditingPart(null)}
        initialData={editingPart || undefined}
        onSubmit={(data) => editingPart && handleUpdatePart(editingPart.id, data)}
      />
    </div>
  );
}
