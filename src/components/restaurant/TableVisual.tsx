
import React from 'react';
import { RestaurantTable, TableStatus } from '../../types/restaurant';
import { Users, Armchair, Bell } from 'lucide-react';

const STATUS_COLORS: Record<TableStatus, string> = {
  free: 'bg-emerald-500',
  occupied: 'bg-rose-500',
  billed: 'bg-amber-400',
  reserved: 'bg-sky-500',
  dirty: 'bg-stone-500',
  blocked: 'bg-slate-600',
};

interface TableVisualProps {
  table: RestaurantTable;
  onClick?: (table: RestaurantTable) => void;
  isSelected?: boolean;
  hasReadyFood?: boolean;
}

function Chair({ x, y, rotation, status }: { x: number; y: number; rotation: number; status: TableStatus }) {
  return (
    <div 
      className="absolute w-5 h-5 rounded-md bg-slate-200 dark:bg-slate-700 border border-slate-300 dark:border-slate-600 shadow-sm transition-colors flex items-center justify-center overflow-hidden"
      style={{
        left: x,
        top: y,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      }}
    >
       <Armchair size={10} className="text-slate-400 dark:text-slate-500 opacity-50" />
       <div className={`absolute inset-0 opacity-10 ${STATUS_COLORS[status]}`} />
    </div>
  );
}

export default function TableVisual({ table, onClick, isSelected, hasReadyFood }: TableVisualProps) {
  
  const renderChairs = () => {
    const chairs = [];
    const seatCount = table.seats || 4;
    const width = table.width || 80;
    const height = table.height || 80;
    const chairSpacing = 16; 
    
    if (table.shape === 'round') {
        const radius = Math.min(width, height) / 2 + chairSpacing;
        for (let i = 0; i < seatCount; i++) {
            const angle = (i * 360) / seatCount;
            const rad = (angle * Math.PI) / 180;
            const cx = width/2 + radius * Math.cos(rad);
            const cy = height/2 + radius * Math.sin(rad);
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
                if (isHorizontal) { cx = pos; cy = side.y as number; } 
                else { cx = side.x as number; cy = pos; }
                chairs.push(<Chair key={seatsPlaced} x={cx} y={cy} rotation={side.rot} status={table.status} />);
                seatsPlaced++;
            }
        });
    } else if (table.shape === 'bar') {
        for (let i = 0; i < seatCount; i++) {
            const step = width / (seatCount + 1);
            const cx = step * (i + 1);
            const cy = height + chairSpacing;
            chairs.push(<Chair key={i} x={cx} y={cy} rotation={0} status={table.status} />);
        }
    } else {
        let top=0, bottom=0, left=0, right=0;
        let remaining = seatCount;
        const isLandscape = width > height;
        if (remaining > 0) { if (isLandscape) { left++; remaining--; } else { top++; remaining--; } }
        if (remaining > 0) { if (isLandscape) { right++; remaining--; } else { bottom++; remaining--; } }
        while (remaining > 0) {
            if (isLandscape) { if (top <= bottom) { top++; } else { bottom++; } } 
            else { if (left <= right) { left++; } else { right++; } }
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
                else { cx = width + chairSpacing; cy = pos; }
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
      case 'booth': return { ...base, borderRadius: '8px 8px 30px 30px' };
      case 'bar': return { ...base, borderRadius: '4px' };
      default: return base;
    }
  };

  return (
    <div
      className="absolute transition-all duration-300 ease-out"
      style={{
           left: table.position_x,
           top: table.position_y,
           width: table.width || 80,
           height: table.height || 80,
      }}
    >
       <div className="absolute inset-0 pointer-events-none" style={{ transform: `rotate(${table.rotation || 0}deg)` }}>
          {renderChairs()}
       </div>

      <div
        className={`
          relative flex flex-col items-center justify-center cursor-pointer
          border shadow-[0_4px_12px_rgb(0,0,0,0.1)] transition-all z-10 hover:shadow-xl hover:-translate-y-1
          ${isSelected ? 'ring-2 ring-blue-500 ring-offset-4 ring-offset-[#F8FAFC] dark:ring-offset-[#020617]' : ''}
          bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700
        `}
        style={getShapeStyles()}
        onClick={() => onClick?.(table)}
      >
          <div className={`absolute inset-0 opacity-[0.05] rounded-[inherit] pointer-events-none ${
              table.shape === 'bar' ? "bg-slate-900" : "bg-[url('https://www.transparenttextures.com/patterns/wood-pattern.png')]"
          }`} />

          <span className="font-black text-slate-800 dark:text-white text-xs z-10 tracking-tight">{table.name}</span>
          
          {hasReadyFood && (
            <div className="absolute -top-3 -right-3 bg-emerald-500 text-white p-1.5 rounded-full shadow-lg z-30 animate-bounce">
              <Bell size={12} fill="white" className="animate-pulse" />
            </div>
          )}

          <div className={`absolute top-2 right-2 w-2.5 h-2.5 rounded-full ${STATUS_COLORS[table.status]} shadow-lg border-2 border-white dark:border-slate-800`} />
          <div className="flex items-center gap-1 text-[9px] font-bold text-slate-400 dark:text-slate-500 z-10 translate-y-1 uppercase tracking-tighter">
              <Users size={8} /> {table.seats}
          </div>
          
          {table.status === 'occupied' && (
              <div className="absolute -bottom-8 bg-slate-900/90 backdrop-blur-sm text-white text-[9px] px-2.5 py-1 rounded-full shadow-xl z-20 whitespace-nowrap font-bold tracking-wider animate-bounce">
                  {table.elapsed_minutes || 0}m
              </div>
          )}
      </div>
    </div>
  );
}
