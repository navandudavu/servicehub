import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Gmail-style row selection for a list: tick rows, tick the header box to select / unselect everything that is
 * on screen. "Everything" means the rows currently shown (one page). When the list changes (another page, a filter,
 * a refresh after an action) ids that are no longer shown are dropped, so a bulk action can never touch a row
 * the user cannot see.
 */
export function useSelection(ids: number[]) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const key = ids.join(',');

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const shown = new Set(ids);
      const next = new Set(Array.from(prev).filter((id) => shown.has(id)));
      return next.size === prev.size ? prev : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const count = selected.size;
  const allSelected = ids.length > 0 && count === ids.length;
  const someSelected = count > 0 && !allSelected;

  const toggleAll = useCallback(() => {
    setSelected(allSelected ? new Set() : new Set(ids));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allSelected, key]);

  const clear = useCallback(() => setSelected(new Set()), []);
  const isSelected = useCallback((id: number) => selected.has(id), [selected]);
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  return { selected, selectedIds, count, allSelected, someSelected, toggle, toggleAll, clear, isSelected };
}
