import test from "node:test";
import assert from "node:assert/strict";
import { hostOf, summarizeOrderHosts } from "../../scripts/lib/order-hosts-report.mjs";

test("hostOf parses only the hostname and tolerates junk", () => {
  assert.equal(hostOf("https://app.grab.com/a?b=1"), "app.grab.com");
  assert.equal(hostOf(null), null);
  assert.equal(hostOf("  "), null);
  assert.equal(hostOf("not a url"), "(invalid)");
});
test("summarizeOrderHosts counts hosts per platform and accepted/rejected links against the allowlist (AC-12)", () => {
  const hosts = { grabfoodUrl: ["a.example"], gofoodUrl: ["b.example"], shopeefoodUrl: [] };
  const rows = [
    { grabfoodUrl: "https://a.example/1", gofoodUrl: "https://b.example/1", shopeefoodUrl: null },
    { grabfoodUrl: "https://evil.example/1", gofoodUrl: "https://b.example/2", shopeefoodUrl: "https://s.example/1" },
    { grabfoodUrl: null, gofoodUrl: null, shopeefoodUrl: null },
  ];
  const report = summarizeOrderHosts(rows, hosts);
  assert.equal(report.products, 3);
  assert.equal(report.productsWithRejected, 1);
  assert.deepEqual(report.platforms.grabfoodUrl, { links: 2, hosts: { "a.example": 1, "evil.example": 1 }, accepted: 1, rejected: 1 });
  assert.deepEqual(report.platforms.gofoodUrl, { links: 2, hosts: { "b.example": 2 }, accepted: 2, rejected: 0 });
  assert.deepEqual(report.platforms.shopeefoodUrl, { links: 1, hosts: { "s.example": 1 }, accepted: 0, rejected: 1 });
});
