import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  parseSiteUrl, getIndexingState, isIndexingOpen, getPublicRobotsMetadata, getCanonicalUrl,
  getCanonicalAlternates, getRobotsRules, getSitemapEntries, isPageLive,
} from "../../src/server/public/indexing.mjs";

test("live-page rule shared by metadata and sitemap: page row, or menu with products", () => {
  assert.equal(isPageLive("about", { page: { fields: {} } }), true);
  assert.equal(isPageLive("about", {}), false);
  assert.equal(isPageLive("guides", { productCount: 5 }), false);
  assert.equal(isPageLive("guides", { page: {} }), true);
  assert.equal(isPageLive("menu", { productCount: 0 }), false);
  assert.equal(isPageLive("menu", { productCount: 2 }), true);
  assert.equal(isPageLive("menu", { page: {} }), true);
});

const SITE = "https://tinyosaka.example";
const targets = [undefined, "", "dev", "test", "staging", "production", "Production"];
const sites = [undefined, "", "not a url", "http://tinyosaka.example", "https://localhost:3000", "https://127.0.0.1", "https://tinyosaka.example/path", SITE];
const flags = [undefined, "", "false", "TRUE", "1", "true "];
const closedRules = { rules: [{ userAgent: "*", disallow: "/" }] };

test("AC-12/17: every combination except production + exact true + valid SITE_URL is closed", () => {
  for (const PUBLIC_DATABASE_TARGET of targets) for (const SITE_URL of sites) for (const ALLOW_INDEXING of [...flags, "true"]) {
    const env = { PUBLIC_DATABASE_TARGET, SITE_URL, ALLOW_INDEXING };
    const open = PUBLIC_DATABASE_TARGET === "production" && ALLOW_INDEXING === "true" && SITE_URL === SITE;
    assert.equal(isIndexingOpen(env), open, JSON.stringify(env));
    if (open) continue;
    assert.deepEqual(getPublicRobotsMetadata(env), { index: false, follow: false });
    assert.deepEqual(getRobotsRules(env), closedRules);
    assert.equal(getCanonicalUrl("/menu", env), null);
    assert.equal(getCanonicalAlternates("/menu", env), undefined);
    assert.deepEqual(getSitemapEntries(["/", "/menu"], env), []);
  }
});

test("AC-13: production + flag + valid SITE_URL allows /, blocks /admin and /api, links sitemap", () => {
  const env = { PUBLIC_DATABASE_TARGET: "production", ALLOW_INDEXING: "true", SITE_URL: `${SITE}/` };
  assert.deepEqual(getRobotsRules(env), {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }], sitemap: `${SITE}/sitemap.xml`,
  });
  assert.deepEqual(getPublicRobotsMetadata(env), { index: true, follow: true });
});

test("AC-14: sitemap is absolute, deduplicated, no lastmod/hreflang, drops unsafe paths", () => {
  const env = { PUBLIC_DATABASE_TARGET: "production", ALLOW_INDEXING: "true", SITE_URL: SITE };
  const entries = getSitemapEntries(["/", "/menu", "/menu", "/menu/takoyaki", "admin", "//evil.com", "/a?b=1"], env);
  assert.deepEqual(entries, [{ url: `${SITE}/` }, { url: `${SITE}/menu` }, { url: `${SITE}/menu/takoyaki` }]);
  for (const entry of entries) {
    assert.deepEqual(Object.keys(entry), ["url"]);
    assert.doesNotMatch(entry.url, /\/(admin|api|id|en)(\/|$)/);
  }
});

test("AC-26: canonical is absolute SITE_URL + path, no hreflang; invalid path gives none", () => {
  const env = { PUBLIC_DATABASE_TARGET: "production", ALLOW_INDEXING: "true", SITE_URL: SITE };
  assert.equal(getCanonicalUrl("/", env), `${SITE}/`);
  assert.equal(getCanonicalUrl("/menu/takoyaki", env), `${SITE}/menu/takoyaki`);
  assert.deepEqual(getCanonicalAlternates("/about", env), { canonical: `${SITE}/about` });
  assert.equal(getCanonicalUrl("//evil.com", env), null);
  assert.equal(getCanonicalUrl("menu", env), null);
});

test("AC-17: invalid production SITE_URL never falls back to localhost", () => {
  for (const SITE_URL of [undefined, "", "javascript:alert(1)", "http://localhost:3000", "https://localhost", "https://10.0.0.5", "https://user:pw@tinyosaka.example", "https://tinyosaka.example?x=1", "https://intranet"]) {
    const env = { PUBLIC_DATABASE_TARGET: "production", ALLOW_INDEXING: "true", SITE_URL };
    assert.equal(parseSiteUrl(SITE_URL), null, String(SITE_URL));
    assert.equal(getIndexingState(env).open, false);
    assert.equal(getCanonicalUrl("/", env), null);
    assert.deepEqual(getSitemapEntries(["/"], env), []);
    assert.doesNotMatch(JSON.stringify(getRobotsRules(env)), /localhost/);
  }
  assert.equal(parseSiteUrl("https://Tinyosaka.Example/"), SITE);
});

const walk = dir => readdirSync(dir).flatMap(name => {
  const full = join(dir, name);
  return statSync(full).isDirectory() ? walk(full) : [full];
});

test("AC-16: no Restaurant/LocalBusiness JSON-LD anywhere in app or feature sources", () => {
  const files = [...walk("src/app"), ...walk("src/features"), ...walk("src/server")].filter(f => /\.(jsx?|mjs|tsx?)$/.test(f));
  assert.ok(files.length > 20);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /application\/ld\+json/i, file);
    assert.doesNotMatch(text, /["']@type["']\s*:\s*["'](Restaurant|LocalBusiness|FoodEstablishment)/, file);
  }
});
