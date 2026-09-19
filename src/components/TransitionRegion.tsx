import { useDeferredValue, ViewTransition, type ReactNode } from "react";

/**
 * Defer only the rendered content, not the input or request state that drives it.
 * This also animates independently completed effect-based requests without
 * pretending they are Suspense resources. No keyed remount or extra DOM node:
 * selection, focus, scroll and component state survive content updates.
 */
export function TransitionRegion({ children }: { children: ReactNode }) {
  const content = useDeferredValue(children);
  return <ViewTransition default="content-crossfade">{content}</ViewTransition>;
}
