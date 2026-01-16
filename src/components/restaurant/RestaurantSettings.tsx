import { useState, useEffect } from 'react';
import { useRestaurant } from '../../hooks/useRestaurant';
import { useLanguage } from '../../contexts/LanguageContext';
import { toast } from 'sonner';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  Save, 
  X, 
  UtensilsCrossed, 
  Users, 
  ChefHat,
  Armchair,
  Image as ImageIcon
} from 'lucide-react';
import { RestaurantTable, RestaurantStaff, StaffRole } from '../../types/restaurant';
import { ConfirmationModal } from '../ui/ConfirmationModal';
import { FileUpload } from '../ui/FileUpload';

type SettingsTab = 'tables' | 'menu' | 'staff';

// Predefined category types
const CATEGORY_TYPES = ['drinks', 'food', 'salads', 'appetizers', 'mains', 'desserts', 'specials', 'other'] as const;
type CategoryType = typeof CATEGORY_TYPES[number];

const ALLERGEN_LIST = [
  'Gluten', 'Dairy', 'Peanuts', 'Tree Nuts', 'Soy', 
  'Egg', 'Fish', 'Shellfish', 'Sesame', 'Mustard', 'Sulfites'
];

interface RestaurantSettingsProps {
  defaultTab?: SettingsTab;
}

export default function RestaurantSettings({ defaultTab = 'tables' }: RestaurantSettingsProps) {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState<SettingsTab>(defaultTab);

  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: 'tables', label: t('settings.restaurantSetup.tables'), icon: Armchair },
    { id: 'menu', label: t('settings.restaurantSetup.menu'), icon: UtensilsCrossed },
    { id: 'staff', label: t('settings.restaurantSetup.staff'), icon: Users },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold dark:text-white">{t('settings.restaurantSetup.setup')}</h2>
      <p className="text-slate-500 dark:text-slate-400">{t('settings.restaurantSetup.setupDesc')}</p>

      {/* Sub-tabs */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-t-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-emerald-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
            }`}
          >
            <tab.icon size={16} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'tables' && <TablesManager />}
      {activeTab === 'menu' && <MenuManager />}
      {activeTab === 'staff' && <StaffManager />}
    </div>
  );
}

// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
// TABLES MANAGER
// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•

function TablesManager() {
  const { t } = useLanguage();
  const { tables, loadingTables, createTable, updateTable, deleteTable } = useRestaurant();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState({ name: '', seats: 4 });

  const handleAddTable = async () => {
    if (!formData.name.trim()) {
      toast.error(t('settings.restaurantSetup.tableNameRequired'));
      return;
    }
    try {
      await createTable.mutateAsync({ name: formData.name, seats: formData.seats });
      toast.success(t('settings.restaurantSetup.tableAdded'));
      setFormData({ name: '', seats: 4 });
      setIsAdding(false);
    } catch (err) {
      toast.error(t('settings.restaurantSetup.failed'));
      console.error(err);
    }
  };

  const handleUpdateTable = async (table: RestaurantTable) => {
    try {
      await updateTable.mutateAsync({ id: table.id, name: formData.name, seats: formData.seats });
      toast.success(t('settings.restaurantSetup.tableUpdated'));
      setEditingId(null);
    } catch (err) {
      toast.error(t('settings.restaurantSetup.failed'));
      console.error(err);
    }
  };

  const handleDeleteTable = async (id: string) => {
    if (!confirm(t('settings.restaurantSetup.confirmDeleteTable'))) return;
    try {
      await deleteTable.mutateAsync(id);
      toast.success(t('settings.restaurantSetup.tableDeleted'));
    } catch (err) {
      toast.error(t('settings.restaurantSetup.failed'));
      console.error(err);
    }
  };

  const startEditing = (table: RestaurantTable) => {
    setEditingId(table.id);
    setFormData({ name: table.name, seats: table.seats });
  };

  if (loadingTables) {
    return <div className="text-center py-10 text-slate-400">{t('auth.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add Button */}
      {!isAdding && (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition"
        >
          <Plus size={18} />
          {t('settings.restaurantSetup.addTable')}
        </button>
      )}

      {/* Add Form */}
      {isAdding && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <h3 className="font-semibold">{t('settings.restaurantSetup.addTable')}</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.restaurantSetup.tableName')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., T-1, Table 5"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.restaurantSetup.tableSeats')}</label>
              <input
                type="number"
                value={formData.seats}
                onChange={(e) => setFormData({ ...formData, seats: parseInt(e.target.value) || 1 })}
                min="1"
                className="w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 dark:bg-slate-900"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddTable}
              disabled={createTable.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <Save size={16} />
              {createTable.isPending ? t('settings.restaurantSetup.saving') : t('settings.restaurantSetup.save')}
            </button>
            <button
              onClick={() => { setIsAdding(false); setFormData({ name: '', seats: 4 }); }}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600"
            >
              {t('settings.restaurantSetup.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Tables List */}
      {tables.length === 0 && !isAdding ? (
        <div className="text-center py-10 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700">
          <Armchair size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-slate-500">{t('settings.restaurantSetup.noTables')}</p>
          <p className="text-sm text-slate-400">{t('settings.restaurantSetup.noTablesHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map(table => (
            <div
              key={table.id}
              className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm"
            >
              {editingId === table.id ? (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
                  />
                  <input
                    type="number"
                    value={formData.seats}
                    onChange={(e) => setFormData({ ...formData, seats: parseInt(e.target.value) || 1 })}
                    min="1"
                    className="w-full px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateTable(table)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm"
                    >
                      <Save size={14} /> {t('settings.restaurantSetup.save')}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg text-sm"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold">{table.name}</div>
                    <div className="text-sm text-slate-500">{table.seats} {t('settings.restaurantSetup.seats')}</div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEditing(table)}
                      className="p-2 text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteTable(table.id)}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
// MENU MANAGER
// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•

function MenuManager() {
  const { t, formatCurrency } = useLanguage();
  const { 
    categories, 
    loadingMenu, 
    createCategory, 
    deleteCategory,
    createMenuItem,
    deleteMenuItem,
    toggleItem86
  } = useRestaurant();
  
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [selectedCategoryType, setSelectedCategoryType] = useState<CategoryType | ''>('');
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [isAddingItem, setIsAddingItem] = useState<string | null>(null);
  const [useImageLink, setUseImageLink] = useState(true);
  const [newItem, setNewItem] = useState({ name: '', price: 0, description: '', imageUrl: '', allergens: [] as string[] });
  
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    type: 'category' | 'item' | null;
    id: string | null;
    title: string;
    description: string;
  }>({
    isOpen: false,
    type: null,
    id: null,
    title: '',
    description: ''
  });

  const getCategoryLabel = (type: CategoryType) => {
    return t(`settings.restaurantSetup.categoryTypes.${type}`);
  };

  const handleAddCategory = async () => {
    if (!selectedCategoryType) {
      toast.error(t('settings.restaurantSetup.categoryRequired'));
      return;
    }
    try {
      await createCategory.mutateAsync({ name: getCategoryLabel(selectedCategoryType), sort_order: categories.length });
      toast.success(t('settings.restaurantSetup.categoryAdded'));
      setSelectedCategoryType('');
      setIsAddingCategory(false);
    } catch (err) {
      toast.error(t('settings.restaurantSetup.failed'));
      console.error(err);
    }
  };

  const handleDeleteCategory = (id: string) => {
    setConfirmState({
      isOpen: true,
      type: 'category',
      id,
      title: t('settings.restaurantSetup.deleteCategory'),
      description: t('settings.restaurantSetup.confirmDeleteCategory')
    });
  };

  const handleDeleteItem = (id: string) => {
    setConfirmState({
      isOpen: true,
      type: 'item',
      id,
      title: t('settings.restaurantSetup.deleteItem'),
      description: t('settings.restaurantSetup.confirmDeleteItem')
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmState.id) return;
    
    try {
      if (confirmState.type === 'category') {
        await deleteCategory.mutateAsync(confirmState.id);
        toast.success(t('settings.restaurantSetup.categoryDeleted'));
      } else if (confirmState.type === 'item') {
        await deleteMenuItem.mutateAsync(confirmState.id);
        toast.success(t('settings.restaurantSetup.itemDeleted'));
      }
    } catch (err) {
      toast.error(t('settings.restaurantSetup.failed'));
      console.error(err);
    } finally {
      setConfirmState(prev => ({ ...prev, isOpen: false }));
    }
  };

  const handleAddItem = async (categoryId: string) => {
    if (!newItem.name.trim() || newItem.price <= 0) {
      toast.error(t('settings.restaurantSetup.nameAndPriceRequired'));
      return;
    }
    try {
      await createMenuItem.mutateAsync({
        category_id: categoryId,
        name: newItem.name,
        price: newItem.price,
        description: newItem.description || null,
        image_url: newItem.imageUrl || undefined,
        allergens: newItem.allergens
      });
      toast.success(t('settings.restaurantSetup.itemAdded'));
      setNewItem({ name: '', price: 0, description: '', imageUrl: '', allergens: [] });
      setIsAddingItem(null);
    } catch (err) {
      toast.error(t('settings.restaurantSetup.failed'));
      console.error(err);
    }
  };



  if (loadingMenu) {
    return <div className="text-center py-10 text-slate-400">{t('auth.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add Category Button */}
      {!isAddingCategory && (
        <button
          onClick={() => setIsAddingCategory(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition"
        >
          <Plus size={18} />
          {t('settings.restaurantSetup.addCategory')}
        </button>
      )}

      {/* Add Category Form - Select Type First */}
      {isAddingCategory && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <h3 className="font-semibold">{t('settings.restaurantSetup.selectCategory')}</h3>
          
          {/* Category Type Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {CATEGORY_TYPES.map(type => (
              <button
                key={type}
                onClick={() => setSelectedCategoryType(type)}
                className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  selectedCategoryType === type
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-600'
                    : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                }`}
              >
                {getCategoryLabel(type)}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleAddCategory}
              disabled={!selectedCategoryType || createCategory.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg disabled:opacity-50"
            >
              <Save size={16} /> {createCategory.isPending ? t('settings.restaurantSetup.saving') : t('settings.restaurantSetup.save')}
            </button>
            <button
              onClick={() => { setIsAddingCategory(false); setSelectedCategoryType(''); }}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
            >
              {t('settings.restaurantSetup.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Categories List */}
      {categories.length === 0 && !isAddingCategory ? (
        <div className="text-center py-10 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700">
          <ChefHat size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-slate-500">{t('settings.restaurantSetup.noCategories')}</p>
          <p className="text-sm text-slate-400">{t('settings.restaurantSetup.noCategoriesHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {categories.map(category => (
            <div
              key={category.id}
              className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              {/* Category Header */}
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
                onClick={() => setExpandedCategory(expandedCategory === category.id ? null : category.id)}
              >
                <div className="flex items-center gap-3">
                  <UtensilsCrossed size={20} className="text-emerald-500" />
                  <span className="font-semibold">{category.name}</span>
                  <span className="text-xs text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                    {category.items?.length || 0} {t('settings.restaurantSetup.items')}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteCategory(category.id); }}
                    className="p-2 text-slate-400 hover:text-rose-500"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Category Items */}
              {expandedCategory === category.id && (
                <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-950/50">
                  {/* Items List */}
                  {category.items && category.items.length > 0 ? (
                    <div className="space-y-2">
                      {category.items.map(item => (
                        <div
                          key={item.id}
                          className="group flex items-center justify-between p-3 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800"
                        >
                          <div className="flex items-center gap-3">
                            {/* Image or Placeholder */}
                            {item.image_url ? (
                              <img 
                                src={item.image_url} 
                                alt={item.name}
                                className={`w-10 h-10 rounded-lg object-cover bg-slate-100 dark:bg-slate-800 ${!item.is_available ? 'opacity-50 grayscale' : ''}`}
                              />
                            ) : (
                              <div className={`w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-lg flex items-center justify-center text-slate-400 ${!item.is_available ? 'opacity-50' : ''}`}>
                                <ImageIcon size={16} />
                              </div>
                            )}
                            <div>
                              <div className={`font-medium ${!item.is_available ? 'text-slate-400 line-through' : ''}`}>
                                {item.name}
                              </div>
                              {item.description && (
                                <div className="text-xs text-slate-500">{item.description}</div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-bold text-emerald-600">{formatCurrency(item.price)}</span>
                            <button
                               title={item.is_available ? "86 Item (Make Unavailable)" : "Make Available"}
                               onClick={() => toggleItem86.mutate({ id: item.id, is_available: !item.is_available })}
                               className={`p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity ${
                                 item.is_available ? 'text-slate-300 hover:text-orange-500' : 'text-orange-500 bg-orange-50'
                               }`}
                            >
                              <UtensilsCrossed size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1 text-slate-400 hover:text-rose-500"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 text-center py-4">{t('settings.restaurantSetup.noItems')}</p>
                  )}

                  {/* Add Item Form */}
                  {isAddingItem === category.id ? (
                    <div className="p-3 bg-white dark:bg-slate-900 rounded-lg border border-emerald-200 dark:border-emerald-800 space-y-3">
                      <input
                        type="text"
                        value={newItem.name}
                        onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                        placeholder={t('settings.restaurantSetup.itemName')}
                        className="w-full px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
                      />
                      <div className="grid grid-cols-2 gap-3">
                        <input
                          type="number"
                          value={newItem.price || ''}
                          onChange={(e) => setNewItem({ ...newItem, price: parseFloat(e.target.value) || 0 })}
                          placeholder={t('settings.restaurantSetup.itemPrice')}
                          className="px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
                        />
                        <input
                          type="text"
                          value={newItem.description}
                          onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                          placeholder={t('settings.restaurantSetup.itemDescription')}
                          className="px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
                        />
                      </div>
                      
                      {/* Allergen Selection */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase">
                          {t('settings.restaurantSetup.allergens')}
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {ALLERGEN_LIST.map(allergen => {
                            const isSelected = newItem.allergens.includes(allergen);
                            return (
                              <button
                                key={allergen}
                                onClick={() => {
                                  if (isSelected) {
                                    setNewItem({ ...newItem, allergens: newItem.allergens.filter(a => a !== allergen) });
                                  } else {
                                    setNewItem({ ...newItem, allergens: [...newItem.allergens, allergen] });
                                  }
                                }}
                                className={`px-2 py-1 rounded-md text-xs font-medium border transition-colors ${
                                  isSelected 
                                    ? 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800' 
                                    : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700 hover:bg-slate-100'
                                }`}
                              >
                                {allergen}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      
                      {/* Image Input Method Toggle */}
                      <div className="flex gap-4 border-b border-slate-200 dark:border-slate-800 mb-2">
                        <button
                          onClick={() => setUseImageLink(true)}
                          className={`pb-2 text-sm font-medium transition-colors ${
                            useImageLink 
                              ? 'text-emerald-600 border-b-2 border-emerald-600' 
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {t('settings.restaurantSetup.imageLink')}
                        </button>
                        <button
                          onClick={() => setUseImageLink(false)}
                          className={`pb-2 text-sm font-medium transition-colors ${
                            !useImageLink 
                              ? 'text-emerald-600 border-b-2 border-emerald-600' 
                              : 'text-slate-500 hover:text-slate-700'
                          }`}
                        >
                          {t('settings.restaurantSetup.uploadImage')}
                        </button>
                      </div>

                      {/* Image Input */}
                      {useImageLink ? (
                        <input
                          type="text"
                          value={newItem.imageUrl}
                          onChange={(e) => setNewItem({ ...newItem, imageUrl: e.target.value })}
                          placeholder={t('settings.restaurantSetup.itemPhoto')}
                          className="w-full px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
                        />
                      ) : (
                        <FileUpload
                          folderName="menu-items"
                          bucketName="restaurant-assets"
                          onUploadComplete={(attachment) => {
                            setNewItem({ ...newItem, imageUrl: attachment.url });
                          }}
                        />
                      )}
                      
                      {/* Preview if image exists */}
                      {newItem.imageUrl && (
                        <div className="relative w-full h-32 bg-slate-100 rounded-lg overflow-hidden">
                          <img src={newItem.imageUrl} alt="Preview" className="w-full h-full object-cover" />
                          <button
                             onClick={() => setNewItem({ ...newItem, imageUrl: '' })}
                             className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => handleAddItem(category.id)}
                          className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm"
                        >
                          <Save size={14} /> {t('settings.restaurantSetup.addMenuItem')}
                        </button>
                        <button
                          onClick={() => { setIsAddingItem(null); setNewItem({ name: '', price: 0, description: '', imageUrl: '', allergens: [] }); }}
                          className="px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg text-sm"
                        >
                          {t('settings.restaurantSetup.cancel')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setIsAddingItem(category.id)}
                      className="flex items-center gap-2 text-emerald-600 text-sm font-medium hover:underline"
                    >
                      <Plus size={16} /> {t('settings.restaurantSetup.addMenuItem')}
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmState.isOpen}
        onClose={() => setConfirmState(prev => ({ ...prev, isOpen: false }))}
        onConfirm={handleConfirmDelete}
        title={confirmState.title}
        description={confirmState.description}
        confirmText={t('settings.restaurantSetup.delete')}
        cancelText={t('settings.restaurantSetup.cancel')}
        variant="danger"
        isLoading={deleteCategory.isPending || deleteMenuItem.isPending}
      />
    </div>
  );
}

// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•
// STAFF MANAGER
// ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•ג•

function StaffManager() {
  const { t, formatCurrency } = useLanguage();
  const { staff, loadingStaff, createStaff, updateStaff, deleteStaff } = useRestaurant();
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<{ full_name: string; role: StaffRole; hourly_rate: number; pin_code: string }>({ 
    full_name: '', 
    role: 'Waiter', 
    hourly_rate: 0,
    pin_code: ''
  });

  const roles: { value: StaffRole; labelKey: string }[] = [
    { value: 'Waiter', labelKey: 'settings.restaurantSetup.staffRoles.waiter' },
    { value: 'Chef', labelKey: 'settings.restaurantSetup.staffRoles.chef' },
    { value: 'Manager', labelKey: 'settings.restaurantSetup.staffRoles.manager' },
    { value: 'Other', labelKey: 'settings.restaurantSetup.staffRoles.other' },
  ];

  const handleAddStaff = async () => {
    if (!formData.full_name.trim()) {
      toast.error(t('settings.restaurantSetup.staffNameRequired'));
      return;
    }
    try {
      await createStaff.mutateAsync({ 
        full_name: formData.full_name, 
        role: formData.role, 
        hourly_rate: formData.hourly_rate,
        pin_code: formData.pin_code || '0000' // Default PIN if empty
      });
      toast.success(t('settings.restaurantSetup.staffAdded'));
      setFormData({ full_name: '', role: 'Waiter', hourly_rate: 0, pin_code: '' });
      setIsAdding(false);
    } catch (err) {
      toast.error(t('settings.restaurantSetup.failed'));
      console.error(err);
    }
  };

  const handleUpdateStaff = async (staffMember: RestaurantStaff) => {
    try {
      await updateStaff.mutateAsync({ 
        id: staffMember.id, 
        full_name: formData.full_name, 
        role: formData.role, 
        hourly_rate: formData.hourly_rate,
        pin_code: formData.pin_code
      });
      toast.success(t('settings.restaurantSetup.staffUpdated'));
      setEditingId(null);
    } catch (err) {
      toast.error(t('settings.restaurantSetup.failed'));
      console.error(err);
    }
  };

  const handleDeleteStaff = async (id: string) => {
    if (!confirm(t('settings.restaurantSetup.confirmDeleteStaff'))) return;
    try {
      await deleteStaff.mutateAsync(id);
      toast.success(t('settings.restaurantSetup.staffRemoved'));
    } catch (err) {
      toast.error(t('settings.restaurantSetup.failed'));
      console.error(err);
    }
  };

  const startEditing = (staffMember: RestaurantStaff) => {
    setEditingId(staffMember.id);
    setFormData({ 
      full_name: staffMember.full_name, 
      role: staffMember.role, 
      hourly_rate: staffMember.hourly_rate,
      pin_code: staffMember.pin_code || ''
    });
  };

  const getRoleColor = (role: StaffRole) => {
    switch (role) {
      case 'Manager': return 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400';
      case 'Chef': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
      case 'Waiter': return 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400';
      default: return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400';
    }
  };

  const getRoleLabel = (role: StaffRole) => {
    const roleConfig = roles.find(r => r.value === role);
    return roleConfig ? t(roleConfig.labelKey) : role;
  };

  if (loadingStaff) {
    return <div className="text-center py-10 text-slate-400">{t('auth.loading')}</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add Button */}
      {!isAdding && (
        <button
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 transition"
        >
          <Plus size={18} />
          {t('settings.restaurantSetup.addStaff')}
        </button>
      )}

      {/* Add Form */}
      {isAdding && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
          <h3 className="font-semibold">{t('settings.restaurantSetup.addStaff')}</h3>
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.restaurantSetup.fullName')}</label>
              <input
                type="text"
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.restaurantSetup.role')}</label>
              <select
                value={formData.role}
                onChange={(e) => setFormData({ ...formData, role: e.target.value as StaffRole })}
                className="w-full px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
              >
                {roles.map(role => (
                  <option key={role.value} value={role.value}>{t(role.labelKey)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.restaurantSetup.hourlyRate')}</label>
              <input
                type="number"
                value={formData.hourly_rate || ''}
                onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || 0 })}
                min="0"
                className="w-full px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('settings.restaurantSetup.pinCode')}</label>
              <input
                type="text"
                maxLength={6}
                value={formData.pin_code}
                onChange={(e) => setFormData({ ...formData, pin_code: e.target.value.replace(/\D/g, '') })}
                className="w-full px-3 py-2 rounded-lg border dark:bg-slate-900 dark:border-slate-700 tracking-widest text-center font-mono"
                placeholder="0000"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleAddStaff}
              disabled={createStaff.isPending}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg"
            >
              <Save size={16} /> {createStaff.isPending ? t('settings.restaurantSetup.saving') : t('settings.restaurantSetup.save')}
            </button>
            <button
              onClick={() => { setIsAdding(false); setFormData({ full_name: '', role: 'Waiter', hourly_rate: 0, pin_code: '' }); }}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg"
            >
              {t('settings.restaurantSetup.cancel')}
            </button>
          </div>
        </div>
      )}

      {/* Staff List */}
      {staff.length === 0 && !isAdding ? (
        <div className="text-center py-10 bg-slate-50 dark:bg-slate-800 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700">
          <Users size={48} className="mx-auto mb-4 text-slate-300" />
          <p className="text-slate-500">{t('settings.restaurantSetup.noStaff')}</p>
          <p className="text-sm text-slate-400">{t('settings.restaurantSetup.noStaffHint')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {staff.map(staffMember => (
            <div
              key={staffMember.id}
              className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800"
            >
              {editingId === staffMember.id ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-4 gap-3">
                    <input
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      className="px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
                      placeholder={t('settings.restaurantSetup.fullName')}
                    />
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value as StaffRole })}
                      className="px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
                    >
                      {roles.map(role => (
                        <option key={role.value} value={role.value}>{t(role.labelKey)}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      value={formData.hourly_rate || ''}
                      onChange={(e) => setFormData({ ...formData, hourly_rate: parseFloat(e.target.value) || 0 })}
                      className="px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700"
                      placeholder={t('settings.restaurantSetup.hourlyRate')}
                    />
                    <input
                      type="text"
                      maxLength={6}
                      value={formData.pin_code}
                      onChange={(e) => setFormData({ ...formData, pin_code: e.target.value.replace(/\D/g, '') })}
                      className="px-3 py-2 rounded-lg border dark:bg-slate-800 dark:border-slate-700 tracking-widest text-center font-mono"
                      placeholder="PIN"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateStaff(staffMember)}
                      className="flex items-center gap-1 px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm"
                    >
                      <Save size={14} /> {t('settings.restaurantSetup.save')}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded-lg text-sm"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center text-lg font-bold text-slate-500">
                      {staffMember.full_name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-semibold">{staffMember.full_name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${getRoleColor(staffMember.role)}`}>
                          {getRoleLabel(staffMember.role)}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          {formatCurrency(staffMember.hourly_rate)}{t('settings.restaurantSetup.perHour')}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => startEditing(staffMember)}
                      className="p-2 text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteStaff(staffMember.id)}
                      className="p-2 text-slate-400 hover:text-rose-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

