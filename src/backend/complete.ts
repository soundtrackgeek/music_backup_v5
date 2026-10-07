import type { Complete } from "../types";

/**
 * The backend always sends every field of a response, even where the generated
 * type nests a request struct whose serde defaults make its own fields optional.
 * This is the one place that narrows such a response to its `Complete` view.
 */
export function completed<T>(value: T): Complete<T> {
  return value as Complete<T>;
}
