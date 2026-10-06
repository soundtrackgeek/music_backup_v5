import { canonicalCountryCode, countryNameFromCode } from "./countryNames";
import { type MusicBrainzOriginCountryOption } from "../types";
import { parseList, formatList } from "./genreSuggestions";

export function normalizeCountryCodes(values: string[]) {
  return values.map(canonicalCountryCode).filter(Boolean);
}

export function countryOptionCode(country: MusicBrainzOriginCountryOption) {
  return canonicalCountryCode(country.code);
}

export function countryOptionName(country: MusicBrainzOriginCountryOption) {
  const code = countryOptionCode(country);
  const name = country.name.trim();
  return name && name.toUpperCase() !== code
    ? name
    : (countryNameFromCode(code) ?? name);
}

export function countryOptionLabel(country: MusicBrainzOriginCountryOption) {
  const code = countryOptionCode(country);
  const name = countryOptionName(country);
  return name && name.toUpperCase() !== code ? `${code} - ${name}` : code;
}

export function countryOptionForCode(
  countryOptions: MusicBrainzOriginCountryOption[],
  code: string,
) {
  const normalizedCode = canonicalCountryCode(code);
  return countryOptions.find(
    (country) => countryOptionCode(country) === normalizedCode,
  );
}

export function countryOptionNameForCode(
  countryOptions: MusicBrainzOriginCountryOption[],
  code: string,
) {
  const normalizedCode = canonicalCountryCode(code);
  const option = countryOptionForCode(countryOptions, normalizedCode);
  return option
    ? countryOptionName(option)
    : countryNameFromCode(normalizedCode);
}

export function parseCountryToken(
  value: string,
  countryOptions: MusicBrainzOriginCountryOption[],
) {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  const leadingCode = trimmed
    .match(/^([a-z]{2})(?=$|\s|[-:])/i)?.[1]
    ?.toUpperCase();
  if (leadingCode) {
    return leadingCode;
  }

  const normalizedToken = normalizeCountrySuggestionText(trimmed);
  const matchedOption = countryOptions.find((country) => {
    const code = countryOptionCode(country);
    return (
      code.toLowerCase() === normalizedToken ||
      normalizeCountrySuggestionText(countryOptionName(country)) ===
        normalizedToken ||
      normalizeCountrySuggestionText(countryOptionLabel(country)) ===
        normalizedToken
    );
  });

  return matchedOption
    ? countryOptionCode(matchedOption)
    : trimmed.toUpperCase();
}

export function parseCountryList(
  value: string,
  countryOptions: MusicBrainzOriginCountryOption[] = [],
) {
  return normalizeCountryCodes(
    parseList(value).map((item) => parseCountryToken(item, countryOptions)),
  );
}

export function formatCountryCode(
  code: string,
  countryOptions: MusicBrainzOriginCountryOption[],
) {
  const normalizedCode = canonicalCountryCode(code);
  const name = countryOptionNameForCode(countryOptions, normalizedCode);
  return name && name.toUpperCase() !== normalizedCode
    ? `${normalizedCode} - ${name}`
    : normalizedCode;
}

export function formatCountryList(
  values: string[],
  countryOptions: MusicBrainzOriginCountryOption[],
) {
  return formatList(
    normalizeCountryCodes(values).map((code) =>
      formatCountryCode(code, countryOptions),
    ),
  );
}

export function normalizeCountrySuggestionText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function countrySuggestionScore(
  country: MusicBrainzOriginCountryOption,
  normalizedQuery: string,
) {
  const code = country.code.trim().toUpperCase();
  const normalizedCode = code.toLowerCase();
  const normalizedName = normalizeCountrySuggestionText(
    countryOptionName(country),
  );

  if (!normalizedQuery) {
    return null;
  }
  if (
    normalizedCode === normalizedQuery ||
    normalizedName === normalizedQuery
  ) {
    return 0;
  }
  if (normalizedCode.startsWith(normalizedQuery)) {
    return 10 + (normalizedCode.length - normalizedQuery.length) / 100;
  }
  if (normalizedName.startsWith(normalizedQuery)) {
    return 20 + (normalizedName.length - normalizedQuery.length) / 100;
  }

  const words = normalizedName.split(" ");
  const wordStartIndex = words.findIndex((word) =>
    word.startsWith(normalizedQuery),
  );
  if (wordStartIndex >= 0) {
    const characterIndex = normalizedName.indexOf(words[wordStartIndex]);
    return (
      30 +
      characterIndex +
      (normalizedName.length - normalizedQuery.length) / 100
    );
  }

  const includesIndex = `${normalizedCode} ${normalizedName}`.indexOf(
    normalizedQuery,
  );
  if (includesIndex >= 0) {
    return 50 + includesIndex + normalizedName.length / 100;
  }

  return null;
}

export function countrySuggestions(
  countryOptions: MusicBrainzOriginCountryOption[],
  query: string,
) {
  const normalizedQuery = normalizeCountrySuggestionText(query);
  if (!normalizedQuery) {
    return [];
  }

  return countryOptions
    .map((country) => ({
      country,
      score: countrySuggestionScore(country, normalizedQuery),
    }))
    .filter(
      (
        item,
      ): item is { country: MusicBrainzOriginCountryOption; score: number } =>
        item.score !== null,
    )
    .sort(
      (left, right) =>
        left.score - right.score ||
        countryOptionName(left.country).localeCompare(
          countryOptionName(right.country),
        ) ||
        left.country.code.localeCompare(right.country.code),
    )
    .slice(0, 8)
    .map((item) => item.country);
}
