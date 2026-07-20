// ============================================================================
// ORDER ENTRY SCREEN - POS Interface for Taking Orders
// Version: 2.0.0 | Production-Ready with i18n, Allergy Safety, Quick Add
// ============================================================================

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useRestaurant, useGuestProfiles as useGuestProfilesHook, StaffAuthorizationResult } from '../../hooks/useRestaurant';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import { safeImageSrc } from '../../lib/safeUrl';
import { toast } from 'sonner';
import {
  MenuItem,
  ModifierGroup,
} from '../../types/restaurant';

// Explicit type definition for the RPC to ensure type safety without 'any'
type LogActivityRpc = (
  fn: 'log_business_activity_v2',
  args: {
    p_business_id?: string | null;
    p_activity_type: string;
    p_entity_type?: string;
    p_entity_id?: string;
    p_details: Record<string, unknown>;
    p_staff_id?: string | null;
  }
) => Promise<{ data: null; error: Error | null }>;

import { calculateOrderTotal } from '../../lib/restaurantCalculator';
import {
  Plus,
  Minus,
  Trash2,
  X,
  Send,
  Users,
  MessageSquare,
  Flame,
  Star,
  Search,
  ArrowLeft,
  Check,
  AlertTriangle,
  Utensils,
  Clock,
  ShoppingCart,
  Split,
  XCircle,
} from 'lucide-react';
import { PinPadModal } from './PinPadModal';
import AllergyOverrideModal from './AllergyOverrideModal';

// ============================================================================
// TYPES
// ============================================================================

interface CartItem {
  id: string;
  menuItem: MenuItem;
  quantity: number;
  notes: string;
  courseNumber: number;
  seatNumber?: number;
  modifiers: Array<{ id: string; name: string; price: number }>;
}

// ============================================================================
// MENU ITEM CARD
// ============================================================================

interface MenuItemCardProps {
  item: MenuItem;
  onAdd: () => void;
  t: (key: string) => string;
  formatCurrency: (amount: number) => string;
}

function MenuItemCard({ item, onAdd, t, formatCurrency }: MenuItemCardProps) {
  if (!item.is_available) {
    return (
      <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 opacity-50 cursor-not-allowed">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-medium text-slate-600 dark:text-slate-400 line-through">
              {item.name}
            </h4>
            <div className="text-sm text-red-500 mt-1 flex items-center gap-1">
              <AlertTriangle size={12} />
              {t('orderEntry.unavailable')}
            </div>
          </div>
          <span className="text-slate-400">{formatCurrency(item.price)}</span>
        </div>
      </div>
    );
  }

  return (
    <button
      onClick={onAdd}
      className="w-full bg-white dark:bg-slate-900 rounded-xl p-4 border border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:shadow-md transition-all text-start"
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h4 className="font-medium text-slate-800 dark:text-white">{item.name}</h4>
            {item.is_popular && <Star size={12} className="text-yellow-500 fill-yellow-500" />}
            {item.is_new && (
              <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-bold">
                {t('menuManagement.newItem')}
              </span>
            )}
          </div>
          {item.description && (
            <p className="text-xs text-slate-500 mt-1 line-clamp-1">{item.description}</p>
          )}
          {item.allergens && item.allergens.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {item.allergens.map(allergen => (
                <span key={allergen} className="text-[10px] px-1.5 py-0.5 bg-rose-50 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300 rounded border border-rose-100 dark:border-rose-800 font-medium">
                  {t(`settings.restaurantSetup.allergens.${allergen}`) !== `settings.restaurantSetup.allergens.${allergen}` ? t(`settings.restaurantSetup.allergens.${allergen}`) : allergen}
                </span>
              ))}
            </div>
          )}
          {item.dietary_tags && item.dietary_tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {item.dietary_tags.map(tag => {
                const colors: Record<string, string> = {
                  'vegan': 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
                  'vegetarian': 'bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400',
                  'gluten-free': 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                  'dairy-free': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
                  'keto': 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
                };
                const tagClass = colors[tag.toLowerCase()] || 'bg-slate-100 text-slate-700';
                return (
                  <span key={tag} className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter ${tagClass}`}>
                    {tag === 'gluten-free' ? 'GF' : tag === 'vegetarian' ? 'V' : tag === 'vegan' ? 'VG' : tag.slice(0, 3)}
                  </span>
                )
              })}
            </div>
          )}
          <div className="flex items-center gap-2 mt-2">
            {item.spicy_level && item.spicy_level > 0 && (
              <span className="text-xs">{'🌶️'.repeat(item.spicy_level)}</span>
            )}
            {item.prep_time_minutes > 0 && (
              <span className="text-xs text-slate-400 flex items-center gap-0.5">
                <Clock size={10} />
                {item.prep_time_minutes}m
              </span>
            )}
          </div>
        </div>

        <div className="text-end">
          <span className="font-bold text-blue-600 dark:text-blue-400">{formatCurrency(item.price)}</span>
        </div>
      </div>
    </button>
  );
}

// ============================================================================
// CART ITEM ROW
// ============================================================================

interface CartItemRowProps {
  item: CartItem;
  onUpdateQuantity: (delta: number) => void;
  onRemove: () => void;
  onEditNotes: () => void;
  t: (key: string) => string;
  formatCurrency: (amount: number) => string;
}

function CartItemRow({ item, onUpdateQuantity, onRemove, onEditNotes, t, formatCurrency }: CartItemRowProps) {
  const modifiersTotal = item.modifiers.reduce((sum, m) => sum + m.price, 0);
  const lineTotal = (item.menuItem.price + modifiersTotal) * item.quantity;

  return (
    <div className="py-3 border-b border-slate-100 dark:border-slate-800">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-slate-800 dark:text-white">{item.menuItem.name}</span>
            {item.seatNumber && (
              <span className="text-xs bg-slate-100 dark:bg-slate-700 px-1.5 rounded">
                {t('orderEntry.seat')} {item.seatNumber}
              </span>
            )}
          </div>
          {item.modifiers.length > 0 && (
            <div className="text-xs text-orange-600 dark:text-orange-400 mt-0.5">
              {item.modifiers.map(m => `+ ${m.name}`).join(', ')}
            </div>
          )}
          {item.notes && (
            <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
              <MessageSquare size={10} />
              {item.notes}
            </div>
          )}
        </div>

        <div className="text-end">
          <span className="font-medium text-slate-800 dark:text-white">{formatCurrency(lineTotal)}</span>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onUpdateQuantity(-1)}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            <Minus size={14} />
          </button>
          <span className="font-bold w-6 text-center text-slate-800 dark:text-white">{item.quantity}</span>
          <button
            onClick={() => onUpdateQuantity(1)}
            className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-slate-600"
          >
            <Plus size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onEditNotes}
            className="p-1.5 text-slate-400 hover:text-slate-600"
          >
            <MessageSquare size={14} />
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 text-red-400 hover:text-red-600"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MODIFIER SELECTOR MODAL
// ============================================================================

interface ModifierSelectorProps {
  item: MenuItem;
  modifierGroups: ModifierGroup[];
  onConfirm: (modifiers: Array<{ id: string; name: string; price: number }>, notes: string) => void;
  onCancel: () => void;
  t: (key: string) => string;
  formatCurrency: (amount: number) => string;
}

function ModifierSelector({ item, modifierGroups, onConfirm, onCancel, t, formatCurrency }: ModifierSelectorProps) {
  const [selectedModifiers, setSelectedModifiers] = useState<Map<string, { id: string; name: string; price: number }>>(new Map());
  const [notes, setNotes] = useState('');

  const applicableGroups = modifierGroups;

  const toggleModifier = (mod: { id: string; name: string; price_adjustment: number }, groupId: string) => {
    const key = `${groupId}-${mod.id}`;
    const newSelected = new Map(selectedModifiers);

    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.set(key, { id: mod.id, name: mod.name, price: mod.price_adjustment });
    }

    setSelectedModifiers(newSelected);
  };

  const handleConfirm = () => {
    onConfirm(Array.from(selectedModifiers.values()), notes);
  };

  const modifiersTotal = Array.from(selectedModifiers.values()).reduce((sum, m) => sum + m.price, 0);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg text-slate-800 dark:text-white">{item.name}</h3>
            <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
              <X size={24} />
            </button>
          </div>
          <p className="text-sm text-slate-500 mt-1">{t('orderEntry.basePrice')}: {formatCurrency(item.price)}</p>
        </div>

        {/* Modifier Groups */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {applicableGroups.map((group) => (
            <div key={group.id}>
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-medium text-slate-700 dark:text-slate-300">{group.name}</h4>
                {group.is_required && (
                  <span className="text-xs text-red-500">{t('orderEntry.required')}</span>
                )}
              </div>
              <div className="space-y-2">
                {group.modifiers?.map((mod) => {
                  const key = `${group.id}-${mod.id}`;
                  const isSelected = selectedModifiers.has(key);

                  return (
                    <button
                      key={mod.id}
                      onClick={() => toggleModifier(mod, group.id)}
                      disabled={!mod.is_available}
                      className={`
                        w-full p-3 rounded-lg border text-start flex items-center justify-between
                        ${isSelected
                          ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-400'
                          : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                        }
                        ${!mod.is_available ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-300'}
                      `}
                    >
                      <span className={isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}>
                        {mod.name}
                      </span>
                      <div className="flex items-center gap-2">
                        {mod.price_adjustment !== 0 && (
                          <span className={isSelected ? 'text-blue-600' : 'text-slate-500'}>
                            {mod.price_adjustment > 0 ? '+' : ''}{formatCurrency(mod.price_adjustment)}
                          </span>
                        )}
                        {isSelected && <Check size={16} className="text-blue-500" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Special Instructions */}
          <div>
            <label className="block font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t('orderEntry.specialInstructions')}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('orderEntry.instructionsPlaceholder')}
              className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              rows={2}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-slate-600 dark:text-slate-400">{t('orderEntry.total')}:</span>
            <span className="text-xl font-bold text-slate-800 dark:text-white">
              {formatCurrency(item.price + modifiersTotal)}
            </span>
          </div>
          <button
            onClick={handleConfirm}
            className="w-full py-3 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 flex items-center justify-center gap-2"
          >
            <Plus size={18} />
            {t('orderEntry.addToOrder')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// EDIT NOTES MODAL
// ============================================================================

interface EditNotesModalProps {
  currentNotes: string;
  onSave: (notes: string) => void;
  onCancel: () => void;
  t: (key: string) => string;
}

function EditNotesModal({ currentNotes, onSave, onCancel, t }: EditNotesModalProps) {
  const [notes, setNotes] = useState(currentNotes);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <h3 className="font-bold text-lg text-slate-800 dark:text-white mb-4">
          {t('orderEntry.specialInstructions')}
        </h3>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={t('orderEntry.instructionsPlaceholder')}
          className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
          rows={3}
          autoFocus
        />
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {t('reservationsBoard.cancel')}
          </button>
          <button
            onClick={() => onSave(notes)}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
          >
            {t('menuManagement.save')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SPLIT BILL MODAL
// ============================================================================

interface SplitBillModalProps {
  total: number;
  cart: CartItem[];
  onClose: () => void;
  t: (key: string) => string;
  formatCurrency: (amount: number) => string;
}

function SplitBillModal({ total, cart, onClose, t, formatCurrency }: SplitBillModalProps) {
  const [splitCount, setSplitCount] = useState(2);
  const [splitType, setSplitType] = useState<'equal' | 'byItem' | 'custom'>('equal');

  // By Item: Track which guest owns each cart item
  const [itemAssignments, setItemAssignments] = useState<Record<string, number>>({});

  // Custom: Track custom amounts per guest
  const [customAmounts, setCustomAmounts] = useState<number[]>([0, 0]);

  // Initialize assignments when switching to byItem
  useEffect(() => {
    if (splitType === 'byItem' && Object.keys(itemAssignments).length === 0) {
      const assignments: Record<string, number> = {};
      cart.forEach(item => {
        assignments[item.id] = 1; // Default all to guest 1
      });
      setItemAssignments(assignments);
    }
  }, [splitType, cart, itemAssignments]);

  // Initialize custom amounts when switching to custom or changing guest count
  useEffect(() => {
    if (splitType === 'custom') {
      const equalShare = total / splitCount;
      setCustomAmounts(Array(splitCount).fill(parseFloat(equalShare.toFixed(2))));
    }
  }, [splitType, splitCount, total]);

  const perPersonAmount = splitType === 'equal' ? total / splitCount : 0;

  // Calculate per-guest totals for byItem mode
  const guestTotals = useMemo(() => {
    if (splitType !== 'byItem') return [];
    const totals: number[] = Array(splitCount).fill(0);
    cart.forEach(item => {
      const guestIndex = (itemAssignments[item.id] || 1) - 1;
      const modifiersTotal = item.modifiers.reduce((sum, m) => sum + m.price, 0);
      const lineTotal = (item.menuItem.price + modifiersTotal) * item.quantity;
      if (guestIndex >= 0 && guestIndex < splitCount) {
        totals[guestIndex] += lineTotal;
      }
    });
    return totals;
  }, [splitType, cart, itemAssignments, splitCount]);

  // Validate custom split
  const customTotal = customAmounts.reduce((sum, amt) => sum + amt, 0);
  const isCustomValid = Math.abs(customTotal - total) < 0.01;

  const handleAssignItem = (itemId: string, guestNum: number) => {
    setItemAssignments(prev => ({ ...prev, [itemId]: guestNum }));
  };

  const handleCustomAmountChange = (index: number, value: string) => {
    const amount = parseFloat(value) || 0;
    setCustomAmounts(prev => {
      const newAmounts = [...prev];
      newAmounts[index] = Math.max(0, amount);
      return newAmounts;
    });
  };

  const handleAddGuest = () => {
    setSplitCount(prev => prev + 1);
    if (splitType === 'custom') {
      setCustomAmounts(prev => [...prev, 0]);
    }
  };

  const handleRemoveGuest = (index: number) => {
    if (splitCount <= 2) return;
    setSplitCount(prev => prev - 1);
    if (splitType === 'custom') {
      setCustomAmounts(prev => prev.filter((_, i) => i !== index));
    }
    if (splitType === 'byItem') {
      // Reassign items from removed guest to guest 1
      const removedGuestNum = index + 1;
      setItemAssignments(prev => {
        const newAssignments: Record<string, number> = {};
        Object.entries(prev).forEach(([itemId, guestNum]) => {
          if (guestNum === removedGuestNum) {
            newAssignments[itemId] = 1;
          } else if (guestNum > removedGuestNum) {
            newAssignments[itemId] = guestNum - 1;
          } else {
            newAssignments[itemId] = guestNum;
          }
        });
        return newAssignments;
      });
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h3 className="font-bold text-lg text-slate-800 dark:text-white">
            {t('orderEntry.splitBill')}
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>

        {/* Split Type Buttons */}
        <div className="grid grid-cols-3 gap-2 mb-6">
          {(['equal', 'byItem', 'custom'] as const).map((type) => (
            <button
              key={type}
              onClick={() => setSplitType(type)}
              className={`py-2 px-3 rounded-lg text-sm font-medium ${
                splitType === type
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {t(`orderEntry.splitBillOptions.${type}`)}
            </button>
          ))}
        </div>

        {/* Guest Count Control */}
        <div className="flex items-center justify-between mb-4">
          <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t('orderEntry.guestCount')}
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSplitCount(Math.max(2, splitCount - 1))}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center"
            >
              <Minus size={16} />
            </button>
            <span className="text-xl font-bold text-slate-800 dark:text-white w-6 text-center">{splitCount}</span>
            <button
              onClick={handleAddGuest}
              className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center"
            >
              <Plus size={16} />
            </button>
          </div>
        </div>

        {/* Equal Split */}
        {splitType === 'equal' && (
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg mb-4">
            <div className="text-center">
              <div className="text-sm text-green-600 dark:text-green-400">{t('orderEntry.perPerson')}</div>
              <div className="text-3xl font-bold text-green-700 dark:text-green-300">
                {formatCurrency(perPersonAmount)}
              </div>
            </div>
          </div>
        )}

        {/* By Item Split */}
        {splitType === 'byItem' && (
          <div className="space-y-3 mb-4">
            {cart.map((item) => {
              const modifiersTotal = item.modifiers.reduce((sum, m) => sum + m.price, 0);
              const lineTotal = (item.menuItem.price + modifiersTotal) * item.quantity;
              return (
                <div key={item.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800 dark:text-white">
                      {item.quantity}× {item.menuItem.name}
                    </span>
                    <span className="text-slate-600 dark:text-slate-400">{formatCurrency(lineTotal)}</span>
                  </div>
                  <div className="flex gap-2">
                    {Array.from({ length: splitCount }, (_, i) => i + 1).map((guestNum) => (
                      <button
                        key={guestNum}
                        onClick={() => handleAssignItem(item.id, guestNum)}
                        className={`flex-1 py-1.5 text-sm rounded-md font-medium ${
                          itemAssignments[item.id] === guestNum
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {t('orderEntry.guestNumber')} {guestNum}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Guest Totals */}
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <h4 className="font-medium text-slate-700 dark:text-slate-300 mb-3">{t('orderEntry.splitTotal')}</h4>
              <div className="space-y-2">
                {guestTotals.map((total, index) => (
                  <div key={index} className="flex justify-between">
                    <span className="text-slate-600 dark:text-slate-400">{t('orderEntry.guestNumber')} {index + 1}</span>
                    <span className="font-bold text-slate-800 dark:text-white">{formatCurrency(total)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Custom Split */}
        {splitType === 'custom' && (
          <div className="space-y-3 mb-4">
            {customAmounts.map((amount, index) => (
              <div key={index} className="flex items-center gap-3">
                <span className="text-sm font-medium text-slate-600 dark:text-slate-400 w-20">
                  {t('orderEntry.guestNumber')} {index + 1}
                </span>
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{formatCurrency(0).replace(/[\d.,]/g, '')}</span>
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => handleCustomAmountChange(index, e.target.value)}
                    className="w-full pl-8 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                    step="0.01"
                    min="0"
                  />
                </div>
                {splitCount > 2 && (
                  <button
                    onClick={() => handleRemoveGuest(index)}
                    className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            ))}

            {/* Custom Total Validation */}
            <div className={`p-4 rounded-lg ${isCustomValid ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
              <div className="flex justify-between">
                <span className={isCustomValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                  {t('orderEntry.splitTotal')}
                </span>
                <span className={`font-bold ${isCustomValid ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                  {formatCurrency(customTotal)} / {formatCurrency(total)}
                </span>
              </div>
              {!isCustomValid && (
                <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                  {t('orderEntry.splitInvalid')}
                </p>
              )}
            </div>
          </div>
        )}

        <button
          onClick={onClose}
          disabled={splitType === 'custom' && !isCustomValid}
          className="w-full py-3 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('orderEntry.splitDone')}
        </button>
      </div>
    </div>
  );
}


// ============================================================================
// MAIN ORDER ENTRY COMPONENT
// ============================================================================

interface OrderEntryProps {
  tableId?: string;
  sessionId?: string;
  orderId?: string;
  onClose: () => void;
}

export default function OrderEntry({ tableId, sessionId, orderId, onClose }: OrderEntryProps) {
  const { can } = useRestaurantRole();
  const { t, formatCurrency, direction } = useLanguage();
  const { user } = useAuth();
  const {
    tables,
    categories,
    modifierGroups,
    activeOrders,
    createOrder,
    cancelOrder,
    addOrderItem,
    sendToKitchen,
    verifyPriceIntegrity,
    authorizeStaffAction,
  } = useRestaurant();

  const { guests: guestProfiles } = useGuestProfilesHook();

  const [showSplitBill, setShowSplitBill] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  
  // Tip Calculator State
  const [tipPercentage, setTipPercentage] = useState<number | null>(null);
  const [customTipAmount, setCustomTipAmount] = useState<string>('');

  // 1.4 FIX: Active Allergy Safety
  const [showAllergyCheck, setShowAllergyCheck] = useState(false);
  const [showManagerPin, setShowManagerPin] = useState<{ action: (result: StaffAuthorizationResult) => void; item?: MenuItem } | null>(null);

  const [customAllergy, setCustomAllergy] = useState('');

  const selectedTable = tables.find(table => table.id === tableId);

  // ============================================================================
  // CRITICAL: Fetch guest allergies from linked guest profile
  // ============================================================================
  const [guestAllergies, setGuestAllergies] = useState<string[]>([]);

  useEffect(() => {
    // Look up guest allergies from current session/table
    const fetchGuestAllergies = async () => {
      if (sessionId) {
        const { data: session } = await supabase
          .from('restaurant_table_sessions')
          .select('guest_id')
          .eq('id', sessionId)
          .single();
        
        // Cast to any because of strict typing issues with generated types
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((session as any)?.guest_id) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const guest = guestProfiles?.find(g => g.id === (session as any).guest_id);
          if (guest?.allergy_codes?.length || guest?.allergies?.length) {
            setGuestAllergies(guest.allergy_codes || guest.allergies || []);
          }
        }
      } else if (tableId) {
        // Fallback or explicit table lookup
      }
    };
    fetchGuestAllergies();
  }, [sessionId, tableId, guestProfiles]);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showModifierModal, setShowModifierModal] = useState<MenuItem | null>(null);
  const [isRush, setIsRush] = useState(false);

  // 1. SAFETY: State for Allergy Override
  const [overrideText, setOverrideText] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [isHolding, setIsHolding] = useState(false);
  const holdTimer = useRef<NodeJS.Timeout | null>(null);
  const [allergenWarningItem, setAllergenWarningItem] = useState<MenuItem | null>(null);
  const [matchingAllergens, setMatchingAllergens] = useState<string[]>([]);
  const [verballyConfirmed, setVerballyConfirmed] = useState(false);

  const [guestCount, setGuestCount] = useState(2);
  const [isSending, setIsSending] = useState(false);
  const [editingNotesItem, setEditingNotesItem] = useState<string | null>(null);

  // 2. LOGGING: Immutable audit log
  const logAllergyOverride = async (item: MenuItem, reason: string, method: string) => {
    try {
        const rpc = supabase.rpc as unknown as LogActivityRpc;
        await rpc('log_business_activity_v2', {
             p_business_id: user?.id ?? null,
             p_activity_type: 'ALLERGY_OVERRIDE',
             p_entity_type: 'order_item',
             p_entity_id: item.id,
             p_details: {
                itemName: item.name,
                allergens: matchingAllergens,
                reason: reason,
                method: method,
                orderId: orderId || 'NEW_ORDER'
             },
             p_staff_id: user?.id ?? null
        });
        // We can toast if needed but user flow shouldn't be interrupted too much
        console.log('Safety Override Logged');
    } catch (e) {
        console.error("Log failed", e);
    }
  };

  function confirmAllergenAdd() {
    if (!allergenWarningItem) return;
    
    // FINAL SAFETY CHECK 
    if (overrideText !== t('allergySafety.expectedText')) {
       return; 
    }

    const item = allergenWarningItem;
    logAllergyOverride(item, overrideReason, 'TYPED_CONFIRMATION');

    setAllergenWarningItem(null);
    setMatchingAllergens([]);
    setOverrideText('');
    setOverrideReason('');
    setIsHolding(false);

    const safetyNote = `${t('orderEntry.allergySafety.overrideNote')}: ${matchingAllergens.join(', ')}`;

    // Re-declare addToCart inside or ensure it's available
    addToCart(item, [], safetyNote);
  }

  const startHold = () => {
    if (overrideText !== t('allergySafety.expectedText')) return;
    setIsHolding(true);
    holdTimer.current = setTimeout(() => {
      confirmAllergenAdd();
    }, 3000); 
  };

  const endHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setIsHolding(false);
  };

  // UX FIX: Removed auto-popup - allergy check now triggers on first item add
  // This matches real waiter workflow: approach table → start taking order → ask about allergies

  const handleAllergyDeclaration = () => {

    setShowAllergyCheck(false);
  };

  const addCustomAllergy = () => {
    if (customAllergy.trim()) {
      setGuestAllergies([...guestAllergies, customAllergy.trim()]);
      setCustomAllergy('');
    }
  };

  // Get all menu items
  const allItems = useMemo(() => {
    return categories.flatMap(c => c.items || []);
  }, [categories]);

  // Filter items
  const filteredItems = useMemo(() => {
    let items = allItems;

    if (selectedCategory) {
      const category = categories.find(c => c.id === selectedCategory);
      items = category?.items || [];
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      items = items.filter(i =>
        i.name.toLowerCase().includes(q) ||
        i.description?.toLowerCase().includes(q)
      );
    }

    return items.sort((a, b) => {
      if (a.is_popular && !b.is_popular) return -1;
      if (!a.is_popular && b.is_popular) return 1;
      return a.name.localeCompare(b.name);
    });
  }, [allItems, categories, selectedCategory, searchQuery]);

  // Calculate totals
  const orderTotals = useMemo(() => {
    const items = cart.map(item => ({
      price_at_time: item.menuItem.price,
      quantity: item.quantity,
      tax_rate: item.menuItem.tax_rate,
      modifiers: item.modifiers,
    }));

    return calculateOrderTotal({ 
      id: orderId || 'temp',
      items: items.map(i => ({ 
        ...i, 
        id: 'calc-id', 
        item_id: 'calc-item',
        modifiers: i.modifiers.map(m => ({
          id: m.id,
          modifier_name: m.name,
          price_adjustment: m.price
        }))
      })) 
    });
  }, [cart, orderId]);

  // Calculate tip amount
  const calculatedTip = useMemo(() => {
    if (customTipAmount) {
      return parseFloat(customTipAmount) || 0;
    }
    if (tipPercentage !== null) {
      return (orderTotals.subtotal * tipPercentage) / 100;
    }
    return 0;
  }, [orderTotals.subtotal, tipPercentage, customTipAmount]);

  // Quick Favorites logic
  const popularItems = useMemo(() => {
    const popular = allItems.filter(item => item.is_popular && item.is_available !== false);
    if (popular.length > 0) return popular.slice(0, 8);
    return allItems.filter(item => item.is_available !== false).slice(0, 8);
  }, [allItems]);

  // Total with tip
  const finalTotal = orderTotals.total_amount + calculatedTip;

  const itemHasModifiers = (): boolean => {
    if (modifierGroups.length === 0) return false;
    return modifierGroups.some(group => group.modifiers && group.modifiers.length > 0);
  };

  const checkAllergenConflict = (item: MenuItem): { conflict: boolean; unknown?: boolean; allergens: string[] } => {
    if (!guestAllergies.length) return { conflict: false, allergens: [] };
    // Update to use standard codes
    const itemCodes = item.allergen_codes || [];
    // Fallback to free text if codes empty but string array exists
    const itemStrings = item.allergens || [];
    
    // If no data at all
    if (itemCodes.length === 0 && itemStrings.length === 0) return { conflict: false, unknown: true, allergens: [] };

    // Check standardized codes first
    const codeConflicts = itemCodes.filter(code => guestAllergies.includes(code));
    
    // Check strings (case insensitive)
    const guestStringsLower = guestAllergies.map(a => a.toLowerCase());
    const stringConflicts = itemStrings.filter(s => guestStringsLower.includes(s.toLowerCase()));

    const allConflicts = [...new Set([...codeConflicts, ...stringConflicts])];
    
    return { conflict: allConflicts.length > 0, allergens: allConflicts };
  };


  const addToCart = (item: MenuItem, modifiers: Array<{ id: string; name: string; price: number }>, notes: string) => {
    const newItem: CartItem = {
      id: `${item.id}-${Date.now()}`,
      menuItem: item,
      quantity: 1,
      notes,
      courseNumber: 1,
      modifiers,
    };
    setCart([...cart, newItem]);
    setShowModifierModal(null);
    toast.success(t('common.added') || 'Added to order');
  };

  const handleAddItem = (item: MenuItem) => {
    // UX FIX: Lazy check - allow first item add then show toast/banner if needed, 
    // OR just don't block. User preference: "add item first, then show modal".
    // We will just add it, and if allergies are completely unknown, we might prompt later.
    // For now, we remove the blocking check here.
    
    /* 
    if (!hasAskedAllergies && guestAllergies.length === 0 && cart.length === 0) {
      setShowAllergyCheck(true);
      return;
    }
    */
    
    const result = checkAllergenConflict(item);
    
    if (result.unknown) {
        setShowManagerPin({ 
           action: () => {
              addToCart(item, [], t('orderEntry.allergySafety.unknownDataOverride'));
              logAllergyOverride(item, 'Manager authorized unknown data', 'MANAGER_PIN');
              setShowManagerPin(null);
              setVerballyConfirmed(false);
           },
           item: item
        });
        return;
    }

    if (result.conflict) {
      setAllergenWarningItem(item);
      setMatchingAllergens(result.allergens);
      setOverrideText('');
      setOverrideReason('');
      return;
    }

    if (itemHasModifiers() && modifierGroups.length > 0) {
      setShowModifierModal(item);
    } else {
      addToCart(item, [], '');
    }
  };

  const cancelAllergenAdd = () => {
    setAllergenWarningItem(null);
    setMatchingAllergens([]);
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.id === itemId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeItem = (itemId: string) => {
    setCart(cart.filter(item => item.id !== itemId));
  };

  const updateItemNotes = (itemId: string, notes: string) => {
    setCart(cart.map(item =>
      item.id === itemId ? { ...item, notes } : item
    ));
    setEditingNotesItem(null);
  };

  const handleSendOrder = useCallback(async () => {
    if (cart.length === 0) return;
    try {
      const verification = await verifyPriceIntegrity(cart);
      if (!verification.valid) {
        toast.error(`${t('common.error')}: ${verification.errors?.[0]}`);
        return;
      }
    } catch (err) {
      console.error('Validation failed', err);
      toast.error(t('common.networkError')); 
      return;
    }

    setIsSending(true);
    try {
      let currentOrderId = orderId;
      if (!currentOrderId) {
        const order = await createOrder.mutateAsync({
          table_id: tableId,
          session_id: sessionId,
          is_rush: isRush,
        });
        currentOrderId = order.id;
      }

      for (const item of cart) {
        await addOrderItem.mutateAsync({
          orderId: currentOrderId!,
          itemId: item.menuItem.id,
          quantity: item.quantity,
          priceAtTime: item.menuItem.price,
          notes: item.notes,
          courseNumber: item.courseNumber,
          seatNumber: item.seatNumber,
          modifiers: item.modifiers.map(m => ({
            modifier_id: m.id,
            name: m.name,
            price: m.price,
          })),
        });
      }

      await sendToKitchen.mutateAsync({ orderId: currentOrderId! });
      setCart([]);
      onClose();
    } catch (err) {
      console.error('Failed to send order:', err);
    } finally {
      setIsSending(false);
    }
  }, [cart, orderId, tableId, sessionId, isRush, createOrder, addOrderItem, sendToKitchen, onClose, t, verifyPriceIntegrity]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (cart.length > 0) handleSendOrder();
      }
      if (e.key === 'F1') {
        e.preventDefault();
        document.getElementById('menu-search')?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, cart.length, handleSendOrder]);

  const existingOrder = activeOrders?.find(o => o.table_id === tableId && o.status !== 'closed' && o.status !== 'cancelled');

  if (!can('canTakeOrders')) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100 dark:bg-slate-950">
        <div className="text-center">
          <Utensils size={48} className="mx-auto text-slate-400 mb-4" />
          <h2 className="text-xl font-bold text-slate-600 dark:text-slate-400">
            {t('orderEntry.accessDenied')}
          </h2>
          <p className="text-slate-500">{t('orderEntry.noPermission')}</p>
        </div>
      </div>
    );
  }

  const isRTL = direction === 'rtl';

  return (
    <div className={`fixed inset-0 bg-slate-100 dark:bg-slate-950 flex z-50 ${isRTL ? 'flex-row-reverse' : ''}`}>
      {/* Left: Menu */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-white dark:bg-slate-900 border-b dark:border-slate-800 px-4 py-3 flex items-center justify-between">
          <div className={`flex items-center gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <button onClick={onClose} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
              <ArrowLeft size={20} className={isRTL ? 'rotate-180' : ''} />
            </button>
            <div className={isRTL ? 'text-right' : ''}>
              <h1 className="font-bold text-slate-800 dark:text-white">
                {selectedTable ? `${t('orderEntry.table')} ${selectedTable.name}` : t('orderEntry.newOrder')}
              </h1>
              {selectedTable && (
                <p className="text-xs text-slate-500">{selectedTable.seats} {t('orderEntry.seats')}</p>
              )}
            </div>
          </div>

          {/* Rush & Guest Count */}
          <div className={`flex items-center gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
            <div className="flex items-center gap-2">
              <Users size={16} className="text-slate-400" />
              <input
                type="number"
                value={guestCount}
                onChange={(e) => setGuestCount(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-12 text-center border rounded px-1 py-0.5 dark:bg-slate-800 dark:border-slate-700"
                min="1"
              />
            </div>
            <button
              onClick={() => setIsRush(!isRush)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg font-medium text-sm ${
                isRush
                  ? 'bg-red-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Flame size={14} />
              {t('orderEntry.rush')}
            </button>
          </div>
        </div>

        {existingOrder && !orderId && (
          <div className="bg-amber-50 dark:bg-amber-900/20 px-4 py-2 border-b dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 text-sm">
                <AlertTriangle size={14} />
                <span>Existing open order detected for this table (#{existingOrder.id.slice(0,8)})</span>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* CRITICAL: Allergy Warning Banner */}
        {/* ============================================================ */}
        {guestAllergies.length > 0 && (
          <div className="bg-red-500 text-white px-4 py-3 flex items-center gap-3">
            <AlertTriangle size={20} className="flex-shrink-0" />
            <div>
              <span className="font-bold">⚠️ {t('orderEntry.allergyWarning')}: </span>
              <span>{guestAllergies.join(', ')}</span>
            </div>
          </div>
        )}

        {/* Search */}
        <div className="p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-800">
          <div className="relative">
            <Search size={16} className={`absolute ${isRTL ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-slate-400`} />
            <input
              id="menu-search"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('orderEntry.searchMenu')}
              className={`w-full ${isRTL ? 'pr-9 pl-4' : 'pl-9 pr-4'} py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700`}
              dir={direction}
            />
          </div>
        </div>

        {/* Categories */}
        {/* Favorites Bar - Quick Access */}
        <div className="px-4 pt-4 pb-2">
            <div className="flex items-center gap-2 mb-2">
                <Star size={14} className="text-yellow-500 fill-yellow-500" />
                <h3 className="text-xs font-bold uppercase text-slate-500 tracking-wider font-mono">{t('common.preview') || 'Favorites'}</h3>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {popularItems.map(item => (
                    <button
                        key={item.id}
                        onClick={() => handleAddItem(item)}
                        className={`
                          flex-shrink-0 w-36 overflow-hidden bg-white dark:bg-slate-800 border-2 dark:border-slate-700 rounded-2xl 
                          hover:border-blue-500 hover:shadow-md transition-all text-left group relative
                          ${item.is_popular ? 'border-amber-200 dark:border-amber-900/40' : 'border-slate-100 dark:border-slate-800'}
                        `}
                    >
                        {safeImageSrc(item.image_url) && (
                          <div className="h-16 w-full overflow-hidden">
                            <img src={safeImageSrc(item.image_url) || ''} alt={item.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
                          </div>
                        )}
                        <div className="p-3">
                          <div className="text-[13px] font-bold truncate text-slate-800 dark:text-white mb-0.5">{item.name}</div>
                          <div className="flex items-center justify-between">
                            <div className="text-xs text-blue-600 dark:text-blue-400 font-bold">{formatCurrency(item.price)}</div>
                            {item.is_popular && <Star size={10} className="text-amber-500 fill-amber-500" />}
                          </div>
                        </div>
                    </button>
                ))}
            </div>
        </div>

        {/* Categories */}
        <div className={`p-2 bg-white dark:bg-slate-900 border-b dark:border-slate-800 flex gap-2 overflow-x-auto ${isRTL ? 'flex-row-reverse' : ''}`}>
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
              (selectedCategory === null)
                ? 'bg-blue-500 text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {t('orderEntry.all')}
          </button>
          {categories.filter(c => c.is_active !== false).map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
                selectedCategory === cat.id
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        {/* Menu Items Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filteredItems.map((item) => (
              <MenuItemCard
                key={item.id}
                item={item}
                onAdd={() => handleAddItem(item)}
                t={t}
                formatCurrency={formatCurrency}
              />
            ))}
          </div>
          {filteredItems.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Utensils size={32} className="mx-auto mb-2 opacity-30" />
              <p>{t('orderEntry.noItemsFound')}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right: Cart */}
      <div className="w-96 bg-white dark:bg-slate-900 border-l dark:border-slate-800 flex flex-col">
        <div className="p-4 border-b dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-slate-800 dark:text-white">{t('orderEntry.order')}</h2>
            <p className="text-sm text-slate-500">{cart.length} {t('orderEntry.items')}</p>
          </div>
          {/* Cart Badge */}
          {cart.length > 0 && (
            <div className="relative">
              <ShoppingCart size={24} className="text-blue-500" />
              <span className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Utensils size={32} className="mx-auto mb-2 opacity-30" />
              <p>{t('orderEntry.emptyCart')}</p>
              <p className="text-xs">{t('orderEntry.tapToAdd')}</p>
            </div>
          ) : (
            cart.map((item) => (
              <CartItemRow
                key={item.id}
                item={item}
                onUpdateQuantity={(delta) => updateQuantity(item.id, delta)}
                onRemove={() => removeItem(item.id)}
                onEditNotes={() => setEditingNotesItem(item.id)}
                t={t}
                formatCurrency={formatCurrency}
              />
            ))
          )}
        </div>

        {/* Totals & Actions */}
        <div className="p-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="space-y-2 mb-4">
            <div className="flex justify-between font-bold text-lg">
              <span className="text-slate-800 dark:text-white">{t('orderEntry.total')}</span>
              <span className="text-slate-800 dark:text-white">{formatCurrency(finalTotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('orderEntry.subtotal')}</span>
              <span className="text-slate-700 dark:text-slate-300">{formatCurrency(orderTotals.subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">{t('orderEntry.tax')}</span>
              <span className="text-slate-700 dark:text-slate-300">{formatCurrency(orderTotals.tax_amount)}</span>
            </div>

            {/* Tip Calculator */}
            {cart.length > 0 && (
              <div className="pt-2 border-t dark:border-slate-700">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-slate-500">{t('orderEntry.tipAmount')}</span>
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {calculatedTip > 0 ? formatCurrency(calculatedTip) : '—'}
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1 mb-2">
                  <button
                    onClick={() => { setTipPercentage(null); setCustomTipAmount(''); }}
                    className={`py-1.5 text-xs rounded font-medium ${
                      tipPercentage === null && !customTipAmount
                        ? 'bg-slate-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t('orderEntry.noTip')}
                  </button>
                  {[15, 18, 20].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => { setTipPercentage(pct); setCustomTipAmount(''); }}
                      className={`py-1.5 text-xs rounded font-medium ${
                        tipPercentage === pct && !customTipAmount
                          ? 'bg-green-500 text-white'
                          : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                  <button
                    onClick={() => setTipPercentage(-1)}
                    className={`py-1.5 text-xs rounded font-medium ${
                      tipPercentage === -1 || customTipAmount
                        ? 'bg-blue-500 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t('orderEntry.tipOptions.custom')}
                  </button>
                </div>
                {(tipPercentage === -1 || customTipAmount) && (
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">{formatCurrency(0).replace(/[\d.,]/g, '')}</span>
                    <input
                      type="number"
                      value={customTipAmount}
                      onChange={(e) => { setCustomTipAmount(e.target.value); setTipPercentage(null); }}
                      placeholder={t('orderEntry.customTip')}
                      className="w-full pl-8 pr-4 py-2 text-sm border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                      step="0.01"
                      min="0"
                    />
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between font-bold text-lg pt-2 border-t dark:border-slate-700">
              <span className="text-slate-800 dark:text-white">{t('orderEntry.total')}</span>
              <span className="text-slate-800 dark:text-white">{formatCurrency(finalTotal)}</span>
            </div>
          </div>

          {/* Split Bill Button - Always visible but disabled if empty */}
          <button
            disabled={cart.length === 0}
            onClick={() => setShowSplitBill(true)}
            className="w-full py-2 mb-3 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 rounded-lg font-medium hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center justify-center gap-2 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <Split size={16} />
            {t('orderEntry.splitBill')}
          </button>

          {/* Cancel Order Button - Only for existing orders */}
          {orderId && (
            <button
               onClick={() => setShowCancelConfirm(true)}
               className="w-full py-2 mb-3 border border-red-200 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center justify-center gap-2"
            >
               <XCircle size={16} />
               {t('orderEntry.cancelOrder')}
            </button>
          )}

          <button
            onClick={handleSendOrder}
            disabled={cart.length === 0 || isSending}
            className="w-full py-3 bg-blue-500 text-white rounded-lg font-bold hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Send size={18} />
            {isSending ? t('orderEntry.sending') : t('orderEntry.sendToKitchen')}
          </button>
        </div>
        
        {/* Keyboard Shortcuts Hint */}
        <div className="hidden md:flex justify-between px-4 py-2 bg-slate-100 dark:bg-slate-900 border-t dark:border-slate-800 text-[10px] text-slate-400 font-mono">
            <span>F1: {t('common.search')}</span>
            <span>Ctrl+S: {t('orderEntry.sendToKitchen')}</span>
            <span>Esc: {t('common.close')}</span>
        </div>
      </div>

      {/* Modifier Modal */}
      {showModifierModal && (
        <ModifierSelector
          item={showModifierModal}
          modifierGroups={modifierGroups}
          onConfirm={(mods, notes) => addToCart(showModifierModal, mods, notes)}
          onCancel={() => setShowModifierModal(null)}
          t={t}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Edit Notes Modal */}
      {editingNotesItem && (
        <EditNotesModal
          currentNotes={cart.find(i => i.id === editingNotesItem)?.notes || ''}
          onSave={(notes) => updateItemNotes(editingNotesItem, notes)}
          onCancel={() => setEditingNotesItem(null)}
          t={t}
        />
      )}

      {/* Split Bill Modal */}
      {showSplitBill && (
        <SplitBillModal
          total={orderTotals.total_amount}
          cart={cart}
          onClose={() => setShowSplitBill(false)}
          t={t}
          formatCurrency={formatCurrency}
        />
      )}

      {/* Allergen Warning Modal - SAFETY OVERHAUL */}
      {allergenWarningItem && (
        <AllergyOverrideModal 
          item={allergenWarningItem}
          matchingAllergens={matchingAllergens}
          overrideText={overrideText}
          setOverrideText={setOverrideText}
          overrideReason={overrideReason}
          setOverrideReason={setOverrideReason}
          isHolding={isHolding}
          startHold={startHold}
          endHold={endHold}
          onCancel={cancelAllergenAdd}
          t={t}
        />
      )}

      {/* Cancel Order Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl shadow-2xl p-6 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-3 text-red-600 mb-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <AlertTriangle size={24} />
              </div>
              <h3 className="text-xl font-bold">{t('orderEntry.confirmCancelTitle')}</h3>
            </div>
            
            <p className="text-slate-600 dark:text-slate-400 mb-6">
              {t('orderEntry.confirmCancelDescription')}
            </p>

            <div className="space-y-4 mb-6">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t('orderEntry.cancelReasonLabel')}
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t('orderEntry.cancelReasonPlaceholder')}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                rows={3}
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-3 border border-slate-300 dark:border-slate-600 rounded-xl font-bold hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {t('common.keepOrder')}
              </button>
              <button
                disabled={!cancelReason}
                onClick={() => {
                   const proceedCancellation = (staff: StaffAuthorizationResult) => {
                       if (!staff.staff_id) return;
                       cancelOrder.mutate({ 
                           orderId: orderId!, 
                           reason: cancelReason,
                           managerId: staff.staff_id
                       }, {
                           onSuccess: () => {
                               toast.success(t('orderEntry.orderCancelledSuccess'));
                               onClose();
                           },
                           onError: (err) => {
                               toast.error(t('orderEntry.orderCancelledError'));
                               console.error(err);
                           }
                       });
                       setShowManagerPin(null);
                       setShowCancelConfirm(false);
                   };
                   setShowManagerPin({ action: proceedCancellation, item: undefined });
                }}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 disabled:opacity-50"
              >
                {t('orderEntry.cancelPermanently')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manager PIN Modal with Verbal Confirmation for Unknown Allergens */}
      {showManagerPin && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60]">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="bg-red-500 p-4 text-center">
              <h3 className="text-xl font-bold text-white">
                {t('orderEntry.allergySafety.managerPinRequired')}
              </h3>
              {showManagerPin.item && (
                <p className="text-red-100 text-sm mt-1">
                  {showManagerPin.item.name}
                </p>
              )}
            </div>
            
            {/* Verbal Confirmation Checkbox - CRITICAL SAFETY for unknown allergens */}
            {showManagerPin.item && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={verballyConfirmed}
                    onChange={(e) => setVerballyConfirmed(e.target.checked)}
                    className="mt-1 w-5 h-5 rounded border-red-500 text-red-600 focus:ring-red-500"
                  />
                  <span className="text-red-700 dark:text-red-400 font-semibold text-sm leading-relaxed">
                    {t('orderEntry.allergySafety.verballyConfirmed')}
                  </span>
                </label>
              </div>
            )}
            
            {/* PIN Pad */}
            <div className={`${showManagerPin.item && !verballyConfirmed ? 'opacity-40 pointer-events-none' : ''}`}>
              <PinPadModal
                title=""
                description={!showManagerPin.item ? t('orderEntry.allergySafety.securityLog') : ''}
                onClose={() => { setShowManagerPin(null); setVerballyConfirmed(false); }}
                onSuccess={(pin) => {
                  if (showManagerPin.item && !verballyConfirmed) {
                    return;
                  }
                  authorizeStaffAction.mutateAsync({ pin, requiredRole: 'Manager' })
                    .then((result) => (showManagerPin.action)(result))
                    .catch(err => toast.error(err.message));
                }}
                isProcessing={authorizeStaffAction.isPending}
              />
            </div>
          </div>
        </div>
      )}
      
      {/* 1.4 FIX: Active Allergy Check Modal */}
      {showAllergyCheck && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-8 border-2 border-orange-500">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertTriangle size={32} className="text-orange-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 dark:text-white mb-2">
                {t('orderEntry.allergyWarning')}
              </h2>
              <p className="text-slate-600 dark:text-slate-400">
                {t('orderEntry.allergySafety.dietaryQuestion')}
              </p>
            </div>
            
            <div className="space-y-4">
              {guestAllergies.length > 0 && (
                <div className="flex flex-wrap gap-2 justify-center mb-4">
                   {guestAllergies.map((a, i) => (
                     <span key={i} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-bold flex items-center gap-1">
                       {a}
                       <button onClick={() => setGuestAllergies(guestAllergies.filter((_, idx) => idx !== i))}>
                         <X size={12} />
                       </button>
                     </span>
                   ))}
                </div>
              )}

              <div className="flex gap-2">
                <input
                  type="text"
                  value={customAllergy}
                  onChange={(e) => setCustomAllergy(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addCustomAllergy()}
                  placeholder={t('orderEntry.allergySafety.typeAllergyPlaceholder')}
                  className="flex-1 px-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                  autoFocus
                />
                <button 
                  onClick={addCustomAllergy}
                  className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg hover:bg-slate-300"
                >
                  {t('orderEntry.allergySafety.add')}
                </button>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mt-6">
                <button
                  onClick={() => handleAllergyDeclaration()}
                  className="py-3 bg-slate-100 text-slate-700 font-medium rounded-xl hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300"
                >
                  {t('orderEntry.allergySafety.noAllergies')}
                </button>
                <button
                  onClick={() => handleAllergyDeclaration()}
                  className="py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/30"
                >
                  {t('orderEntry.allergySafety.confirmStart')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
