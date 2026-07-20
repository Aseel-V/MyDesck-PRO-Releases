import React, { useState, useEffect, useMemo } from 'react';
import { Bed, Users, Home, Sparkles, Plus, Minus, RotateCcw, Edit3, Check, AlertCircle, Wand2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { cn } from '../../lib/utils';
import { formatRoomConfiguration } from '../../lib/tripRoom';

export type RoomType = 'Single' | 'Double' | 'Triple' | 'Quad' | 'Suite' | 'Family';

export interface RoomCompositionSectionProps {
  roomCounts: Record<RoomType, number | ''>;
  onChangeRoomCounts: (newCounts: Record<RoomType, number | ''>) => void;
  travelersCount?: number;
  customNote?: string;
  onChangeCustomNote?: (note: string) => void;
}

interface RoomMeta {
  type: RoomType;
  icon: React.ElementType;
  capacity: number;
  badgeKey: string;
}

const ROOM_METADATA: RoomMeta[] = [
  { type: 'Single', icon: Bed, capacity: 1, badgeKey: '1 Person' },
  { type: 'Double', icon: Users, capacity: 2, badgeKey: '2 People' },
  { type: 'Triple', icon: Users, capacity: 3, badgeKey: '3 People' },
  { type: 'Quad', icon: Users, capacity: 4, badgeKey: '4 People' },
  { type: 'Family', icon: Home, capacity: 5, badgeKey: 'Family (4-6)' },
  { type: 'Suite', icon: Sparkles, capacity: 2, badgeKey: 'Luxury Suite' },
];

export const RoomCompositionSection: React.FC<RoomCompositionSectionProps> = ({
  roomCounts,
  onChangeRoomCounts,
  travelersCount = 0,
  customNote,
  onChangeCustomNote,
}) => {
  const { t, direction } = useLanguage();
  const isRTL = direction === 'rtl';
  const [isManualOverride, setIsManualOverride] = useState(false);
  const [manualNote, setManualNote] = useState(customNote || '');

  // Calculate totals
  const totalRooms = useMemo(() => {
    return Object.values(roomCounts).reduce<number>((sum, val) => sum + (Number(val) || 0), 0);
  }, [roomCounts]);

  const estimatedCapacity = useMemo(() => {
    return ROOM_METADATA.reduce((sum, meta) => {
      const count = Number(roomCounts[meta.type]) || 0;
      return sum + count * meta.capacity;
    }, 0);
  }, [roomCounts]);

  // Auto-formatted natural language summary
  const autoSummary = useMemo(() => {
    const countsNumeric = Object.entries(roomCounts).reduce<Record<string, number>>((acc, [type, count]) => {
      const n = Number(count) || 0;
      if (n > 0) acc[type] = n;
      return acc;
    }, {});
    return formatRoomConfiguration(countsNumeric, t('trips.notSpecified'));
  }, [roomCounts, t]);

  useEffect(() => {
    if (!isManualOverride) {
      setManualNote(autoSummary);
      if (onChangeCustomNote) onChangeCustomNote(autoSummary);
    }
  }, [autoSummary, isManualOverride, onChangeCustomNote]);

  const handleStepperChange = (type: RoomType, delta: number) => {
    const current = Number(roomCounts[type]) || 0;
    const next = Math.max(0, current + delta);
    onChangeRoomCounts({
      ...roomCounts,
      [type]: next === 0 ? '' : next,
    });
  };

  const handleDirectInput = (type: RoomType, rawValue: string) => {
    if (rawValue === '') {
      onChangeRoomCounts({ ...roomCounts, [type]: '' });
      return;
    }
    const val = parseInt(rawValue, 10);
    onChangeRoomCounts({
      ...roomCounts,
      [type]: isNaN(val) || val < 0 ? 0 : val,
    });
  };

  const applyPreset = (preset: 'solo' | 'couple' | 'family' | 'group3' | 'group4') => {
    const reset: Record<RoomType, number | ''> = {
      Single: '', Double: '', Triple: '', Quad: '', Suite: '', Family: '',
    };
    switch (preset) {
      case 'solo':
        reset.Single = 1;
        break;
      case 'couple':
        reset.Double = 1;
        break;
      case 'family':
        reset.Family = 1;
        break;
      case 'group3':
        reset.Triple = 1;
        break;
      case 'group4':
        reset.Quad = 1;
        break;
    }
    onChangeRoomCounts(reset);
    setIsManualOverride(false);
  };

  const handleResetAll = () => {
    onChangeRoomCounts({ Single: '', Double: '', Triple: '', Quad: '', Suite: '', Family: '' });
    setIsManualOverride(false);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-200/80 bg-white/70 p-5 shadow-sm backdrop-blur-md dark:border-slate-800/80 dark:bg-slate-900/60">
      {/* Header & Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-950/80 dark:text-sky-400">
              <Bed className="h-4.5 w-4.5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {t('trips.roomConfiguration')}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t('trips.roomConfigurationHelper')}
              </p>
            </div>
          </div>
        </div>

        {/* Action Badges & Reset */}
        <div className="flex flex-wrap items-center gap-2">
          {totalRooms > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-100/80 px-3 py-1 text-xs font-semibold text-sky-700 dark:bg-sky-950 dark:text-sky-300">
              <span>{t('trips.roomTotal', { count: totalRooms })}</span>
              {estimatedCapacity > 0 && (
                <span className="text-[10px] opacity-80">
                  (~{estimatedCapacity} {t('trips.travelersCountShort', { defaultValue: 'pax' })})
                </span>
              )}
            </span>
          )}

          {travelersCount > 0 && totalRooms > 0 && (
            <div
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
                estimatedCapacity < travelersCount
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
              )}
            >
              {estimatedCapacity < travelersCount ? (
                <>
                  <AlertCircle className="h-3 w-3" />
                  <span>
                    {t('trips.capacityMismatch', {
                      defaultValue: `Covers ${estimatedCapacity}/${travelersCount} travelers`,
                    })}
                  </span>
                </>
              ) : (
                <>
                  <Check className="h-3 w-3" />
                  <span>
                    {t('trips.capacityMatched', { defaultValue: `Covers all ${travelersCount} travelers` })}
                  </span>
                </>
              )}
            </div>
          )}

          {totalRooms > 0 && (
            <button
              type="button"
              onClick={handleResetAll}
              className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200 transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{t('trips.resetCounts')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Preset Shortcuts */}
      <div className="flex flex-wrap items-center gap-1.5 pt-1">
        <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500">
          {t('trips.presets', { defaultValue: 'Quick presets:' })}
        </span>
        <button
          type="button"
          onClick={() => applyPreset('solo')}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-sky-100 hover:text-sky-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-sky-950 dark:hover:text-sky-300 transition-colors"
        >
          {t('trips.roomTypes.Single')}
        </button>
        <button
          type="button"
          onClick={() => applyPreset('couple')}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-sky-100 hover:text-sky-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-sky-950 dark:hover:text-sky-300 transition-colors"
        >
          {t('trips.roomTypes.Double')}
        </button>
        <button
          type="button"
          onClick={() => applyPreset('group3')}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-sky-100 hover:text-sky-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-sky-950 dark:hover:text-sky-300 transition-colors"
        >
          {t('trips.roomTypes.Triple')}
        </button>
        <button
          type="button"
          onClick={() => applyPreset('family')}
          className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700 hover:bg-sky-100 hover:text-sky-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-sky-950 dark:hover:text-sky-300 transition-colors"
        >
          {t('trips.roomTypes.Family')}
        </button>
      </div>

      {/* Room Types Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {ROOM_METADATA.map((meta) => {
          const count = Number(roomCounts[meta.type]) || 0;
          const IconComponent = meta.icon;
          const isActive = count > 0;

          return (
            <div
              key={meta.type}
              className={cn(
                'relative flex flex-col justify-between rounded-xl border p-3 transition-all duration-200',
                isActive
                  ? 'border-sky-500/80 bg-sky-50/40 shadow-sm ring-1 ring-sky-500/30 dark:border-sky-500/60 dark:bg-sky-950/30'
                  : 'border-slate-200/90 bg-white hover:border-slate-300 dark:border-slate-800/90 dark:bg-slate-950/60 dark:hover:border-slate-700'
              )}
            >
              {/* Top info */}
              <div className="flex items-start justify-between">
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    {t(`trips.roomTypes.${meta.type}`)}
                  </span>
                  <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                    {meta.badgeKey}
                  </span>
                </div>
                <IconComponent
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    isActive ? 'text-sky-600 dark:text-sky-400' : 'text-slate-300 dark:text-slate-600'
                  )}
                />
              </div>

              {/* Stepper Controls & Input */}
              <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-100/80 p-1 dark:bg-slate-900/80">
                <button
                  type="button"
                  onClick={() => handleStepperChange(meta.type, -1)}
                  disabled={count <= 0}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                  aria-label={`Decrease ${meta.type} count`}
                >
                  <Minus className="h-3 w-3" />
                </button>

                <input
                  type="number"
                  min={0}
                  value={roomCounts[meta.type]}
                  onChange={(e) => handleDirectInput(meta.type, e.target.value)}
                  placeholder="0"
                  className="w-10 bg-transparent text-center text-xs font-extrabold text-slate-900 focus:outline-none dark:text-slate-100"
                />

                <button
                  type="button"
                  onClick={() => handleStepperChange(meta.type, 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900"
                  aria-label={`Increase ${meta.type} count`}
                >
                  <Plus className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Smart Live Summary & Final Detail Note */}
      <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/50">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Wand2 className="h-3.5 w-3.5 text-sky-500" />
            <span>{t('trips.finalText', { defaultValue: 'Room Detail Summary Note' })}</span>
          </label>

          <div className="flex items-center gap-2">
            {isManualOverride ? (
              <button
                type="button"
                onClick={() => {
                  setIsManualOverride(false);
                  setManualNote(autoSummary);
                  if (onChangeCustomNote) onChangeCustomNote(autoSummary);
                }}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-sky-600 hover:text-sky-700 dark:text-sky-400"
              >
                <Wand2 className="h-3 w-3" />
                <span>{t('trips.autoGenerateNote', { defaultValue: 'Reset to auto-summary' })}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setIsManualOverride(true)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400"
              >
                <Edit3 className="h-3 w-3" />
                <span>{t('trips.editManually', { defaultValue: 'Edit manually' })}</span>
              </button>
            )}
          </div>
        </div>

        <div className="mt-2">
          <input
            type="text"
            dir={isRTL ? 'rtl' : 'ltr'}
            value={manualNote}
            readOnly={!isManualOverride}
            onChange={(e) => {
              setManualNote(e.target.value);
              if (onChangeCustomNote) onChangeCustomNote(e.target.value);
            }}
            className={cn(
              'w-full rounded-lg border px-3 py-2 text-xs font-medium transition-all focus:outline-none',
              isManualOverride
                ? 'border-sky-500 bg-white ring-2 ring-sky-500/20 dark:border-sky-500 dark:bg-slate-900 dark:text-white'
                : 'border-slate-200 bg-white/80 text-slate-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300'
            )}
            placeholder={t('trips.roomConfigurationPlaceholder')}
          />
        </div>
      </div>
    </div>
  );
};
