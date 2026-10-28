"use client";

import { useCallback, useSyncExternalStore } from "react";

const listeners = new Map<string, Set<() => void>>();

function notify(key: string) {
  listeners.get(key)?.forEach((fn) => fn());
}

/** A string value mirrored in localStorage; safe during server rendering. */
export function useStoredValue(key: string, fallback: string): [string, (next: string) => void] {
  const subscribe = useCallback(
    (fn: () => void) => {
      let set = listeners.get(key);
      if (!set) {
        set = new Set();
        listeners.set(key, set);
      }
      set.add(fn);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key) fn();
      };
      window.addEventListener("storage", onStorage);
      return () => {
        set?.delete(fn);
        window.removeEventListener("storage", onStorage);
      };
    },
    [key],
  );
  const get = useCallback(() => {
    try {
      return window.localStorage.getItem(key) ?? fallback;
    } catch {
      return fallback;
    }
  }, [key, fallback]);
  const value = useSyncExternalStore(subscribe, get, () => fallback);
  const set = useCallback(
    (next: string) => {
      try {
        window.localStorage.setItem(key, next);
      } catch {
        // Private mode or blocked storage: the value just will not persist.
      }
      notify(key);
    },
    [key],
  );
  return [value, set];
}
