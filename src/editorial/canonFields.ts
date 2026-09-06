import type { CanonRow } from './api';

/**
 * Canon rows come straight from the database, so a field may be camelCase, or
 * snake_case, or absent. These read the first key that actually holds text.
 */
export const text = (row: CanonRow, ...keys: string[]): string => {
  for (const key of keys) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
    // Years arrive as integers. Returning '' for them silently dropped the
    // active timeframe from all 66 characters in a product about chronology.
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return '';
};

export const isProtected = (row: CanonRow): boolean =>
  row.isProtected === true || row.is_protected === true;
