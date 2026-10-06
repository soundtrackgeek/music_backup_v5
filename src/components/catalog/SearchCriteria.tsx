import {
  type TextFilter,
  type TextFilterOperator,
  type MusicBrainzOriginCountryOption,
  type CountryFlagDisplay,
} from "../../types";
import {
  operatorLabels,
  genreSuggestionAliases,
  completenessRange,
} from "../../app/config";
import {
  useId,
  useRef,
  useState,
  useMemo,
  useEffect,
  type KeyboardEvent,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  formatList,
  currentGenreToken,
  genreSuggestions,
  listsEqual,
  parseList,
  replaceGenreToken,
} from "../../app/genreSuggestions";
import {
  normalizeCountryCodes,
  formatCountryList,
  countrySuggestions,
  parseCountryList,
  countryOptionLabel,
} from "../../app/countryCriteria";
import { CountryOptionDisplay } from "./CatalogValues";
import { numberValue } from "../../app/input";
import {
  normalizeCompletenessRange,
  clampCompletenessValue,
} from "../../app/requests";
import { formatCompletenessRange } from "../../app/display";

export function TextCriterion({
  label,
  filter,
  onChange,
  placeholder,
}: {
  label: string;
  filter: TextFilter;
  onChange: (filter: TextFilter) => void;
  placeholder?: string;
}) {
  return (
    <label className="criterion criterion-text">
      <span>{label}</span>
      <div>
        <select
          value={filter.operator}
          onChange={(event) =>
            onChange({
              ...filter,
              operator: event.target.value as TextFilterOperator,
            })
          }
        >
          {Object.entries(operatorLabels).map(([value, optionLabel]) => (
            <option key={value} value={value}>
              {optionLabel}
            </option>
          ))}
        </select>
        <input
          value={filter.value}
          onChange={(event) =>
            onChange({ ...filter, value: event.target.value })
          }
          placeholder={placeholder}
        />
      </div>
    </label>
  );
}

export function GenreListCriterion({
  label,
  values,
  onChange,
  placeholder,
  genreOptions = [],
  onRequestOptions,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  genreOptions?: string[];
  onRequestOptions?: () => void;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-genre-suggestions`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [draftValue, setDraftValue] = useState(() => formatList(values));
  const [caretPosition, setCaretPosition] = useState(() => draftValue.length);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const activeToken = useMemo(
    () => currentGenreToken(draftValue, caretPosition),
    [caretPosition, draftValue],
  );
  const suggestions = useMemo(
    () => genreSuggestions(genreOptions, activeToken.query),
    [activeToken.query, genreOptions],
  );
  const showSuggestions =
    isSuggestionOpen &&
    suggestions.length > 0 &&
    activeToken.query.trim().length > 0;
  const activeSuggestionId = showSuggestions
    ? `${listboxId}-option-${activeSuggestionIndex}`
    : undefined;

  useEffect(() => {
    if (!listsEqual(parseList(draftValue), values)) {
      const nextValue = formatList(values);
      setDraftValue(nextValue);
      setCaretPosition(nextValue.length);
    }
  }, [draftValue, values]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [activeToken.query, suggestions.length]);

  function syncCaret(input: HTMLInputElement) {
    setCaretPosition(input.selectionStart ?? input.value.length);
  }

  function updateDraft(nextValue: string) {
    setDraftValue(nextValue);
    onChange(parseList(nextValue));
  }

  function chooseSuggestion(suggestion: string) {
    const nextDraft = replaceGenreToken(draftValue, caretPosition, suggestion);
    updateDraft(nextDraft.value);
    setCaretPosition(nextDraft.caretPosition);
    setIsSuggestionOpen(false);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(
        nextDraft.caretPosition,
        nextDraft.caretPosition,
      );
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) =>
        showSuggestions ? (current + 1) % suggestions.length : 0,
      );
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) =>
        showSuggestions
          ? (current - 1 + suggestions.length) % suggestions.length
          : suggestions.length - 1,
      );
      return;
    }

    if ((event.key === "Enter" || event.key === "Tab") && showSuggestions) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestionIndex]);
      return;
    }

    if (event.key === "Escape") {
      setIsSuggestionOpen(false);
    }
  }

  return (
    <div className="criterion genre-list-criterion">
      <span id={`${inputId}-label`}>{label}</span>
      <input
        ref={inputRef}
        id={inputId}
        aria-labelledby={`${inputId}-label`}
        aria-autocomplete="list"
        aria-controls={showSuggestions ? listboxId : undefined}
        aria-expanded={showSuggestions}
        aria-activedescendant={activeSuggestionId}
        value={draftValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          syncCaret(event.target);
          updateDraft(nextValue);
          setIsSuggestionOpen(true);
        }}
        onFocus={(event) => {
          syncCaret(event.currentTarget);
          setIsSuggestionOpen(true);
          if (genreOptions.length <= genreSuggestionAliases.length) {
            onRequestOptions?.();
          }
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => syncCaret(event.currentTarget)}
        onClick={(event) => syncCaret(event.currentTarget)}
        onSelect={(event) => syncCaret(event.currentTarget)}
        onBlur={(event) => {
          setDraftValue(formatList(parseList(event.currentTarget.value)));
          setIsSuggestionOpen(false);
        }}
        placeholder={placeholder}
      />
      {showSuggestions ? (
        <div className="genre-suggestions" id={listboxId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              className={
                index === activeSuggestionIndex
                  ? "genre-suggestion active"
                  : "genre-suggestion"
              }
              id={`${listboxId}-option-${index}`}
              key={suggestion}
              type="button"
              role="option"
              aria-selected={index === activeSuggestionIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                chooseSuggestion(suggestion);
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CountryListCriterion({
  label,
  values,
  onChange,
  countryOptions,
  displayMode,
  placeholder = "GB, US",
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  countryOptions: MusicBrainzOriginCountryOption[];
  displayMode: CountryFlagDisplay;
  placeholder?: string;
}) {
  const inputId = useId();
  const listboxId = `${inputId}-country-suggestions`;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedValues = useMemo(
    () => normalizeCountryCodes(values),
    [values],
  );
  const formattedValues = useMemo(
    () => formatCountryList(normalizedValues, countryOptions),
    [countryOptions, normalizedValues],
  );
  const [draftValue, setDraftValue] = useState(() => formattedValues);
  const [caretPosition, setCaretPosition] = useState(() => draftValue.length);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [isSuggestionOpen, setIsSuggestionOpen] = useState(false);
  const activeToken = useMemo(
    () => currentGenreToken(draftValue, caretPosition),
    [caretPosition, draftValue],
  );
  const suggestions = useMemo(
    () => countrySuggestions(countryOptions, activeToken.query),
    [activeToken.query, countryOptions],
  );
  const showSuggestions =
    isSuggestionOpen &&
    suggestions.length > 0 &&
    activeToken.query.trim().length > 0;
  const activeSuggestionId = showSuggestions
    ? `${listboxId}-option-${activeSuggestionIndex}`
    : undefined;

  useEffect(() => {
    const parsedDraft = parseCountryList(draftValue, countryOptions);
    if (
      !listsEqual(parsedDraft, normalizedValues) ||
      draftValue === formatList(normalizedValues)
    ) {
      setDraftValue(formattedValues);
      setCaretPosition(formattedValues.length);
    }
  }, [countryOptions, draftValue, formattedValues, normalizedValues]);

  useEffect(() => {
    setActiveSuggestionIndex(0);
  }, [activeToken.query, suggestions.length]);

  function syncCaret(input: HTMLInputElement) {
    setCaretPosition(input.selectionStart ?? input.value.length);
  }

  function updateDraft(value: string) {
    setDraftValue(value);
    onChange(parseCountryList(value, countryOptions));
  }

  function chooseSuggestion(
    suggestion: MusicBrainzOriginCountryOption | undefined,
  ) {
    if (!suggestion) {
      return;
    }
    const nextDraft = replaceGenreToken(
      draftValue,
      caretPosition,
      countryOptionLabel(suggestion),
    );
    updateDraft(nextDraft.value);
    setCaretPosition(nextDraft.caretPosition);
    setIsSuggestionOpen(false);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(
        nextDraft.caretPosition,
        nextDraft.caretPosition,
      );
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) =>
        showSuggestions ? (current + 1) % suggestions.length : 0,
      );
      return;
    }

    if (event.key === "ArrowUp" && suggestions.length > 0) {
      event.preventDefault();
      setIsSuggestionOpen(true);
      setActiveSuggestionIndex((current) =>
        showSuggestions
          ? (current - 1 + suggestions.length) % suggestions.length
          : suggestions.length - 1,
      );
      return;
    }

    if ((event.key === "Enter" || event.key === "Tab") && showSuggestions) {
      event.preventDefault();
      chooseSuggestion(suggestions[activeSuggestionIndex]);
      return;
    }

    if (event.key === "Escape") {
      setIsSuggestionOpen(false);
    }
  }

  return (
    <div className="criterion genre-list-criterion country-list-criterion">
      <span id={`${inputId}-label`}>{label}</span>
      <input
        ref={inputRef}
        id={inputId}
        aria-labelledby={`${inputId}-label`}
        aria-autocomplete="list"
        aria-controls={showSuggestions ? listboxId : undefined}
        aria-expanded={showSuggestions}
        aria-activedescendant={activeSuggestionId}
        value={draftValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          syncCaret(event.target);
          updateDraft(nextValue);
          setIsSuggestionOpen(true);
        }}
        onFocus={(event) => {
          syncCaret(event.currentTarget);
          setIsSuggestionOpen(true);
        }}
        onKeyDown={handleKeyDown}
        onKeyUp={(event) => syncCaret(event.currentTarget)}
        onClick={(event) => syncCaret(event.currentTarget)}
        onSelect={(event) => syncCaret(event.currentTarget)}
        onBlur={(event) => {
          setDraftValue(
            formatCountryList(
              parseCountryList(event.currentTarget.value, countryOptions),
              countryOptions,
            ),
          );
          setIsSuggestionOpen(false);
        }}
        placeholder={placeholder}
      />
      {showSuggestions ? (
        <div className="genre-suggestions" id={listboxId} role="listbox">
          {suggestions.map((suggestion, index) => (
            <button
              className={
                index === activeSuggestionIndex
                  ? "genre-suggestion active"
                  : "genre-suggestion"
              }
              id={`${listboxId}-option-${index}`}
              key={suggestion.code}
              type="button"
              role="option"
              aria-selected={index === activeSuggestionIndex}
              onMouseDown={(event) => {
                event.preventDefault();
                chooseSuggestion(suggestion);
              }}
            >
              <CountryOptionDisplay country={suggestion} mode={displayMode} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
}) {
  return (
    <label className="criterion">
      <span>{label}</span>
      <input
        type="number"
        value={value ?? ""}
        min={min}
        max={max}
        step={step}
        onChange={(event) => onChange(numberValue(event.target.value))}
      />
    </label>
  );
}

export function WeekField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="criterion">
      <span>{label}</span>
      <input
        type="week"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </label>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  return (
    <label className="criterion">
      <span>{label}</span>
      <input
        type="date"
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </label>
  );
}

export function CompletenessRangeCriterion({
  minValue,
  maxValue,
  onChange,
  className = "",
}: {
  minValue: number | null;
  maxValue: number | null;
  onChange: (range: { min: number; max: number }) => void;
  className?: string;
}) {
  const { min, max } = normalizeCompletenessRange(
    minValue ?? completenessRange.min,
    maxValue ?? completenessRange.max,
  );
  const style = {
    "--range-min": `${min}%`,
    "--range-max": `${max}%`,
  } as CSSProperties;
  const minHandleStyle = { "--handle-position": `${min}%` } as CSSProperties;
  const maxHandleStyle = { "--handle-position": `${max}%` } as CSSProperties;
  const controlRef = useRef<HTMLDivElement | null>(null);

  function updateMin(value: number) {
    onChange(normalizeCompletenessRange(Math.min(value, max), max));
  }

  function updateMax(value: number) {
    onChange(normalizeCompletenessRange(min, Math.max(value, min)));
  }

  function valueFromPointer(clientX: number) {
    const rect = controlRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return completenessRange.min;
    return clampCompletenessValue(
      ((clientX - rect.left) / rect.width) * completenessRange.max,
    );
  }

  function updateHandle(handle: "min" | "max", value: number) {
    if (handle === "min") {
      updateMin(value);
    } else {
      updateMax(value);
    }
  }

  function handlePointerDown(
    event: PointerEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    updateHandle(handle, valueFromPointer(event.clientX));
  }

  function handlePointerMove(
    event: PointerEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      updateHandle(handle, valueFromPointer(event.clientX));
    }
  }

  function handlePointerUp(event: PointerEvent<HTMLButtonElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    handle: "min" | "max",
  ) {
    const current = handle === "min" ? min : max;
    const step = event.shiftKey ? 10 : completenessRange.step;
    let nextValue: number | null = null;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        nextValue = current - step;
        break;
      case "ArrowRight":
      case "ArrowUp":
        nextValue = current + step;
        break;
      case "PageDown":
        nextValue = current - 10;
        break;
      case "PageUp":
        nextValue = current + 10;
        break;
      case "Home":
        nextValue = completenessRange.min;
        break;
      case "End":
        nextValue = completenessRange.max;
        break;
      default:
        break;
    }

    if (nextValue != null) {
      event.preventDefault();
      updateHandle(handle, nextValue);
    }
  }

  return (
    <div
      className={`criterion slider-criterion completeness-range-criterion ${className}`.trim()}
    >
      <span>Completeness</span>
      <div className="range-slider" style={style}>
        <div className="range-control" ref={controlRef}>
          <span className="range-track" aria-hidden="true" />
          <button
            className={
              min === max && min === completenessRange.max
                ? "range-handle range-handle-min range-handle-overlap"
                : "range-handle range-handle-min"
            }
            type="button"
            role="slider"
            aria-label="Minimum completeness"
            aria-valuemin={completenessRange.min}
            aria-valuemax={max}
            aria-valuenow={min}
            aria-valuetext={`${min}%`}
            style={minHandleStyle}
            onPointerDown={(event) => handlePointerDown(event, "min")}
            onPointerMove={(event) => handlePointerMove(event, "min")}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={(event) => handleKeyDown(event, "min")}
          />
          <button
            className="range-handle range-handle-max"
            type="button"
            role="slider"
            aria-label="Maximum completeness"
            aria-valuemin={min}
            aria-valuemax={completenessRange.max}
            aria-valuenow={max}
            aria-valuetext={`${max}%`}
            style={maxHandleStyle}
            onPointerDown={(event) => handlePointerDown(event, "max")}
            onPointerMove={(event) => handlePointerMove(event, "max")}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onKeyDown={(event) => handleKeyDown(event, "max")}
          />
        </div>
        <strong>{formatCompletenessRange(min, max)}</strong>
      </div>
    </div>
  );
}

export function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <label className="criterion">
      <span>{label}</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
