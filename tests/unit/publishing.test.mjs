import test from "node:test";
import assert from "node:assert/strict";
import { parseSchedule, wibToUtc, formatSchedule } from "../../src/server/publishing/policy.mjs";
test("WIB wall clock converts independently of machine timezone, including previous UTC date", () => {
  assert.equal(wibToUtc("2026-10-18T00:15"), "2026-10-17T17:15:00.000Z");
  assert.equal(wibToUtc("2028-02-29T12:00"), "2028-02-29T05:00:00.000Z");
  assert.match(formatSchedule("2026-10-17T17:15:00.000Z"), /18 Okt 2026.*00[.:]15 WIB/);
});
test("schedule parser rejects invalid dates, local timestamps and offsets", () => {
  for (const value of [null, "", "2026-02-30T00:00", "2026-10-18T25:00", "2026-10-18T00:00Z"]) assert.throws(() => wibToUtc(value), { code: "INVALID_TIME" });
  for (const value of [null, "2026-10-18", "2026-02-30T00:00:00.000Z", "2026-10-18T00:00:00+07:00"]) assert.throws(() => parseSchedule(value), { code: "INVALID_TIME" });
  assert.equal(parseSchedule("2026-10-18T00:00:00.000Z").toISOString(), "2026-10-18T00:00:00.000Z");
});
