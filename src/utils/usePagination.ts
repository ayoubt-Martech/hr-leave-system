import { useEffect, useMemo, useState } from 'react';

/**
 * Simple client-side pagination over an already-fetched array. Clamps the
 * current page down automatically if the list shrinks (e.g. after a delete
 * or a filter change) so the view never lands on an empty page.
 */
export function usePagination<T>(items: T[], pageSize = 10) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [totalPages, page]);

  const startIndex = (page - 1) * pageSize;
  const pageItems = useMemo(
    () => items.slice(startIndex, startIndex + pageSize),
    [items, startIndex, pageSize]
  );

  return {
    page,
    setPage,
    totalPages,
    pageItems,
    startIndex,
    endIndex: Math.min(startIndex + pageSize, items.length),
    totalItems: items.length,
  };
}
