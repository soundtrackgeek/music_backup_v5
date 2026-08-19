type RegionDisplayNames = {
  of(code: string): string | undefined;
};

const regionDisplayNames =
  "DisplayNames" in Intl
    ? new (
        Intl as typeof Intl & {
          DisplayNames: new (
            locales: string[],
            options: { type: "region" },
          ) => RegionDisplayNames;
        }
      ).DisplayNames(["en"], { type: "region" })
    : null;

export function canonicalCountryCode(code: string | null | undefined) {
  const normalizedCode = code?.trim().toUpperCase() ?? "";
  return normalizedCode === "UK" ? "GB" : normalizedCode;
}

export function countryFlagCodeFromCode(code: string | null | undefined) {
  const normalizedCode = canonicalCountryCode(code).toLowerCase();
  return /^[a-z]{2}$/.test(normalizedCode) ? normalizedCode : "";
}

export function countryNameFromCode(code: string) {
  const normalizedCode = canonicalCountryCode(code);
  if (!/^[A-Z]{2}$/.test(normalizedCode)) {
    return null;
  }

  const displayName = regionDisplayNames?.of(normalizedCode)?.trim();
  return displayName && displayName.toUpperCase() !== normalizedCode
    ? displayName
    : null;
}

export function resolveCountryName(
  countryCode: string,
  storedCountryName: string | null | undefined,
) {
  const normalizedCode = canonicalCountryCode(countryCode);
  const storedName = storedCountryName?.trim() ?? "";

  if (storedName && canonicalCountryCode(storedName) !== normalizedCode) {
    return storedName;
  }

  return (
    countryNameFromCode(normalizedCode) ??
    (storedName || normalizedCode || "Unknown country")
  );
}
