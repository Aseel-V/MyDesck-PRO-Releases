import { RoomConfiguration } from '../types/trip';

const ROOM_ENTRY_SEPARATOR = ', ';

export function normalizeRoomConfiguration(
  value: RoomConfiguration | string | null | undefined
): RoomConfiguration {
  if (!value) return {};

  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value).reduce<RoomConfiguration>((acc, [key, count]) => {
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
        acc[key] = count;
      }
      return acc;
    }, {});
  }

  if (typeof value !== 'string') return {};

  return value
    .split(',')
    .map((part) => part.trim())
    .reduce<RoomConfiguration>((acc, part) => {
      const match = part.match(/^(.+?)\s*x\s*(\d+)$/i);
      if (!match) return acc;

      const [, rawType, rawCount] = match;
      const count = Number.parseInt(rawCount, 10);
      if (count > 0) {
        acc[rawType.trim()] = count;
      }
      return acc;
    }, {});
}

export function formatRoomConfiguration(
  value: RoomConfiguration | string | null | undefined,
  emptyLabel: string
): string {
  const normalized = normalizeRoomConfiguration(value);
  const parts = Object.entries(normalized)
    .filter(([, count]) => typeof count === 'number' && count > 0)
    .map(([type, count]) => `${type} x${count}`);

  return parts.length > 0 ? parts.join(ROOM_ENTRY_SEPARATOR) : emptyLabel;
}

export function serializeRoomConfiguration(
  value: RoomConfiguration | string | null | undefined
): Record<string, number> {
  return Object.entries(normalizeRoomConfiguration(value)).reduce<Record<string, number>>(
    (acc, [key, count]) => {
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
        acc[key] = count;
      }
      return acc;
    },
    {}
  );
}
