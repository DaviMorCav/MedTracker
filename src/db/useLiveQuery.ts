import { useState, useEffect } from 'react';
import { liveQuery } from 'dexie';

/**
 * Hook para reagir reativamente a queries do Dexie IndexedDB.
 */
export function useLiveQuery<T>(
  querier: () => Promise<T> | T,
  deps: React.DependencyList = [],
  defaultValue: T
): T {
  const [data, setData] = useState<T>(defaultValue);

  useEffect(() => {
    let active = true;
    const observable = liveQuery(querier);
    const subscription = observable.subscribe({
      next: (val) => {
        if (active) {
          setData(val);
        }
      },
      error: (err) => {
        console.error('useLiveQuery error:', err);
      },
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return data;
}
