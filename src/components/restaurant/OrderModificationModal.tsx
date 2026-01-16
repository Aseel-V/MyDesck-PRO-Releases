import { useState, useEffect } from 'react';
import { X, Minus, Plus, Trash2, Save } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { OrderItem } from '../../types/restaurant';

interface OrderModificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: Partial<OrderItem> | null;
  onUpdate: (updates: { quantity?: number; notes?: string }) => void;
  onVoid: () => void;
  isVoiding?: boolean;
}

export default function OrderModificationModal({ 
  isOpen, 
  onClose, 
  item, 
  onUpdate, 
  onVoid,
  isVoiding = false
}: OrderModificationModalProps) {
  const { t } = useLanguage();
  const [quantity, setQuantity] = useState(1);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (item) {
      setQuantity(item.quantity || 1);
      setNotes(item.notes || '');
    }
  }, [item]);

  if (!isOpen || !item) return null;

  const handleSave = () => {
    onUpdate({ quantity, notes });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
          <h3 className="font-bold text-lg dark:text-white">{t('orderModal.modifyItem')}</h3>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Item Info */}
          <div>
            <div className="text-sm text-slate-500 mb-1">{t('orderModal.item')}</div>
            <div className="font-bold text-xl dark:text-white">
              {item.menu_item?.name || t('orderModal.unknownItem')}
            </div>
          </div>

          {/* Quantity Control */}
          <div>
            <div className="text-sm text-slate-500 mb-2">{t('orderModal.quantity')}</div>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setQuantity(q => Math.max(1, q - 1))}
                className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Minus />
              </button>
              <div className="flex-1 text-center font-bold text-3xl dark:text-white">
                {quantity}
              </div>
              <button 
                onClick={() => setQuantity(q => q + 1)}
                className="w-12 h-12 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                <Plus />
              </button>
            </div>
          </div>

          {/* Notes */}
          <div>
            <div className="text-sm text-slate-500 mb-2">{t('orderModal.notes')}</div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('orderModal.notesPlaceholder')}
              className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 min-h-[100px] resize-none focus:ring-2 focus:ring-emerald-500 outline-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex gap-3 bg-slate-50 dark:bg-slate-950">
          <button 
            onClick={onVoid}
            disabled={isVoiding}
            className="px-4 py-3 bg-red-100 text-red-600 rounded-xl font-bold hover:bg-red-200 transition flex items-center gap-2 disabled:opacity-50"
          >
            <Trash2 size={20} />
            {isVoiding ? t('common.processing') : t('common.void')}
          </button>
          <button 
            onClick={handleSave}
            className="flex-1 px-4 py-3 bg-slate-900 text-white rounded-xl font-bold hover:bg-slate-800 transition flex items-center justify-center gap-2"
          >
            <Save size={20} />
            {t('common.save')}
          </button>
        </div>

      </div>
    </div>
  );
}
