type Unsubscribe = () => void;

// Listen before reading so work completed during mounting cannot be missed.
// A newer event wins over an in-flight snapshot; late subscriptions are cleaned up.
export function subscribeWithSnapshot<T>(
  subscribe: (handler: (value: T) => void) => Promise<Unsubscribe>,
  read: (() => Promise<T>) | null,
  receive: (value: T) => void,
  onError: (error: unknown) => void = () => undefined,
): Unsubscribe {
  let disposed = false;
  let unsubscribe: Unsubscribe | undefined;
  let revision = 0;
  void subscribe((value) => {
    revision += 1;
    if (!disposed) receive(value);
  }).then(async (cleanup) => {
    if (disposed) {
      cleanup();
      return;
    }
    unsubscribe = cleanup;
    if (!read) return;
    const beforeRead = revision;
    const value = await read();
    if (!disposed && revision === beforeRead) receive(value);
  }).catch((error) => {
    if (!disposed) onError(error);
  });
  return () => {
    disposed = true;
    unsubscribe?.();
  };
}
