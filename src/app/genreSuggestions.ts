import { maxGenreSuggestions } from "./config";

export function parseList(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function formatList(values: string[]) {
  return values.join(", ");
}

export function listsEqual(left: string[], right: string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function normalizeGenreSuggestionText(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function uniqueGenreSuggestionOptions(values: string[]) {
  const seen = new Set<string>();
  const options: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    const key = normalizeGenreSuggestionText(trimmed);
    if (!trimmed || seen.has(key)) {
      return;
    }
    seen.add(key);
    options.push(trimmed);
  });
  return options;
}

export function genreTokenRange(value: string, caretPosition: number) {
  const cursor = Math.min(Math.max(caretPosition, 0), value.length);
  const commaBefore = value.lastIndexOf(",", Math.max(0, cursor - 1));
  const commaAfter = value.indexOf(",", cursor);
  return {
    start: commaBefore + 1,
    end: commaAfter === -1 ? value.length : commaAfter,
  };
}

export function currentGenreToken(value: string, caretPosition: number) {
  const range = genreTokenRange(value, caretPosition);
  const rawValue = value.slice(range.start, range.end);
  return {
    ...range,
    rawValue,
    query: rawValue.trim(),
  };
}

export function replaceGenreToken(value: string, caretPosition: number, genre: string) {
  const range = genreTokenRange(value, caretPosition);
  const rawValue = value.slice(range.start, range.end);
  const leadingWhitespace = rawValue.match(/^\s*/)?.[0] ?? "";
  const trailingWhitespace = rawValue.match(/\s*$/)?.[0] ?? "";
  const nextValue = `${value.slice(0, range.start)}${leadingWhitespace}${genre}${trailingWhitespace}${value.slice(range.end)}`;

  return {
    value: nextValue,
    caretPosition: range.start + leadingWhitespace.length + genre.length,
  };
}

function genreSuggestionScore(option: string, query: string) {
  const normalizedOption = normalizeGenreSuggestionText(option);
  const normalizedQuery = normalizeGenreSuggestionText(query);
  if (!normalizedOption || !normalizedQuery) {
    return null;
  }
  if (normalizedOption === normalizedQuery) {
    return 0;
  }
  if (normalizedOption.startsWith(normalizedQuery)) {
    return 10 + (normalizedOption.length - normalizedQuery.length) / 100;
  }

  const words = normalizedOption.split(" ");
  const wordStartIndex = words.findIndex((word) => word.startsWith(normalizedQuery));
  if (wordStartIndex >= 0) {
    const characterIndex = normalizedOption.indexOf(words[wordStartIndex]);
    return 20 + characterIndex + (normalizedOption.length - normalizedQuery.length) / 100;
  }

  const includesIndex = normalizedOption.indexOf(normalizedQuery);
  if (includesIndex >= 0) {
    return 40 + includesIndex + (normalizedOption.length - normalizedQuery.length) / 100;
  }

  let optionIndex = 0;
  let distance = 0;
  for (const character of normalizedQuery) {
    const nextIndex = normalizedOption.indexOf(character, optionIndex);
    if (nextIndex === -1) {
      return null;
    }
    distance += nextIndex - optionIndex;
    optionIndex = nextIndex + 1;
  }

  return 80 + distance + normalizedOption.length / 100;
}

export function genreSuggestions(options: string[], query: string) {
  const normalizedQuery = normalizeGenreSuggestionText(query);
  if (!normalizedQuery) {
    return [];
  }

  return options
    .map((option) => ({ option, score: genreSuggestionScore(option, normalizedQuery) }))
    .filter((item): item is { option: string; score: number } => item.score !== null)
    .sort((left, right) => left.score - right.score || left.option.localeCompare(right.option))
    .slice(0, maxGenreSuggestions)
    .map((item) => item.option);
}

