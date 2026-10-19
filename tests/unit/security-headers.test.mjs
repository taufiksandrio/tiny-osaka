import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { buildCsp, buildSecurityHeaders, isIndexingActive } from "../../src/server/security/headers.mjs";

const find = (headers, key) => headers.find((h) => h.key === key)?.value;
const directive = (csp, name) => csp.split("; ").find((d) => d.startsWith(`${name} `));

test("AC-28: CSP has the locked directives and no nonce, wildcard or eval in production", () => {
  const csp = buildCsp();
  for (const d of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"]) {
    assert.ok(csp.split("; ").includes(d), d);
  }
  assert.match(directive(csp, "script-src"), /'unsafe-inline'/);
  assert.match(directive(csp, "style-src"), /'unsafe-inline'/);
  assert.doesNotMatch(csp, /nonce-|'unsafe-eval'|\*|google/i);
  assert.match(buildCsp({ dev: true }), /'unsafe-eval'/);
});

test("AC-18: CSP is Report-Only in PR-1 with the baseline headers kept", () => {
  const headers = buildSecurityHeaders({ NODE_ENV: "production", PUBLIC_DATABASE_TARGET: "staging" });
  assert.ok(find(headers, "Content-Security-Policy-Report-Only"));
  assert.equal(find(headers, "Content-Security-Policy"), undefined);
  assert.equal(find(headers, "X-Content-Type-Options"), "nosniff");
  assert.equal(find(headers, "X-Frame-Options"), "DENY");
  assert.ok(find(headers, "Referrer-Policy"));
  assert.ok(find(headers, "Permissions-Policy"));
});

test("AC-19: HSTS only for production target, without includeSubDomains/preload", () => {
  for (const target of ["dev", "test", "staging", undefined]) {
    assert.equal(find(buildSecurityHeaders({ PUBLIC_DATABASE_TARGET: target }), "Strict-Transport-Security"), undefined);
  }
  const hsts = find(buildSecurityHeaders({ PUBLIC_DATABASE_TARGET: "production" }), "Strict-Transport-Security");
  assert.match(hsts, /^max-age=\d+$/);
});

test("AC-12: X-Robots-Tag noindex unless production with ALLOW_INDEXING exactly true", () => {
  const tag = (env) => find(buildSecurityHeaders(env), "X-Robots-Tag");
  assert.equal(tag({ PUBLIC_DATABASE_TARGET: "staging", ALLOW_INDEXING: "true" }), "noindex, nofollow");
  assert.equal(tag({}), "noindex, nofollow");
  assert.equal(tag({ PUBLIC_DATABASE_TARGET: "production" }), "noindex, nofollow");
  assert.equal(tag({ PUBLIC_DATABASE_TARGET: "production", ALLOW_INDEXING: "TRUE" }), "noindex, nofollow");
  assert.equal(tag({ PUBLIC_DATABASE_TARGET: "production", ALLOW_INDEXING: "true" }), undefined);
  assert.equal(isIndexingActive({ PUBLIC_DATABASE_TARGET: "production", ALLOW_INDEXING: "true" }), true);
});

test("AC-29: no raw HTML injection in src/", () => {
  const hits = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (/\.(jsx?|mjs|cjs)$/.test(name) && /dangerouslySetInnerHTML|__html|innerHTML/.test(readFileSync(path, "utf8"))) hits.push(path);
    }
  };
  walk(join(process.cwd(), "src"));
  assert.deepEqual(hits, []);
});
