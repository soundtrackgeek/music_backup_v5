import type { ReviewRequest } from "../../bindings";

export type ReviewPeriod = "year" | "month" | "week" | "rolling";
export type ReviewRange = ReviewRequest & {
  title: string;
  dates: string;
  previousDates: string;
};
export const localDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const seconds = (date: Date) => Math.floor(date.getTime() / 1000);
const display = (start: Date, end: Date) => {
  const last = new Date(end);
  last.setDate(last.getDate() - 1);
  const formatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
  return `${formatter.format(start)} – ${formatter.format(last)}`;
};
function shiftMonths(date: Date, months: number) {
  const next = new Date(date.getFullYear(), date.getMonth() + months, 1);
  next.setDate(
    Math.min(
      date.getDate(),
      new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate(),
    ),
  );
  return next;
}

export function reviewRange(
  period: ReviewPeriod,
  anchor: string,
): ReviewRange | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return null;
  const [year, month, day] = anchor.split("-").map(Number);
  if (year < 1972 || year > 9997) return null;
  let start = new Date(year, month - 1, day),
    end: Date,
    previous: Date;
  if (localDate(start) !== anchor) return null;
  let title: string;
  if (period === "year") {
    start = new Date(year, 0, 1);
    end = new Date(year + 1, 0, 1);
    previous = new Date(year - 1, 0, 1);
    title = `${year} in Review`;
  } else if (period === "month") {
    start = new Date(year, month - 1, 1);
    end = new Date(year, month, 1);
    previous = new Date(year, month - 2, 1);
    title = `${new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(start)} in Review`;
  } else if (period === "week") {
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
    end = new Date(start);
    end.setDate(end.getDate() + 7);
    previous = new Date(start);
    previous.setDate(previous.getDate() - 7);
    title = "Week in Review";
  } else {
    end = new Date(start);
    end.setDate(end.getDate() + 1);
    start = shiftMonths(end, -12);
    previous = shiftMonths(start, -12);
    title = "12 Months in Review";
  }
  return {
    startAt: seconds(start),
    endAt: seconds(end),
    previousStartAt: seconds(previous),
    title,
    dates: display(start, end),
    previousDates: display(previous, start),
  };
}
