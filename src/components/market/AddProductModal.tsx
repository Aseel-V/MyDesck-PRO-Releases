import { useState, useRef, useEffect } from 'react';
import { X, Package, Scale, Camera, Barcode, ScanBarcode } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

import { MenuItem } from '../../types/restaurant';

interface AddProductModalProps {
  onClose: () => void;
  onSuccess: () => void;
  product?: MenuItem | null;
  initialBarcode?: string;
}

const DEFAULT_CATEGORIES = [
  { name: "General", nameHe: "כללי", sort_order: 0 },
  { name: "Dairy", nameHe: "מוצרי חלב", sort_order: 1 },
  { name: "Bakery", nameHe: "מאפים", sort_order: 2 },
  { name: "Produce", nameHe: "ירקות ופירות", sort_order: 3 },
  { name: "Meat", nameHe: "בשר", sort_order: 4 },
  { name: "Beverages", nameHe: "משקאות", sort_order: 5 },
  { name: "Pantry", nameHe: "מזון יבש", sort_order: 6 },
  { name: "Cleaning", nameHe: "מוצרי ניקוי", sort_order: 7 },
];

import { useLanguage } from '../../contexts/LanguageContext';

export default function AddProductModal({ onClose, onSuccess, product, initialBarcode }: AddProductModalProps) {
  const { user } = useAuth();
  const { t, direction } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<{id: string, name: string, name_he?: string | null}[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    nameHe: '',
    price: '',
    barcode: '',
    category: '',
    type: 'unit' as 'unit' | 'weight',
  });

  useEffect(() => {
    if (product) {
       setFormData({
         name: product.name || '',
         nameHe: product.description || product.name_he || '', 
         price: product.price?.toString() || '',
         barcode: product.barcode || '',
         category: product.category_id || '',
         type: product.type || 'unit'
       });
       if (product.image_url) {
         setImagePreview(product.image_url);
       }
    } else if (initialBarcode) {
       setFormData(prev => ({ ...prev, barcode: initialBarcode }));
    }
  }, [product, initialBarcode]);

  // Fetch or Seed Categories
  useEffect(() => {
    const fetchCategories = async () => {
      if (!user) return;
      try {
        const { data: existing, error } = await supabase
          .from('restaurant_menu_categories')
          .select('*')
          .eq('business_id', user.id)
          .order('sort_order', { ascending: true });

        if (error) throw error;

        if (!existing || existing.length === 0) {
          // Seed defaults
          const inserts = DEFAULT_CATEGORIES.map(c => ({
            business_id: user.id,
            name: c.name,
            name_he: c.nameHe,
            sort_order: c.sort_order,
            is_active: true
          }));
          
          const { data: created, error: createError } = await supabase
            .from('restaurant_menu_categories')
            .insert(inserts)
            .select();

          if (createError) throw createError;
          setCategories(created || []);
          if (created && created.length > 0 && !product) {
             setFormData(prev => ({ ...prev, category: created[0].id }));
          }
        } else {
          // Deduplicate
          const uniqueCategories = [
            ...new Map(existing.map(item => [item.name_he || item.name, item])).values() 
          ];
          setCategories(uniqueCategories);
          
          if (uniqueCategories.length > 0 && !product) {
             setFormData(prev => ({ ...prev, category: uniqueCategories[0].id }));
          }
        }
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    
    fetchCategories();
  }, [user, product]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    try {
      setLoading(true);
      let imageUrl = null;

      // 1. Upload image if exists
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `market-items/${user.id}/${Math.random()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('restaurant-assets')
          .upload(fileName, imageFile);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('restaurant-assets')
          .getPublicUrl(fileName);
        
        imageUrl = publicUrl;
      }

       if (product) {
          const { error: updateError } = await supabase
            .from('restaurant_menu_items')
            .update({
              name: formData.name, 
              description: formData.nameHe,
              price: parseFloat(formData.price),
              barcode: formData.barcode || null,
              category_id: formData.category || null,
              type: formData.type,
              image_url: imageUrl || product.image_url, 
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any)
            .eq('id', product.id);
           
         if (updateError) throw updateError;
      } else {
         const { error: createError } = await supabase
           .from('restaurant_menu_items')
           .insert({
             business_id: user.id,
             name: formData.name, 
             description: formData.nameHe,
             price: parseFloat(formData.price),
             barcode: formData.barcode || null,
             category_id: formData.category || null,
             type: formData.type,
             image_url: imageUrl,
             is_available: true
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
           } as any);
           
         if (createError) throw createError;
      }

      toast.success(product ? t('market.saveSuccess') : t('market.saveSuccess'));
      onSuccess();
      onClose();
    } catch (error: unknown) {
      console.error('Error saving product:', error);
      toast.error(t('market.saveError') + ': ' + ((error as Error).message || t('auth.error')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4 animate-fadeIn">
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-scaleIn" dir={direction}>
        
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 p-4 flex justify-between items-center text-white">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Package className="w-5 h-5" />
            {product ? t('market.modal.editTitle') : t('market.modal.addTitle')}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-full transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Image Upload */}
          <div className="flex justify-center mb-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="w-32 h-32 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-all relative overflow-hidden group"
            >
              {imagePreview ? (
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              ) : (
                <>
                  <Camera className="w-8 h-8 text-slate-400 mb-2 group-hover:text-emerald-500" />
                  <span className="text-xs text-slate-500">{t('market.modal.addImage')}</span>
                </>
              )}
              {imagePreview && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-xs">{t('market.modal.changeImage')}</span>
                </div>
              )}
              <input 
                ref={fileInputRef}
                type="file" 
                accept="image/*" 
                className="hidden" 
                onChange={handleImageChange}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('market.modal.productName')}</label>
              <input
                required
                type="text"
                value={formData.nameHe}
                onChange={e => setFormData({...formData, nameHe: e.target.value})}
                className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                placeholder={t('market.modal.namePlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('market.modal.nameEn')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-emerald-500"
                placeholder={t('market.modal.namePlaceholderEn') || "e.g. Milk"}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('market.modal.price')} (₪)</label>
              <input
                required
                type="number"
                step="0.01"
                value={formData.price}
                onChange={e => setFormData({...formData, price: e.target.value})}
                className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-emerald-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('market.modal.barcode')}</label>
              <div className="relative">
                <input
                  id="barcode-input"
                  type="text"
                  value={formData.barcode}
                  onChange={e => setFormData({...formData, barcode: e.target.value})}
                  className={`w-full py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-emerald-500 
                    ${direction === 'rtl' ? 'pr-10 pl-10' : 'pl-10 pr-10'}
                  `}
                  placeholder={t('market.modal.scanPlaceholder')}
                />
                <Barcode className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 ${direction === 'rtl' ? 'right-3' : 'left-3'}`} />
                <button
                  type="button"
                  onClick={() => {
                    const input = document.getElementById('barcode-input');
                    if (input) {
                        (input as HTMLInputElement).focus();
                        toast.info(t('market.modal.readyToScan') || "Ready to scan...");
                    }
                  }}
                  className={`absolute top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 dark:hover:bg-slate-600 rounded-lg transition-colors ${direction === 'rtl' ? 'left-2' : 'right-2'}`}
                  title={t('market.modal.clickToScan') || "Click to focus for scanner"}
                >
                    <ScanBarcode className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <div>
             <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('market.modal.category')}</label>
             <select
               value={formData.category}
               onChange={e => setFormData({...formData, category: e.target.value})}
               className="w-full px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-emerald-500"
             >
               {categories.map(cat => {
                 const key = `market.categories.${(cat.name || '').toLowerCase()}`;
                 const translated = t(key);
                 const displayName = translated !== key ? translated : (direction === 'rtl' ? (cat.name_he || cat.name) : (cat.name || cat.name_he));
                 return (
                   <option key={cat.id} value={cat.id}>{displayName}</option>
                 );
               })}
             </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">{t('market.modal.type')}</label>
            <div className="flex gap-4">
              <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${formData.type === 'unit' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-emerald-200'}`}>
                <input
                  type="radio"
                  name="type"
                  value="unit"
                  checked={formData.type === 'unit'}
                  onChange={() => setFormData({...formData, type: 'unit'})}
                  className="hidden"
                />
                <Package className="w-5 h-5" />
                <span className="font-medium">{t('market.modal.unit')}</span>
              </label>
              <label className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-xl border-2 cursor-pointer transition-all ${formData.type === 'weight' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 hover:border-emerald-200'}`}>
                <input
                  type="radio"
                  name="type"
                  value="weight"
                  checked={formData.type === 'weight'}
                  onChange={() => setFormData({...formData, type: 'weight'})}
                  className="hidden"
                />
                <Scale className="w-5 h-5" />
                <span className="font-medium">{t('market.modal.weight')}</span>
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 mt-4 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {loading ? t('market.modal.saving') : t('market.modal.save')}
          </button>
        </form>
      </div>
    </div>
  );
}
