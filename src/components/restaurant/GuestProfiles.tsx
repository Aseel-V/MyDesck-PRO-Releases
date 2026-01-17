// ============================================================================
// GUEST PROFILE PANEL - View and Manage Guest Information
// Version: 1.0.0 | Production-Ready
// ============================================================================

import { useState, useMemo } from 'react';
import { useGuestProfiles } from '../../hooks/useRestaurant';
import { GuestProfile, GuestTag } from '../../types/restaurant';
import { 
  User, 
  Phone, 
  Mail, 
  Star, 
  Calendar, 
  Heart,
  AlertTriangle,
  Edit2,
  Save,
  X,
  Search,
  Plus,
  Gift,
  MessageCircle,
  Tag,
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const TAG_COLORS: Record<GuestTag, string> = {
  VIP: 'bg-purple-100 text-purple-800 border-purple-200',
  Regular: 'bg-blue-100 text-blue-800 border-blue-200',
  Difficult: 'bg-red-100 text-red-800 border-red-200',
  Press: 'bg-green-100 text-green-800 border-green-200',
  Influencer: 'bg-pink-100 text-pink-800 border-pink-200',
  Friend: 'bg-amber-100 text-amber-800 border-amber-200',
  Blacklist: 'bg-slate-800 text-white border-slate-900',
  Birthday: 'bg-rose-100 text-rose-800 border-rose-200',
  Anniversary: 'bg-indigo-100 text-indigo-800 border-indigo-200',
};

const VIP_LEVELS = [
  { level: 0, label: 'Standard', color: 'text-slate-500' },
  { level: 1, label: 'Bronze', color: 'text-amber-600' },
  { level: 2, label: 'Silver', color: 'text-slate-400' },
  { level: 3, label: 'Gold', color: 'text-yellow-500' },
];

// ============================================================================
// GUEST CARD COMPONENT
// ============================================================================

interface GuestCardProps {
  guest: GuestProfile;
  onSelect: () => void;
  isSelected: boolean;
}

function GuestCard({ guest, onSelect, isSelected }: GuestCardProps) {
  const vipInfo = VIP_LEVELS.find(v => v.level === guest.vip_level) || VIP_LEVELS[0];
  
  return (
    <div
      onClick={onSelect}
      className={`
        p-4 rounded-xl border cursor-pointer transition-all
        ${isSelected 
          ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-700 ring-2 ring-blue-400' 
          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-blue-300'
        }
      `}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className={`
            w-10 h-10 rounded-full flex items-center justify-center text-white font-bold
            ${guest.vip_level >= 2 ? 'bg-gradient-to-br from-yellow-400 to-amber-600' : 'bg-slate-400'}
          `}>
            {guest.first_name.charAt(0)}
            {guest.last_name?.charAt(0) || ''}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800 dark:text-white">
                {guest.full_name}
              </span>
              {guest.vip_level > 0 && (
                <Star size={14} className={`fill-current ${vipInfo.color}`} />
              )}
            </div>
            <div className="text-sm text-slate-500">
              {guest.visit_count} visits • ₪{(guest.average_check || 0).toFixed(0)} avg
            </div>
          </div>
        </div>
      </div>
      
      {/* Tags */}
      {guest.tags && guest.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {guest.tags.slice(0, 3).map((tag) => (
            <span 
              key={tag}
              className={`px-2 py-0.5 rounded-full text-xs font-medium border ${TAG_COLORS[tag]}`}
            >
              {tag}
            </span>
          ))}
          {guest.tags.length > 3 && (
            <span className="text-xs text-slate-500">+{guest.tags.length - 3}</span>
          )}
        </div>
      )}
      
      {/* Allergies Warning */}
      {guest.allergies && guest.allergies.length > 0 && (
        <div className="flex items-center gap-1 mt-2 text-xs text-red-600">
          <AlertTriangle size={12} />
          <span className="truncate">{guest.allergies.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// GUEST DETAIL PANEL
// ============================================================================

interface GuestDetailPanelProps {
  guest: GuestProfile;
  onUpdate: (data: Partial<GuestProfile>) => void;
  onClose: () => void;
}

function GuestDetailPanel({ guest, onUpdate, onClose }: GuestDetailPanelProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState(guest);
  
  const vipInfo = VIP_LEVELS.find(v => v.level === guest.vip_level) || VIP_LEVELS[0];
  
  const handleSave = () => {
    onUpdate(formData);
    setIsEditing(false);
  };
  
  const addTag = (tag: GuestTag) => {
    if (!formData.tags.includes(tag)) {
      setFormData({ ...formData, tags: [...formData.tags, tag] });
    }
  };
  
  const removeTag = (tag: GuestTag) => {
    setFormData({ ...formData, tags: formData.tags.filter(t => t !== tag) });
  };
  
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500 to-indigo-600 p-6 text-white">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className={`
              w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold
              ${guest.vip_level >= 2 ? 'bg-gradient-to-br from-yellow-400 to-amber-600' : 'bg-white/20'}
            `}>
              {guest.first_name.charAt(0)}{guest.last_name?.charAt(0) || ''}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold">{guest.full_name}</h2>
                {guest.vip_level > 0 && (
                  <span className="px-2 py-0.5 bg-white/20 rounded-full text-xs font-bold">
                    {vipInfo.label}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-white/80 text-sm">
                {guest.phone && (
                  <span className="flex items-center gap-1">
                    <Phone size={12} />
                    {guest.phone}
                  </span>
                )}
                {guest.email && (
                  <span className="flex items-center gap-1">
                    <Mail size={12} />
                    {guest.email}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {isEditing ? (
              <>
                <button onClick={() => setIsEditing(false)} className="p-2 hover:bg-white/10 rounded-lg">
                  <X size={20} />
                </button>
                <button onClick={handleSave} className="p-2 hover:bg-white/10 rounded-lg">
                  <Save size={20} />
                </button>
              </>
            ) : (
              <button onClick={() => setIsEditing(true)} className="p-2 hover:bg-white/10 rounded-lg">
                <Edit2 size={20} />
              </button>
            )}
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>
      </div>
      
      {/* Stats Row */}
      <div className="grid grid-cols-4 border-b border-slate-200 dark:border-slate-700">
        <div className="p-4 text-center border-r border-slate-200 dark:border-slate-700">
          <div className="text-2xl font-bold text-slate-800 dark:text-white">
            {guest.visit_count}
          </div>
          <div className="text-xs text-slate-500">Visits</div>
        </div>
        <div className="p-4 text-center border-r border-slate-200 dark:border-slate-700">
          <div className="text-2xl font-bold text-slate-800 dark:text-white">
            ₪{(guest.total_lifetime_spend || 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-500">Total Spend</div>
        </div>
        <div className="p-4 text-center border-r border-slate-200 dark:border-slate-700">
          <div className="text-2xl font-bold text-slate-800 dark:text-white">
            ₪{(guest.average_check || 0).toFixed(0)}
          </div>
          <div className="text-xs text-slate-500">Avg Check</div>
        </div>
        <div className="p-4 text-center">
          <div className="text-2xl font-bold text-slate-800 dark:text-white">
            {guest.last_visit_date 
              ? new Date(guest.last_visit_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
              : '-'
            }
          </div>
          <div className="text-xs text-slate-500">Last Visit</div>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Tags */}
        <div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
            <Tag size={14} />
            Tags
          </h3>
          <div className="flex flex-wrap gap-2">
            {formData.tags.map((tag) => (
              <span 
                key={tag}
                className={`px-3 py-1 rounded-full text-sm font-medium border flex items-center gap-1 ${TAG_COLORS[tag]}`}
              >
                {tag}
                {isEditing && (
                  <button onClick={() => removeTag(tag)} className="hover:opacity-70">
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
            {isEditing && (
              <div className="relative group">
                <button className="px-3 py-1 rounded-full text-sm border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-500">
                  + Add Tag
                </button>
                <div className="hidden group-hover:block absolute z-10 mt-1 bg-white dark:bg-slate-800 border rounded-lg shadow-lg p-2 w-40">
                  {(Object.keys(TAG_COLORS) as GuestTag[])
                    .filter(t => !formData.tags.includes(t))
                    .map((tag) => (
                      <button
                        key={tag}
                        onClick={() => addTag(tag)}
                        className="w-full text-left px-2 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 rounded"
                      >
                        {tag}
                      </button>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Allergies & Dietary */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <AlertTriangle size={14} className="text-red-500" />
              Allergies
            </h3>
            {isEditing ? (
              <input
                type="text"
                value={formData.allergies?.join(', ') || ''}
                onChange={(e) => setFormData({ ...formData, allergies: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm"
                placeholder="e.g., Nuts, Shellfish, Dairy"
              />
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {guest.allergies && guest.allergies.length > 0 
                  ? guest.allergies.join(', ')
                  : <span className="text-slate-400">None listed</span>
                }
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <Heart size={14} className="text-green-500" />
              Dietary Restrictions
            </h3>
            {isEditing ? (
              <input
                type="text"
                value={formData.dietary_restrictions?.join(', ') || ''}
                onChange={(e) => setFormData({ ...formData, dietary_restrictions: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm"
                placeholder="e.g., Vegetarian, Vegan, Gluten-free"
              />
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {guest.dietary_restrictions && guest.dietary_restrictions.length > 0 
                  ? guest.dietary_restrictions.join(', ')
                  : <span className="text-slate-400">None listed</span>
                }
              </div>
            )}
          </div>
        </div>
        
        {/* Preferences */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              Seating Preference
            </h3>
            {isEditing ? (
              <select
                value={formData.seating_preference}
                onChange={(e) => setFormData({ ...formData, seating_preference: e.target.value as typeof formData.seating_preference })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm"
              >
                <option value="any">Any</option>
                <option value="booth">Booth</option>
                <option value="table">Table</option>
                <option value="patio">Patio</option>
                <option value="bar">Bar</option>
              </select>
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-400 capitalize">
                {guest.seating_preference || 'Any'}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">
              VIP Level
            </h3>
            {isEditing ? (
              <select
                value={formData.vip_level}
                onChange={(e) => setFormData({ ...formData, vip_level: parseInt(e.target.value) as 0 | 1 | 2 | 3 })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm"
              >
                {VIP_LEVELS.map((v) => (
                  <option key={v.level} value={v.level}>{v.label}</option>
                ))}
              </select>
            ) : (
              <div className={`text-sm font-medium ${vipInfo.color}`}>
                {vipInfo.label}
              </div>
            )}
          </div>
        </div>
        
        {/* Special Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <Gift size={14} className="text-pink-500" />
              Birthday
            </h3>
            {isEditing ? (
              <input
                type="date"
                value={formData.birthdate || ''}
                onChange={(e) => setFormData({ ...formData, birthdate: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm"
              />
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {guest.birthdate 
                  ? new Date(guest.birthdate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                  : <span className="text-slate-400">Not set</span>
                }
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
              <Calendar size={14} className="text-indigo-500" />
              Anniversary
            </h3>
            {isEditing ? (
              <input
                type="date"
                value={formData.anniversary || ''}
                onChange={(e) => setFormData({ ...formData, anniversary: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm"
              />
            ) : (
              <div className="text-sm text-slate-600 dark:text-slate-400">
                {guest.anniversary 
                  ? new Date(guest.anniversary).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                  : <span className="text-slate-400">Not set</span>
                }
              </div>
            )}
          </div>
        </div>
        
        {/* Notes */}
        <div>
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
            <MessageCircle size={14} />
            Notes
          </h3>
          {isEditing ? (
            <textarea
              value={formData.notes || ''}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm"
              rows={3}
              placeholder="Any special notes about this guest..."
            />
          ) : (
            <div className="text-sm text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
              {guest.notes || <span className="text-slate-400 italic">No notes</span>}
            </div>
          )}
        </div>
        
        {/* Marketing Preferences */}
        <div className="border-t border-slate-200 dark:border-slate-700 pt-4">
          <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3">
            Communication Preferences
          </h3>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.marketing_opt_in}
                onChange={(e) => isEditing && setFormData({ ...formData, marketing_opt_in: e.target.checked })}
                disabled={!isEditing}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">Marketing emails</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formData.whatsapp_opt_in}
                onChange={(e) => isEditing && setFormData({ ...formData, whatsapp_opt_in: e.target.checked })}
                disabled={!isEditing}
                className="w-4 h-4 rounded"
              />
              <span className="text-sm text-slate-600 dark:text-slate-400">WhatsApp messages</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN GUEST PROFILES COMPONENT
// ============================================================================

export default function GuestProfiles() {
  const { guests, isLoading, updateGuest } = useGuestProfiles();
  
  const [selectedGuestId, setSelectedGuestId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterVip, setFilterVip] = useState(false);
  
  const selectedGuest = guests.find(g => g.id === selectedGuestId);
  
  // Filter guests
  const filteredGuests = useMemo(() => {
    let filtered = [...guests];
    
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(g => 
        g.full_name.toLowerCase().includes(q) ||
        g.phone?.includes(q) ||
        g.email?.toLowerCase().includes(q)
      );
    }
    
    if (filterVip) {
      filtered = filtered.filter(g => g.vip_level > 0);
    }
    
    return filtered.sort((a, b) => (b.visit_count || 0) - (a.visit_count || 0));
  }, [guests, searchQuery, filterVip]);
  
  
  const handleUpdateGuest = async (data: Partial<GuestProfile>) => {
    if (!selectedGuestId) return;
    await updateGuest.mutateAsync({ id: selectedGuestId, ...data });
  };
  
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex">
      {/* Guest List Panel */}
      <div className="w-96 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-800 dark:text-white">Guests</h1>
            <button
              className="p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Plus size={18} />
            </button>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone, email..."
              className="w-full pl-9 pr-4 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700 text-sm"
            />
          </div>
          
          {/* Filters */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={() => setFilterVip(!filterVip)}
              className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${
                filterVip 
                  ? 'bg-yellow-100 text-yellow-800 border border-yellow-200' 
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              <Star size={12} />
              VIP Only
            </button>
            <span className="text-xs text-slate-500">
              {filteredGuests.length} guests
            </span>
          </div>
        </div>
        
        {/* Guest List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          ) : filteredGuests.length === 0 ? (
            <div className="text-center py-8">
              <User size={32} className="mx-auto text-slate-300 mb-2" />
              <p className="text-slate-500 text-sm">No guests found</p>
            </div>
          ) : (
            filteredGuests.map((guest) => (
              <GuestCard
                key={guest.id}
                guest={guest}
                onSelect={() => setSelectedGuestId(guest.id)}
                isSelected={selectedGuestId === guest.id}
              />
            ))
          )}
        </div>
      </div>
      
      {/* Detail Panel */}
      <div className="flex-1 p-6">
        {selectedGuest ? (
          <GuestDetailPanel
            guest={selectedGuest}
            onUpdate={handleUpdateGuest}
            onClose={() => setSelectedGuestId(null)}
          />
        ) : (
          <div className="h-full flex items-center justify-center text-slate-400">
            <div className="text-center">
              <User size={48} className="mx-auto mb-4 opacity-30" />
              <p>Select a guest to view details</p>
            </div>
          </div>
        )}
      </div>
      
      {/* Add Guest Modal would go here */}
    </div>
  );
}
