const SOULSEEK_SEARCH_CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

export function createSoulseekSearchClientId(
  now = Date.now(),
  random = Math.random(),
) {
  const timestamp = Math.max(0, Math.trunc(now)).toString(36);
  const boundedRandom = Number.isFinite(random)
    ? Math.min(Math.max(random, 0), 1 - Number.EPSILON)
    : 0;
  const entropy = Math.floor(boundedRandom * 36 ** 8)
    .toString(36)
    .padStart(8, "0");
  const clientId = `wishlist-${timestamp}-${entropy}`;

  // Keep this in lockstep with the native Soulseek session-ID contract.
  if (!SOULSEEK_SEARCH_CLIENT_ID_PATTERN.test(clientId)) {
    throw new Error("Could not create a valid Soulseek search session identifier.");
  }
  return clientId;
}
