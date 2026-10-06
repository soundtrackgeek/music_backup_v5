import {
  ratingStarCount,
  formatTrackRating,
  formatOriginCountry,
} from "../../app/display";
import { Star, Database } from "lucide-react";
import {
  type CountryFlagDisplay,
  type MusicBrainzOriginCountryOption,
} from "../../types";
import { normalizedValue } from "../../app/visualizationMath";
import {
  countryFlagCodeFromCode,
  canonicalCountryCode,
  countryNameFromCode,
} from "../../app/countryNames";
import {
  countryOptionForCode,
  countryOptionName,
  normalizeCountryCodes,
  countryOptionCode,
  countryOptionLabel,
} from "../../app/countryCriteria";
import { Fragment } from "react";

export function RatingStars({
  value,
  label = "Rating",
  showValue = true,
}: {
  value: number | null | undefined;
  label?: string;
  showValue?: boolean;
}) {
  const filledStars = ratingStarCount(value);
  const ratingLabel = formatTrackRating(value);

  return (
    <span
      className="rating-stars"
      aria-label={ratingLabel ? `${label} ${ratingLabel}` : `${label} unrated`}
    >
      {Array.from({ length: 5 }, (_, index) => (
        <Star
          key={index}
          size={14}
          strokeWidth={1.8}
          className={index < filledStars ? "filled" : undefined}
          aria-hidden="true"
        />
      ))}
      {showValue ? <small>{ratingLabel || "Unrated"}</small> : null}
    </span>
  );
}

export function Metric({
  label,
  value,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "teal" | "amber";
  icon: typeof Database;
}) {
  return (
    <section className={`metric metric-${tone}`}>
      <div className="metric-icon" aria-hidden="true">
        <Icon size={18} strokeWidth={2} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </section>
  );
}

export function RunStatus({ status }: { status: string }) {
  return (
    <span className={`run-status run-status-${status.toLowerCase()}`}>
      {status}
    </span>
  );
}

export type OriginCountryValue = {
  originCountryCode: string | null;
  originCountryName: string | null;
  originCountryRawArea?: string | null;
};

export function CountryFlag({
  code,
  label,
  decorative = false,
}: {
  code: string;
  label: string;
  decorative?: boolean;
}) {
  return (
    <span
      className={`country-flag fi fi-${code}`}
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : label}
    />
  );
}

export function CountryDisplay({
  value,
  mode,
  fallback = "",
  className = "",
}: {
  value: OriginCountryValue;
  mode: CountryFlagDisplay;
  fallback?: string;
  className?: string;
}) {
  const normalizedValue = {
    originCountryCode: value.originCountryCode,
    originCountryName: value.originCountryName,
    originCountryRawArea: value.originCountryRawArea ?? null,
  };
  const label = formatOriginCountry(normalizedValue);
  const flagCode = countryFlagCodeFromCode(value.originCountryCode);
  const showFlag = mode !== "name" && Boolean(flagCode);
  const showName = mode !== "flag" && Boolean(label);

  if (!label && !flagCode) {
    return fallback ? <>{fallback}</> : null;
  }

  if (!showFlag && !showName) {
    return <>{label || fallback}</>;
  }

  const title = [value.originCountryCode?.trim().toUpperCase(), label]
    .filter(Boolean)
    .join(" - ");
  const classes = ["country-display", `country-display-${mode}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} title={title || undefined}>
      {showFlag ? (
        <CountryFlag
          code={flagCode}
          label={label || value.originCountryCode || "Country flag"}
          decorative={showName}
        />
      ) : null}
      {showName ? <span className="country-name">{label}</span> : null}
    </span>
  );
}

export function countryValueFromCode(
  code: string,
  countryOptions: MusicBrainzOriginCountryOption[],
): OriginCountryValue {
  const normalizedCode = canonicalCountryCode(code);
  const option = countryOptionForCode(countryOptions, normalizedCode);
  return {
    originCountryCode: normalizedCode,
    originCountryName: option
      ? countryOptionName(option)
      : (countryNameFromCode(normalizedCode) ?? normalizedCode),
    originCountryRawArea: null,
  };
}

export function CountryListDisplay({
  values,
  countryOptions,
  mode,
}: {
  values: string[];
  countryOptions: MusicBrainzOriginCountryOption[];
  mode: CountryFlagDisplay;
}) {
  const codes = normalizeCountryCodes(values);
  if (codes.length === 0) {
    return null;
  }

  return (
    <span className="country-list-display">
      {codes.map((code, index) => (
        <Fragment key={code}>
          {index > 0 ? <span className="country-list-separator">,</span> : null}
          <CountryDisplay
            value={countryValueFromCode(code, countryOptions)}
            mode={mode}
          />
        </Fragment>
      ))}
    </span>
  );
}

export function CountryOptionDisplay({
  country,
  mode,
}: {
  country: MusicBrainzOriginCountryOption;
  mode: CountryFlagDisplay;
}) {
  return (
    <CountryDisplay
      value={{
        originCountryCode: countryOptionCode(country),
        originCountryName: countryOptionName(country),
        originCountryRawArea: null,
      }}
      mode={mode}
      fallback={countryOptionLabel(country)}
    />
  );
}
