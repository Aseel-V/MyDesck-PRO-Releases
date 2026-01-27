// ============================================================================
// FLOOR PLAN EDITOR - Drag & Drop Table Management
// Version: 2.0.0 | Realistic Architecture Style
// ============================================================================

import { useState, useRef, useCallback, useMemo } from 'react';
import { useRestaurant } from '../../hooks/useRestaurant';
import { useRestaurantRole } from '../../contexts/RestaurantRoleContext';
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
  Layout,
  Sun,
  Cloud,
  Coffee,
  Key,
  RotateCw,
  Bell
} from 'lucide-react';

// ============================================================================
// CONSTANTS
// ============================================================================

const STATUS_COLORS: Record<TableStatus, string> = {
  free: 'bg-emerald-500',
  occupied: 'bg-rose-500',
  billed: 'bg-amber-400',
  reserved: 'bg-indigo-500',
  dirty: 'bg-zinc-500',
  blocked: 'bg-slate-600',
};

const SHAPES: { id: TableShape; label: string; icon: React.ReactNode }[] = [
  { id: 'round', label: 'Round', icon: <Circle size={16} /> },
  { id: 'square', label: 'Square', icon: <Square size={16} /> },
  { id: 'rectangle', label: 'Rectangle', icon: <RectangleHorizontal size={16} /> },
  { id: 'booth', label: 'Booth', icon: <Armchair size={16} /> },
  { id: 'bar', label: 'Bar', icon: <GlassWater size={16} /> },
];

const ZONES: { id: FloorZone; label: string; icon: React.ReactNode }[] = [
  { id: 'indoor', label: 'Indoor', icon: <Layout size={16} /> },
  { id: 'outdoor', label: 'Outdoor', icon: <Sun size={16} /> },
  { id: 'patio', label: 'Patio', icon: <Cloud size={16} /> },
  { id: 'private', label: 'Private Room', icon: <Key size={16} /> },
  { id: 'bar_area', label: 'Bar Area', icon: <Coffee size={16} /> },
];

// ============================================================================
// CHAIR COMPONENT
// ============================================================================

function Chair({ x, y, rotation, status }: { x: number; y: number; rotation: number; status: TableStatus }) {
  return (
    <div 
      className="absolute flex flex-col items-center justify-center transition-all duration-300"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
        width: '24px',
        height: '24px',
      }}
    >
       {/* Backrest */}
       <div className={`w-full h-1 rounded-full mb-[1px] shadow-sm ${
          status === 'free' ? 'bg-slate-400 dark:bg-slate-500' : 'bg-slate-500 dark:bg-slate-400'
       }`} />
       
       {/* Seat */}
       <div className={`w-full h-5 rounded-md border border-slate-400 dark:border-slate-500 shadow-sm overflow-hidden relative ${
         status === 'free' ? 'bg-slate-200 dark:bg-slate-700' : 
         status === 'occupied' ? 'bg-rose-100 dark:bg-rose-900/50' :
         status === 'reserved' ? 'bg-sky-100 dark:bg-sky-900/50' : 'bg-slate-300'
       }`}>
           <div className={`absolute inset-0 opacity-20 ${STATUS_COLORS[status]}`} />
       </div>
    </div>
  );
}

// ============================================================================
// TABLE ELEMENT COMPONENT
// ============================================================================

interface TableElementProps {
  table: RestaurantTable;
  isEditing: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDrag: (x: number, y: number) => void;
  onRotate: (rotation: number) => void;
  onClick: () => void;
  hasReadyFood?: boolean;
}

function TableElement({ 
  table, 
  isEditing, 
  isSelected, 
  onSelect, 
  onDrag,
  onRotate,
  onClick,
  hasReadyFood
}: TableElementProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, tableX: 0, tableY: 0, startAngle: 0 });
  const tableRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!isEditing) {
      onClick();
      return;
    }
    
    e.preventDefault();
    e.stopPropagation(); 
    setIsDragging(true);
    onSelect();
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tableX: table.position_x,
      tableY: table.position_y,
      startAngle: table.rotation || 0
    };
    
    const handleMouseMove = (e: MouseEvent) => {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        setIsDragging(true);
        const newX = Math.round((Math.max(0, dragStartRef.current.tableX + dx)) / 10) * 10;
        const newY = Math.round((Math.max(0, dragStartRef.current.tableY + dy)) / 10) * 10;
        onDrag(newX, newY);
      }
    };
    
    const handleMouseUp = (e: MouseEvent) => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      if (Math.abs(dx) <= 8 && Math.abs(dy) <= 8) {
        setIsDragging(false);
        onClick();
      } else {
        setIsDragging(false);
      }
    };
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleRotationStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsRotating(true);
    onSelect();

    const rect = tableRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const handleRotationMove = (e: MouseEvent) => {
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      
      // Calculate angle in degrees
      let angle = Math.atan2(dy, dx) * (180 / Math.PI);
      // Offset by 90 because handle is at top
      angle = (angle + 90) % 360;
      if (angle < 0) angle += 360;
      
      // Snap to 15 degrees if shift is held, otherwise snap to 5
      const snap = 5;
      const snappedAngle = Math.round(angle / snap) * snap;
      
      onRotate(snappedAngle);
    };

    const handleRotationEnd = () => {
      setIsRotating(false);
      window.removeEventListener('mousemove', handleRotationMove);
      window.removeEventListener('mouseup', handleRotationEnd);
    };

    window.addEventListener('mousemove', handleRotationMove);
    window.addEventListener('mouseup', handleRotationEnd);
  };
  
  // Render Chairs logic
  const renderChairs = () => {
    const chairs = [];
    const seatCount = table.seats || 4;
    const width = table.width || 80;
    const height = table.height || 80;
    const chairSpacing = 16; // Distance from table edge
    
    if (table.shape === 'round') {
        const radius = Math.min(width, height) / 2 + chairSpacing;
        for (let i = 0; i < seatCount; i++) {
            const angle = (i * 360) / seatCount;
            const rad = (angle * Math.PI) / 180;
            const cx = width/2 + radius * Math.cos(rad);
            const cy = height/2 + radius * Math.sin(rad);
            // Angle shift 90 degrees to face center
            chairs.push(<Chair key={i} x={cx} y={cy} rotation={angle + 90} status={table.status} />);
        }
    } else if (table.shape === 'booth') {
        const isHorizontal = width >= height;
        
        const sides = isHorizontal 
            ? [{ x: undefined, y: -chairSpacing, rot: 180 }, { x: undefined, y: height + chairSpacing, rot: 0 }]
            : [{ x: -chairSpacing, y: undefined, rot: 90 }, { x: width + chairSpacing, y: undefined, rot: -90 }];
            
        let seatsPlaced = 0;
        sides.forEach((side, sideIdx) => {
            const countForSide = sideIdx === 0 ? Math.ceil(seatCount/2) : Math.floor(seatCount/2);
            for(let i=0; i<countForSide; i++) {
                if (seatsPlaced >= seatCount) break;
                
                let cx, cy;
                const spread = isHorizontal ? width : height;
                const step = spread / (countForSide + 1);
                const pos = step * (i + 1);
                
                if (isHorizontal) {
                    cx = pos;
                    cy = side.y as number;
                } else {
                    cx = side.x as number;
                    cy = pos;
                }
                
                chairs.push(<Chair key={seatsPlaced} x={cx} y={cy} rotation={side.rot} status={table.status} />);
                seatsPlaced++;
            }
        });
        
    } else if (table.shape === 'bar') {
        // Bar: Chairs on one side (Bottom usually)
        for (let i = 0; i < seatCount; i++) {
            const step = width / (seatCount + 1);
            const cx = step * (i + 1);
            const cy = height + chairSpacing;
            chairs.push(<Chair key={i} x={cx} y={cy} rotation={0} status={table.status} />);
        }
    } else {
        // Rectangle / Square: Smart Perimeter Distribution
        let top=0, bottom=0, left=0, right=0;
        let remaining = seatCount;
        
        const isLandscape = width > height;
        
        if (remaining > 0) {
            if (isLandscape) { left++; remaining--; } else { top++; remaining--; }
        }
        if (remaining > 0) {
            if (isLandscape) { right++; remaining--; } else { bottom++; remaining--; }
        }
        
        while (remaining > 0) {
            if (isLandscape) {
                if (top <= bottom) { top++; } else { bottom++; }
            } else {
                if (left <= right) { left++; } else { right++; }
            }
            remaining--;
        }
        
        const placeOnSide = (count: number, side: 'top'|'bottom'|'left'|'right') => {
            const rot = { top: 180, bottom: 0, left: 90, right: -90 }[side];
            const axisLength = (side === 'top' || side === 'bottom') ? width : height;
            const step = axisLength / (count + 1);
            
            for (let i = 0; i < count; i++) {
                const pos = step * (i + 1);
                let cx, cy;
                
                if (side === 'top') { cx = pos; cy = -chairSpacing; }
                else if (side === 'bottom') { cx = pos; cy = height + chairSpacing; }
                else if (side === 'left') { cx = -chairSpacing; cy = pos; }
                else { cx = width + chairSpacing; cy = pos; } // right
                
                chairs.push(<Chair key={`${side}-${i}`} x={cx} y={cy} rotation={rot} status={table.status} />);
            }
        };
        
        placeOnSide(top, 'top');
        placeOnSide(bottom, 'bottom');
        placeOnSide(left, 'left');
        placeOnSide(right, 'right');
    }
    return chairs;
  };
  
  // Table Shape Styles
  const getShapeStyles = () => {
    const base: React.CSSProperties = {
      width: table.width || 80,
      height: table.height || 80,
      transform: `rotate(${table.rotation || 0}deg)`,
    };
    
    switch (table.shape) {
      case 'round': return { ...base, borderRadius: '50%' };
      case 'square': return { ...base, borderRadius: '4px' };
      case 'rectangle': return { ...base, borderRadius: '2px' };
      case 'booth': return { ...base, borderRadius: '8px 8px 30px 30px' }; // Sofa shape
      case 'bar': return { ...base, borderRadius: '4px' };
      default: return base;
    }
  };

  return (
    <div
      ref={tableRef}
      className="absolute group"
      style={{
           left: table.position_x,
           top: table.position_y,
           width: table.width || 80,
           height: table.height || 80,
      }}
    >
       {/* 360 Rotation Handle */}
       {isEditing && isSelected && (
          <div 
             className="absolute -top-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-50 animate-in zoom-in-50"
             onMouseDown={handleRotationStart}
          >
             <div className="w-6 h-6 rounded-full bg-white dark:bg-slate-800 shadow-xl border-2 border-indigo-500 cursor-alias flex items-center justify-center hover:scale-125 transition-transform active:scale-95">
                <RotateCw size={12} className="text-indigo-600" />
             </div>
             <div className="w-0.5 h-4 bg-indigo-500/50" />
             {isRotating && (
                <div className="absolute -right-12 top-0 bg-slate-900 text-white text-[10px] px-2 py-1 rounded-md font-bold shadow-xl">
                   {table.rotation || 0}°
                </div>
             )}
          </div>
       )}

       {/* Chairs Layer - Rendered outside the table div so they don't rotate WITH the table if we didn't want them to (but we do want them to usually) */}
       {/* Actually, chairs should sit "under" or "around" the table. */}
       <div className="absolute inset-0 pointer-events-none" style={{ transform: `rotate(${table.rotation || 0}deg)` }}>
          {renderChairs()}
       </div>

      <div
        className={`
          relative flex flex-col items-center justify-center cursor-pointer
          border shadow-[0_8px_30px_rgb(0,0,0,0.12)] transition-all z-10
          ${isEditing ? 'cursor-move hover:ring-4 hover:ring-indigo-400/30' : 'cursor-pointer hover:shadow-2xl hover:-translate-y-1'}
          ${isSelected ? 'ring-2 ring-indigo-500 ring-offset-4 ring-offset-[#F8FAFC] dark:ring-offset-[#020617]' : ''}
          ${isDragging ? 'scale-110 shadow-2xl skew-x-1 rotate-1 z-30' : ''}
          bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700
        `}
        style={getShapeStyles()}
        onMouseDown={handleMouseDown}
        onDoubleClick={onClick}
      >
          {/* Wood texture effect overlay */}
          <div className={`absolute inset-0 opacity-[0.05] rounded-[inherit] pointer-events-none ${
              table.shape === 'bar' ? "bg-slate-900" : "bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')]"
          }`} />

          {/* Table Center Decor - Shape Specific */}
          {table.shape === 'round' && <div className="absolute w-1/3 h-1/3 rounded-full border border-slate-200 dark:border-slate-700 opacity-50" />}
          {table.shape === 'booth' && <div className="absolute w-3/4 h-1/2 border-y border-slate-200 dark:border-slate-700 opacity-30" />}
          {table.shape === 'rectangle' && <div className="absolute w-3/4 h-px bg-slate-300 dark:bg-slate-600 opacity-30" />}
          {table.shape === 'square' && <div className="absolute w-1/4 h-1/4 border border-slate-300 dark:border-slate-600 opacity-30" />}

          {/* Ready Food Notification */}
          {hasReadyFood && (
            <div className="absolute -top-4 -right-4 bg-emerald-500 text-white p-2 rounded-full shadow-lg z-30 animate-bounce group-hover:animate-none">
              <Bell size={16} fill="white" className="animate-pulse" />
            </div>
          )}

          {/* Table Name */}
          <span className="font-black text-slate-800 dark:text-white text-xs z-10 tracking-tight">{table.name}</span>
          
          {/* Status Indicator (Pulse) */}
          <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${STATUS_COLORS[table.status]} shadow-lg border-2 border-white dark:border-slate-800`} />
          
          {/* Info */}
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 z-10 translate-y-1 uppercase tracking-tighter">
              <Users size={8} /> {table.seats}
          </div>
          
          {/* Timer for occupied tables */}
          {table.status === 'occupied' && (
              <div className="absolute -bottom-8 bg-slate-900/90 backdrop-blur-sm text-white text-[9px] px-2.5 py-1 rounded-full shadow-xl z-20 whitespace-nowrap font-bold tracking-wider animate-bounce">
                  {table.elapsed_minutes || 0}m
              </div>
          )}

          {/* Quick Actions Overlay (when selected in editing mode) */}
          {isSelected && isEditing && !isDragging && (
            <div className="absolute -top-14 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md shadow-[0_20px_50px_rgba(0,0,0,0.3)] rounded-2xl p-1.5 border border-slate-200/50 dark:border-slate-800/50 animate-in fade-in zoom-in-95 duration-200 z-50">
               <button 
                  onClick={(e) => { e.stopPropagation(); onClick(); }}
                  className="p-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-indigo-600 dark:text-indigo-400 rounded-xl transition-all hover:scale-110"
                  title="Configure Table"
               >
                 <Edit2 size={16} />
               </button>
               <div className="w-px h-5 bg-slate-200/50 dark:bg-slate-800/50 mx-1" />
               <button 
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    if (window.confirm(`Delete table ${table.name}?`)) {
                        onClick(); // Opens modal which will have delete focus or just trigger delete logic
                    }
                  }}
                  className="p-2.5 hover:bg-rose-500 hover:text-white text-rose-500 rounded-xl transition-all hover:scale-110 active:scale-90"
                  title="Delete Table"
               >
                 <Trash2 size={16} />
               </button>
            </div>
          )}
      </div>
    </div>
  );
}

// ============================================================================
// TABLE FORM COMPONENT
// ============================================================================

interface TableFormProps {
  table?: RestaurantTable;
  activeZone: FloorZone;
  onSave: (data: Partial<RestaurantTable>) => void;
  onCancel: () => void;
  onDelete?: () => void;
}

function TableForm({ table, activeZone, onSave, onCancel, onDelete }: TableFormProps) {
  const [formData, setFormData] = useState({
    name: table?.name || '',
    seats: table?.seats || 4,
    min_party_size: table?.min_party_size || 1,
    shape: table?.shape || 'round' as TableShape,
    zone: table?.zone || activeZone, // Default to current active zone
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
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-sm flex items-center justify-center z-[100] animate-fadeIn p-4">
      <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-[0_32px_64px_-12px_rgba(0,0,0,0.2)] w-full max-w-md overflow-hidden border border-white dark:border-slate-800 transform-gpu">
        <div className="bg-gradient-to-br from-indigo-500/10 to-purple-500/10 dark:from-indigo-500/5 dark:to-purple-500/5 p-8 pb-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-black text-slate-800 dark:text-white tracking-tighter flex items-center gap-3">
              {table ? <Edit2 size={24} className="text-indigo-500"/> : <Plus size={24} className="text-emerald-500"/>}
              {table ? 'EDIT TABLE' : 'NEW TABLE'}
            </h2>
            <button onClick={onCancel} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
              <X size={20} className="text-slate-400" />
            </button>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">{table ? 'Adjusting Table Properties' : 'Creating a new floor element'}</p>
        </div>
        
        <form onSubmit={handleSubmit} className="p-8 pt-4 space-y-6">
          {/* Name & Seats Row */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Identifier</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-3 bg-slate-100 dark:bg-slate-800/50 border-2 border-transparent focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-800 rounded-2xl outline-none transition-all font-bold text-slate-700 dark:text-white"
                placeholder="T-01"
              />
            </div>
             <div className="space-y-1.5">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Capacity</label>
              <div className="flex items-center gap-3 bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-2xl border-2 border-transparent">
                 <button type="button" onClick={() => setFormData(prev => ({ ...prev, seats: Math.max(1, prev.seats - 1) }))} className="w-9 h-9 flex items-center justify-center bg-white dark:bg-slate-700 rounded-xl shadow-sm">-</button>
                 <span className="flex-1 text-center font-black text-lg">{formData.seats}</span>
                 <button type="button" onClick={() => setFormData(prev => ({ ...prev, seats: prev.seats + 1 }))} className="w-9 h-9 flex items-center justify-center bg-white dark:bg-slate-700 rounded-xl shadow-sm">+</button>
              </div>
            </div>
          </div>
          
          {/* Shape Selector */}
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Table Geometry</label>
            <div className="grid grid-cols-5 gap-2">
              {SHAPES.map((shape) => (
                <button
                  key={shape.id}
                  type="button"
                  onClick={() => {
                    const newDims = shape.id === 'rectangle' ? { width: 120, height: 80 } : 
                                  shape.id === 'square' ? { width: 80, height: 80 } : 
                                  shape.id === 'round' ? { width: 80, height: 80 } :
                                  shape.id === 'booth' ? { width: 120, height: 60 } :
                                  { width: 100, height: 40 };
                    setFormData({ ...formData, shape: shape.id, ...newDims });
                  }}
                  className={`
                    py-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all
                    ${formData.shape === shape.id 
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' 
                      : 'border-transparent bg-slate-100/50 dark:bg-slate-800/30 text-slate-400 hover:bg-slate-200/50'
                    }
                  `}
                >
                  {shape.icon}
                </button>
              ))}
            </div>
          </div>
          
          {/* Advanced Properties Toggle or Small Grid */}
          <div className="grid grid-cols-2 gap-6">
              <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Orientation</label>
                  <input
                    type="number"
                    value={formData.rotation}
                    onChange={(e) => setFormData({ ...formData, rotation: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-800/50 rounded-xl outline-none font-bold text-sm"
                  />
              </div>
              <div className="space-y-1.5">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Floor Zone</label>
                  <select
                      value={formData.zone}
                      onChange={(e) => setFormData({ ...formData, zone: e.target.value as FloorZone })}
                      className="w-full px-4 py-2 bg-slate-100 dark:bg-slate-800/50 rounded-xl outline-none font-bold text-sm appearance-none"
                  >
                      {ZONES.map(z => <option key={z.id} value={z.id}>{z.label}</option>)}
                  </select>
              </div>
          </div>
          
          {/* Actions */}
          <div className="flex gap-4 pt-4">
            {table && onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="w-14 h-14 flex items-center justify-center bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 rounded-2xl transition-all"
              >
                <Trash2 size={24} />
              </button>
            )}
            <button
              type="submit"
              className="flex-1 h-14 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-2xl font-black tracking-widest uppercase shadow-2xl transition-all hover:scale-[1.02] active:scale-95"
            >
              Confirm Changes
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
  const { tables, loadingTables, createTable, updateTable, deleteTable, kitchenTickets } = useRestaurant();
  
  const [activeZone, setActiveZone] = useState<FloorZone>('indoor');
  const [isEditing, setIsEditing] = useState(true);
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [pendingUpdates, setPendingUpdates] = useState<Record<string, { x: number; y: number; rotation: number }>>({});
  
  const canEdit = can('canEditFloorPlan');
  
  // Filter tables by active zone
  const zoneTables = useMemo(() => {
    return tables.filter(t => (t.zone || 'indoor') === activeZone);
  }, [tables, activeZone]);

  const tablesWithReadyFood = useMemo(() => {
    return new Set(
      kitchenTickets
        .filter(t => t.status === 'ready')
        .map(t => t.order?.table_id)
        .filter(Boolean)
    );
  }, [kitchenTickets]);

  const selectedTable = tables.find(t => t.id === selectedTableId);
  
  // Handle table position drag
  const handleDrag = useCallback((tableId: string, x: number, y: number) => {
    setPendingUpdates(prev => ({
      ...prev,
      [tableId]: { 
        ...prev[tableId], 
        x, 
        y, 
        rotation: prev[tableId]?.rotation ?? tables.find(t => t.id === tableId)?.rotation ?? 0 
      }
    }));
  }, [tables]);

  // Handle table rotation
  const handleRotate = useCallback((tableId: string, rotation: number) => {
    setPendingUpdates(prev => ({
      ...prev,
      [tableId]: { 
        ...prev[tableId], 
        rotation,
        x: prev[tableId]?.x ?? tables.find(t => t.id === tableId)?.position_x ?? 0,
        y: prev[tableId]?.y ?? tables.find(t => t.id === tableId)?.position_y ?? 0
      }
    }));
  }, [tables]);
  
  // Save all changes
  const handleSaveLayout = async () => {
    const updates = Object.entries(pendingUpdates);
    for (const [id, data] of updates) {
      await updateTable.mutateAsync({ 
        id, 
        position_x: data.x, 
        position_y: data.y,
        rotation: data.rotation
      });
    }
    setPendingUpdates({});
    setIsEditing(false);
  };
  
  // Cancel editing
  const handleCancelEdit = () => {
    setPendingUpdates({});
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
      zone: data.zone || activeZone,
      width: data.width,
      height: data.height,
      rotation: data.rotation,
      is_mergeable: data.is_mergeable,
      position_x: 200, // Default drop center
      position_y: 200,
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
  
  // Get table with pending updates
  const getTableUpdates = (table: RestaurantTable) => {
    const pending = pendingUpdates[table.id];
    return pending 
      ? { ...table, position_x: pending.x, position_y: pending.y, rotation: pending.rotation }
      : table;
  };
  
  // Handle table click (when not editing)
  const handleTableClick = (table: RestaurantTable) => {
    if (onTableClick && !isEditing) {
      onTableClick(table);
    } else if (isEditing) {
        setSelectedTableId(table.id);
        setShowEditForm(true);
    }
  };
  
  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] dark:bg-[#020617] font-sans pb-20">
      {/* 1. Top Bar: Premium Integrated Header */}
      <div className="flex-none px-6 py-4 bg-white/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/50 z-30">
        <div className="max-w-[1800px] mx-auto flex items-center justify-between">
            <div className="flex items-center gap-6">
                <h2 className="text-xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-2">
                    <Layout className="text-indigo-600" size={24} />
                    {activeZone.toUpperCase()}
                </h2>

                {/* Zone Tabs - Glass Style */}
                <div className="flex gap-1 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-2xl border border-slate-200/50 dark:border-slate-800/50">
                    {ZONES.map(zone => (
                        <button
                            key={zone.id}
                            onClick={() => setActiveZone(zone.id)}
                            className={`
                                px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-all duration-300
                                ${activeZone === zone.id 
                                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-md transform scale-105' 
                                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-200'
                                }
                            `}
                        >
                            {zone.icon}
                            {zone.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Action Group */}
            <div className="flex items-center gap-3">
                 {canEdit && (
                    <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-2xl border border-slate-200/50 dark:border-slate-800/50">
                        <button 
                            onClick={() => setShowAddForm(true)}
                            className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white rounded-xl font-bold text-sm shadow-xl shadow-emerald-500/20 transition-all active:scale-95"
                        >
                            <Plus size={18} />
                            Add Table
                        </button>
                        
                        {Object.keys(pendingUpdates).length > 0 && (
                            <button 
                                onClick={handleSaveLayout}
                                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-sm shadow-xl shadow-indigo-600/20 animate-pulse transition-all"
                            >
                                <Save size={18} />
                                Save
                            </button>
                        )}

                        <button 
                            onClick={handleCancelEdit}
                            className="px-4 py-2.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-200 font-bold text-sm transition-all"
                        >
                            Reset
                        </button>
                    </div>
                 )}
            </div>
        </div>
      </div>
      
      {/* 2. Secondary Info Layer: Legend & Context */}
      <div className="relative flex-1 flex flex-col">
          {/* Floating Legend - Modern Horizontal Style */}
          <div className="absolute bottom-8 left-8 z-20 scale-90 origin-bottom-left">
              <div className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-md px-5 py-2.5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 shadow-2xl flex items-center gap-6">
                 <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">Free</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]" />
                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">Occupied</span>
                 </div>
                 <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]" />
                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">Billed</span>
                 </div>
              </div>
          </div>
          {/* 3. The Canvas: Blueprint Style */}
          <div className="flex-1 overflow-x-auto relative cursor-grab active:cursor-grabbing bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:32px_32px]">
             {/* Architectural Lines Layer */}
             <div 
                className="absolute inset-0 pointer-events-none opacity-[0.05] dark:opacity-[0.1]"
                style={{
                    backgroundImage: `
                        linear-gradient(to right, #6366f1 1px, transparent 1px),
                        linear-gradient(to bottom, #6366f1 1px, transparent 1px)
                    `,
                    backgroundSize: '128px 128px'
                }}
             />
             
             {/* Zone Label Watermark - Modernized */}
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <h1 className="text-[15vw] font-black uppercase text-slate-200/40 dark:text-slate-800/20 select-none tracking-tighter capitalize">
                    {ZONES.find(z => z.id === activeZone)?.label}
                 </h1>
             </div>

         {/* Tables Container (Fixed Size for now, could be infinite) */}
         <div className="relative min-w-[1200px] min-h-[800px] w-full h-full p-20">
             {loadingTables ? (
                  <div className="flex justify-center pt-20"><div className="animate-spin w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full"/></div>
             ) : (
                 <>
                    {zoneTables.map(table => (
                        <TableElement
                            key={table.id}
                            table={getTableUpdates(table)}
                            isEditing={isEditing}
                            isSelected={selectedTableId === table.id}
                            onSelect={() => setSelectedTableId(table.id)}
                            onDrag={(x, y) => handleDrag(table.id, x, y)}
                            onRotate={(rot) => handleRotate(table.id, rot)}
                            onClick={() => handleTableClick(table)}
                            hasReadyFood={tablesWithReadyFood.has(table.id)}
                        />
                    ))}
                    
                    {zoneTables.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                             <Layout size={64} className="mb-4 opacity-50" />
                             <h3 className="text-lg font-semibold">Empty Zone</h3>
                             <p>No tables in {ZONES.find(z => z.id === activeZone)?.label} yet.</p>
                             {isEditing && <p className="text-blue-500 mt-2">Click "Add Table" to start.</p>}
                        </div>
                    )}
                 </>
             )}
          </div>
        </div>
      </div>
      
      {/* Modals */}
      {showAddForm && (
        <TableForm
          activeZone={activeZone}
          onSave={handleAddTable}
          onCancel={() => setShowAddForm(false)}
        />
      )}
      
      {showEditForm && selectedTable && (
        <TableForm
          table={selectedTable}
          activeZone={activeZone}
          onSave={handleEditTable}
          onCancel={() => setShowEditForm(false)}
          onDelete={handleDeleteTable}
        />
      )}
    </div>
  );
}
