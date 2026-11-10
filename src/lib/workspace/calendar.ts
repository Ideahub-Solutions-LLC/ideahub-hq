import { nowIso } from "@/lib/ids";
export function validTimeZone(value: string) {
  if (value.length > 80) throw new Error("Invalid calendar time zone.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return value;
  } catch {
    throw new Error("Use a valid IANA time zone, such as UTC or Asia/Manila.");
  }
}
export function dateKey(value: string, timeZone: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}
export function monthGrid(raw?: string) {
  const month = raw || nowIso().slice(0, 7);
  if (!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month))
    throw new Error("Use a month in YYYY-MM format.");
  const [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const start = new Date(first);
  start.setUTCDate(1 - ((first.getUTCDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    return {
      key: d.toISOString().slice(0, 10),
      day: d.getUTCDate(),
      inMonth: d.getUTCMonth() === m - 1,
    };
  });
  return {
    month,
    label: new Intl.DateTimeFormat("en", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(first),
    previous: new Date(Date.UTC(year, m - 2, 1)).toISOString().slice(0, 7),
    next: new Date(Date.UTC(year, m, 1)).toISOString().slice(0, 7),
    days,
  };
}
export function eventOnDay(
  data: Record<string, unknown>,
  day: string,
  zone: string,
) {
  return (
    dateKey(String(data.startAt), zone) <= day &&
    dateKey(new Date(Date.parse(String(data.endAt)) - 1).toISOString(), zone) >=
      day
  );
}
export function eventTime(value: string, zone: string) {
  return new Intl.DateTimeFormat("en", {
    timeZone: zone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}
