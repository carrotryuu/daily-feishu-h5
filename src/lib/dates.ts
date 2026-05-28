const TIME_ZONE = "Asia/Shanghai";

function shanghaiParts(date: Date) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const parts = formatter.formatToParts(date);
  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value)
  };
}

function dateFromParts(parts: { year: number; month: number; day: number }) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0));
}

export function formatDate(date: Date) {
  const parts = shanghaiParts(date);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

export function today() {
  return formatDate(new Date());
}

export function addDays(dateString: string, days: number) {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days, 0, 0, 0));
  return formatDate(date);
}

export function yesterday() {
  return addDays(today(), -1);
}

export function monthOf(dateString: string) {
  return dateString.slice(0, 7);
}

export function nowIso() {
  return new Date().toISOString();
}

export function isTodayOrYesterday(dateString: string) {
  return dateString === today() || dateString === yesterday();
}

export function isWithinTPlusOne(dateString: string, compare = today()) {
  return compare === dateString || compare === addDays(dateString, 1);
}

export function sortDateAsc(a: string, b: string) {
  return dateFromParts({
    year: Number(a.slice(0, 4)),
    month: Number(a.slice(5, 7)),
    day: Number(a.slice(8, 10))
  }).getTime() - dateFromParts({
    year: Number(b.slice(0, 4)),
    month: Number(b.slice(5, 7)),
    day: Number(b.slice(8, 10))
  }).getTime();
}
