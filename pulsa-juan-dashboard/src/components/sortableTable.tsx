import { TableCell, TableSortLabel } from '@mui/material';
import { useMemo, useState } from 'react';

// Ported from terbebas prodpanel sortableTable.tsx: asc -> desc -> off cycle,
// Indonesian numeric collation.
export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string;
  dir: SortDir;
}

export function compareValues(a: unknown, b: unknown): number {
  const aEmpty = a === null || a === undefined || a === '';
  const bEmpty = b === null || b === undefined || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return -1;
  if (bEmpty) return 1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === 'boolean' && typeof b === 'boolean') return (a ? 1 : 0) - (b ? 1 : 0);
  return String(a).localeCompare(String(b), 'id', { numeric: true, sensitivity: 'base' });
}

export function useTableSort<T>(rows: T[], accessors: { [key: string]: (row: T) => unknown }) {
  const [sort, setSort] = useState<SortState | null>(null);
  const sorted = useMemo(() => {
    if (sort && accessors[sort.key]) {
      const accessor = accessors[sort.key];
      const arr = [...rows].sort((x, y) => compareValues(accessor(x), accessor(y)));
      if (sort.dir === 'desc') arr.reverse();
      return arr;
    }
    return rows;
  }, [rows, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleSort = (key: string) =>
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: 'asc' };
      if (prev.dir === 'asc') return { key, dir: 'desc' };
      return null;
    });
  return { sorted, sort, toggleSort };
}

export function SortableCell({ label, sortKey, sort, onToggle, align }: { label: string; sortKey: string; sort: SortState | null; onToggle: (key: string) => void; align?: 'left' | 'right' | 'center' }) {
  const active = sort?.key === sortKey;
  return (
    <TableCell align={align} sortDirection={active ? sort!.dir : false}>
      <TableSortLabel active={active} direction={active ? sort!.dir : 'asc'} onClick={() => onToggle(sortKey)}>
        {label}
      </TableSortLabel>
    </TableCell>
  );
}
