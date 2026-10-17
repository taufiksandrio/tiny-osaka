export class PublishingError extends Error {
  constructor(code) { super(code); this.code = code; this.name = "PublishingError"; }
}
export const publishingFail = code => { throw new PublishingError(code); };
export const validId = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const parseSchedule = value => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) publishingFail("INVALID_TIME");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) publishingFail("INVALID_TIME");
  return date;
};
// The input is explicitly a WIB wall clock, never the browser's local timezone.
export const wibToUtc = value => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || "")) publishingFail("INVALID_TIME");
  const date = new Date(value + ":00+07:00");
  if (!Number.isFinite(date.getTime())) publishingFail("INVALID_TIME");
  const roundtrip = new Date(date.getTime() + 7 * 3600000).toISOString().slice(0, 16);
  if (roundtrip !== value) publishingFail("INVALID_TIME");
  return date.toISOString();
};
export const formatSchedule = value => new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta" }).format(new Date(value)) + " WIB";
