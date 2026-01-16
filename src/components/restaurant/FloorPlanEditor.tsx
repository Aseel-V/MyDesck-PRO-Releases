// ============================================================================
// FLOOR PLAN EDITOR - Drag & Drop Table Management
// Version: 1.0.0 | Production-Ready
// ============================================================================

import { useState, useRef, useCallback, useMemo } from 'react';
import { useRestaurant } from '../../hooks/useRestaurant';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
import { useLanguage } from '../../contexts/LanguageContext';
import { 
  RestaurantTable, 
  TableStatus, 
  TableShape, 
  FloorZone 
} from '../../types/restaurant';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  Users, 
  Circle,
  Square,
  RectangleHorizontal,
  Armchair,
  GlassWater,
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const TABLE_COLORS: Record<TableStatus, string> = {
  free: 'bg-emerald-500 border-emerald-600 shadow-emerald-200',
  occupied: 'bg-rose-500 border-rose-600 shadow-rose-200',
  billed: 'bg-amber-400 border-amber-500 shadow-amber-200',
  reserved: 'bg-sky-500 border-sky-600 shadow-sky-200',
  dirty: 'bg-stone-400 border-stone-500 shadow-stone-200',
  blocked: 'bg-slate-600 border-slate-700 shadow-slate-200',
};


const SHAPES: { id: TableShape; label: string; icon: React.ReactNode }[] = [
  { id: 'round', label: 'Round', icon: <Circle size={16} /> },
  { id: 'square', label: 'Square', icon: <Square size={16} /> },
  { id: 'rectangle', label: 'Rectangle', icon: <RectangleHorizontal size={16} /> },
  { id: 'booth', label: 'Booth', icon: <Armchair size={16} /> },
  { id: 'bar', label: 'Bar', icon: <GlassWater size={16} /> },
];

const ZONES: { id: FloorZone; label: string }[] = [
  { id: 'indoor', label: 'Indoor' },
  { id: 'outdoor', label: 'Outdoor' },
  { id: 'patio', label: 'Patio' },
  { id: 'private', label: 'Private Room' },
  { id: 'bar_area', label: 'Bar Area' },
];

// ============================================================================
// TABLE ELEMENT COMPONENT
// ============================================================================

interface TableElementProps {
  table: RestaurantTable;
  isEditing: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDrag: (x: number, y: number) => void;
  onClick: () => void;
}

function TableElement({ 
  table, 
  isEditing, 
  isSelected, 
  onSelect, 
  onDrag,
  onClick 
}: TableElementProps) {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, tableX: 0, tableY: 0 });
  
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditing) {
      onClick();
      return;
    }
    
    e.preventDefault();
    setIsDragging(true);
    onSelect();
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tableX: table.position_x,
      tableY: table.position_y,
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      onDrag(
        Math.max(0, dragStartRef.current.tableX + dx),
        Math.max(0, dragStartRef.current.tableY + dy)
      );
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
    
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };
  
  // Compute shape styles
  const shapeStyles = useMemo(() => {
    const base = {
      width: table.width || 80,
      height: table.height || 80,
      transform: `rotate(${table.rotation || 0}deg)`,
    };
    
    switch (table.shape) {
      case 'round':
        return { ...base, borderRadius: '50%' };
      case 'square':
        return { ...base, borderRadius: '12px' };
      case 'rectangle':
        return { ...base, width: (table.width || 80) * 1.5, borderRadius: '12px' };
      case 'booth':
        return { ...base, borderRadius: '12px 12px 40px 40px' };
      case 'bar':
        return { ...base, width: (table.width || 80) * 2, height: 50, borderRadius: '8px' };
      default:
        return { ...base, borderRadius: '50%' };
    }
  }, [table]);
  
  return (
    <div
      className={`
        absolute flex flex-col items-center justify-center cursor-pointer
        border-4 transition-all text-white font-bold
        ${TABLE_COLORS[table.status]}
        ${isDragging ? 'scale-105 shadow-2xl z-50' : 'shadow-lg'}
        ${isSelected ? 'ring-4 ring-blue-400 ring-offset-2' : ''}
        ${isEditing ? 'cursor-move' : 'hover:scale-105'}
      `}
      style={{
        left: table.position_x,
        top: table.position_y,
        ...shapeStyles,
      }}
      onMouseDown={handleMouseDown}
    >
      <span className="text-lg">{table.name}</span>
      <div className="flex items-center gap-1 text-xs opacity-90">
        <Users size={10} />
        <span>{table.seats}</span>
      </div>
      
      {/* Status Badge */}
      <span className="absolute -bottom-2 px-2 py-0.5 bg-white text-slate-900 text-[9px] font-bold uppercase rounded-full shadow-sm border">
        {table.status}
      </span>
      
      {/* Elapsed time for occupied tables */}
      {table.status === 'occupied' && table.elapsed_minutes !== undefined && (
        <span className="absolute -top-2 -right-2 bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded-full">
          {table.elapsed_minutes}m
        </span>
      )}
    </div>
  );
}

// ============================================================================
// TABLE FORM COMPONENT
// ============================================================================

interface TableFormProps {
  table?: RestaurantTable;
  onSave: (data: Partial<RestaurantTable>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function TableForm({ table, onSave, onCancel, onDelete }: TableFormProps) {
  const [formData, setFormData] = useState({
    name: table?.name || '',
    seats: table?.seats || 4,
    min_party_size: table?.min_party_size || 1,
    shape: table?.shape || 'round' as TableShape,
    zone: table?.zone || 'indoor' as FloorZone,
    width: table?.width || 80,
    height: table?.height || 80,
    rotation: table?.rotation || 0,
    is_mergeable: table?.is_mergeable ?? true,
  });
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-slate-800 dark:text-white">
            {table ? 'Edit Table' : 'Add Table'}
          </h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X size={24} />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Table Name
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
              placeholder="T-1"
              required
            />
          </div>
          
          {/* Seats & Min Party */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Seats
              </label>
              <input
                type="number"
                value={formData.seats}
                onChange={(e) => setFormData({ ...formData, seats: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                min="1"
                max="20"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Min Party
              </label>
              <input
                type="number"
                value={formData.min_party_size}
                onChange={(e) => setFormData({ ...formData, min_party_size: parseInt(e.target.value) || 1 })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                min="1"
                max={formData.seats}
              />
            </div>
          </div>
          
          {/* Shape */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Shape
            </label>
            <div className="flex gap-2">
              {SHAPES.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  onClick={() => setFormData({ ...formData, shape: shape.id })}
                  className={`
                    flex-1 py-2 px-3 rounded-lg border flex items-center justify-center gap-1 text-sm
                    ${formData.shape === shape.id 
                      ? 'bg-blue-500 text-white border-blue-600' 
                      : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    }
                  `}
                >
                  {shape.icon}
                  {shape.label}
                </button>
              ))}
            </div>
          </div>
          
          {/* Zone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              Zone
            </label>
            <select
              value={formData.zone}
              onChange={(e) => setFormData({ ...formData, zone: e.target.value as FloorZone })}
              className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
            >
              {ZONES.map((zone) => (
                <option key={zone.id} value={zone.id}>{zone.label}</option>
              ))}
            </select>
          </div>
          
          {/* Size */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Width
              </label>
              <input
                type="number"
                value={formData.width}
                onChange={(e) => setFormData({ ...formData, width: parseInt(e.target.value) || 80 })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                min="40"
                max="200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Height
              </label>
              <input
                type="number"
                value={formData.height}
                onChange={(e) => setFormData({ ...formData, height: parseInt(e.target.value) || 80 })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                min="40"
                max="200"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
                Rotation
              </label>
              <input
                type="number"
                value={formData.rotation}
                onChange={(e) => setFormData({ ...formData, rotation: parseInt(e.target.value) || 0 })}
                className="w-full px-3 py-2 border rounded-lg dark:bg-slate-800 dark:border-slate-700"
                min="0"
                max="360"
                step="15"
              />
            </div>
          </div>
          
          {/* Mergeable */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={formData.is_mergeable}
              onChange={(e) => setFormData({ ...formData, is_mergeable: e.target.checked })}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Can be merged with adjacent tables
            </span>
          </label>
          
          {/* Actions */}
          <div className="flex gap-3 pt-4">
            {table && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                <Trash2 size={18} />
              </button>
            )}
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center justify-center gap-2"
            >
              <Save size={18} />
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN FLOOR PLAN EDITOR COMPONENT
// ============================================================================

interface FloorPlanEditorProps {
  onTableClick?: (table: RestaurantTable) => void;
}

export default function FloorPlanEditor({ onTableClick }: FloorPlanEditorProps) {
  const { can } = useRestaurantRole();
  const { tables, loadingTables, createTable, updateTable, deleteTable } = useRestaurant();
  const { t } = useLanguage();
  
  const [isEditing, setIsEditing] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [pendingPositions, setPendingPositions] = useState<Record<string, { x: number; y: number }>>({});
  
  const canEdit = can('canEditFloorPlan');
  const selectedTable = tables.find(t => t.id === selectedTableId);
  
  // Handle table position drag
  const handleDrag = useCallback((tableId: string, x: number, y: number) => {
    setPendingPositions(prev => ({
      ...prev,
      [tableId]: { x, y }
    }));
  }, []);
  
  // Save all position changes
  const handleSaveLayout = async () => {
    const updates = Object.entries(pendingPositions);
    for (const [id, pos] of updates) {
      await updateTable.mutateAsync({ id, position_x: pos.x, position_y: pos.y });
    }
    setPendingPositions({});
    setIsEditing(false);
  };
  
  // Cancel editing
  const handleCancelEdit = () => {
    setPendingPositions({});
    setIsEditing(false);
    setSelectedTableId(null);
  };
  
  // Add new table
  const handleAddTable = async (data: Partial<RestaurantTable>) => {
    await createTable.mutateAsync({
      name: data.name || 'New Table',
      seats: data.seats,
      min_party_size: data.min_party_size,
      shape: data.shape,
      zone: data.zone,
      width: data.width,
      height: data.height,
      rotation: data.rotation,
      is_mergeable: data.is_mergeable,
      position_x: 100,
      position_y: 100,
    });
    setShowAddForm(false);
  };
  
  // Edit existing table
  const handleEditTable = async (data: Partial<RestaurantTable>) => {
    if (!selectedTableId) return;
    await updateTable.mutateAsync({ id: selectedTableId, ...data });
    setShowEditForm(false);
    setSelectedTableId(null);
  };
  
  // Delete table
  const handleDeleteTable = async () => {
    if (!selectedTableId) return;
    await deleteTable.mutateAsync(selectedTableId);
    setShowEditForm(false);
    setSelectedTableId(null);
  };
  
  // Get table with pending position
  const getTablePosition = (table: RestaurantTable) => {
    const pending = pendingPositions[table.id];
    return pending 
      ? { ...table, position_x: pending.x, position_y: pending.y }
      : table;
  };
  
  // Handle table click (when not editing)
  const handleTableClick = (table: RestaurantTable) => {
    if (onTableClick) {
      onTableClick(table);
    }
  };
  
  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-4 bg-white dark:bg-slate-900 border-b dark:border-slate-800">
        <h2 className="text-lg font-bold text-slate-800 dark:text-white">{t('settings.restaurant.floorPlan')}</h2>
        
        <div className="flex gap-2">
          {canEdit && !isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
            >
              <Edit2 size={16} />
              {t('settings.restaurant.edit')}
            </button>
          )}
          
          {isEditing && (
            <>
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
              >
                <Plus size={16} />
                {t('settings.restaurant.addTable')}
              </button>
              <button
                onClick={handleCancelEdit}
                className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={16} />
                {t('settings.restaurant.cancel')}
              </button>
              <button
                onClick={handleSaveLayout}
                className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                disabled={Object.keys(pendingPositions).length === 0}
              >
                <Save size={16} />
                {t('settings.restaurant.save')}
              </button>
            </>
          )}
        </div>
      </div>
      
      {/* Legend - Table Status Colors */}
      <div className="flex flex-wrap gap-4 p-3 bg-slate-50 dark:bg-slate-800/50 border-b dark:border-slate-700 text-sm">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span className="text-slate-600 dark:text-slate-400">{t('restaurant.tableStatuses.free')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500"></div>
          <span className="text-slate-600 dark:text-slate-400">{t('restaurant.tableStatuses.occupied')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-400"></div>
          <span className="text-slate-600 dark:text-slate-400">{t('restaurant.tableStatuses.billed')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sky-500"></div>
          <span className="text-slate-600 dark:text-slate-400">{t('restaurant.tableStatuses.reserved')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-stone-400"></div>
          <span className="text-slate-600 dark:text-slate-400">{t('restaurant.tableStatuses.dirty')}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-slate-600"></div>
          <span className="text-slate-600 dark:text-slate-400">{t('restaurant.tableStatuses.blocked')}</span>
        </div>
      </div>
      
      {/* Floor Plan Canvas */}
      <div 
        className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 relative"
        style={{ minHeight: 600 }}
      >
        {loadingTables ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div 
            className="relative"
            style={{ width: 1200, height: 800, minWidth: '100%', minHeight: '100%' }}
          >
            {/* Grid pattern background */}
            <div 
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'radial-gradient(circle, #94a3b8 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }}
            />
            
            {/* Tables */}
            {tables.map((table) => (
              <TableElement
                key={table.id}
                table={getTablePosition(table)}
                isEditing={isEditing}
                isSelected={selectedTableId === table.id}
                onSelect={() => setSelectedTableId(table.id)}
                onDrag={(x, y) => handleDrag(table.id, x, y)}
                onClick={() => handleTableClick(table)}
              />
            ))}
            
            {/* Empty state */}
            {tables.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center mx-auto mb-4">
                    <Users size={32} className="text-slate-400" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-600 dark:text-slate-400 mb-2">
                    No Tables Yet
                  </h3>
                  <p className="text-slate-500 mb-4">
                    Click "Edit Layout" and then "Add Table" to get started.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Selected table actions (when editing) */}
      {isEditing && selectedTable && (
        <div className="p-4 bg-blue-50 dark:bg-blue-900/30 border-t dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-bold text-blue-800 dark:text-blue-300">
              Selected: {selectedTable.name}
            </span>
            <span className="text-blue-600 dark:text-blue-400 text-sm">
              ({selectedTable.seats} seats, {selectedTable.shape})
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowEditForm(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
            >
              <Edit2 size={14} />
              Edit
            </button>
            <button
              onClick={handleDeleteTable}
              className="flex items-center gap-1 px-3 py-1.5 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        </div>
      )}
      
      {/* Add Table Form */}
      {showAddForm && (
        <TableForm
          onSave={handleAddTable}
          onCancel={() => setShowAddForm(false)}
        />
      )}
      
      {/* Edit Table Form */}
      {showEditForm && selectedTable && (
        <TableForm
          table={selectedTable}
          onSave={handleEditTable}
          onCancel={() => setShowEditForm(false)}
          onDelete={handleDeleteTable}
        />
      )}
    </div>
  );
}
