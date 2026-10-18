import { describe, expect, it } from "vitest";
import { localDate, reviewRange } from "./reviewPeriods";

const startDate = (timestamp: number) => localDate(new Date(timestamp * 1000));
describe("calendar reviews", () => {
  it("uses calendar months and leap years rather than fixed day counts", () => {
    const feb = reviewRange("month", "2024-02-29")!;
    expect(startDate(feb.startAt)).toBe("2024-02-01");
    expect(startDate(feb.endAt)).toBe("2024-03-01");
    expect(startDate(feb.previousStartAt)).toBe("2024-01-01");
    const year = reviewRange("year", "2024-06-01")!;
    expect(startDate(year.endAt)).toBe("2025-01-01");
  });
  it("starts weeks on Monday even across a year boundary", () => {
    const week = reviewRange("week", "2026-01-01")!;
    expect(startDate(week.startAt)).toBe("2025-12-29");
    expect(startDate(week.endAt)).toBe("2026-01-05");
    expect(startDate(week.previousStartAt)).toBe("2025-12-22");
    expect(reviewRange("week", "2026-01-04")!.startAt).toBe(week.startAt);
  });
  it("uses local midnight at DST changes and clamps rolling leap dates", () => {
    const week = reviewRange("week", "2026-03-29")!;
    expect(new Date(week.endAt * 1000).getHours()).toBe(0);
    expect(startDate(week.endAt)).toBe("2026-03-30");
    const rolling = reviewRange("rolling", "2024-02-28")!;
    expect(startDate(rolling.endAt)).toBe("2024-02-29");
    expect(startDate(rolling.startAt)).toBe("2023-02-28");
    expect(startDate(rolling.previousStartAt)).toBe("2022-02-28");
  });
  it("rejects incomplete, invalid and out-of-range input", () => {
    for (const input of [
      "",
      "2026-02-30",
      "2026-13-01",
      "1970-01-01",
      "9999-01-01",
      "202-01-01",
    ])
      expect(reviewRange("month", input)).toBeNull();
  });
});
