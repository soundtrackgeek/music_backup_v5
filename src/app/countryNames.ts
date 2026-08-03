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

export function countryNameFromCode(code: string) {
  const normalizedCode = code.trim().toUpperCase();
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
  const normalizedCode = countryCode.trim().toUpperCase();
  const storedName = storedCountryName?.trim() ?? "";

  if (storedName && storedName.toUpperCase() !== normalizedCode) {
    return storedName;
  }

  return (
    countryNameFromCode(normalizedCode) ??
    (storedName || normalizedCode || "Unknown country")
  );
}
