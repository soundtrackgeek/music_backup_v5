import { startTransition, useCallback, useState, type SetStateAction } from "react";

/** For discrete selections and their results; text inputs, dragging and hover stay urgent. */
export function useTransitionState<T>(initial: T | (() => T)) {
  const [value, setValue] = useState(initial);
  const select = useCallback((next: SetStateAction<T>) => {
    startTransition(() => setValue(next));
  }, []);
  return [value, select] as const;
}
