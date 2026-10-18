// One-off catalog import from a CSV file. Dry-run by default; --apply writes.
// Run: PUBLIC_DATABASE_TARGET=test node --conditions=react-server --env-file=.env.cms.local scripts/import-catalog-csv.mjs --file <csv> [--apply]
// Goes through createCmsCatalog().create, i.e. the same server path as the CMS "add product" card (Owner role).
// --photos <csv> (columns nama_menu,url_foto_grabfood): with --apply, downloads each photo (https, host huawei-food-cms.grab.com
// only, manual redirects re-validated, 20s timeout, 10MB cap), validates with inspectImage and uploads via createMediaAssets
// (same path as CMS upload; alt "Foto <nama>"). Existing products get an image only when they have none. Dry-run: no network.
// Rules: no hotlinking, order links stored as text only (never opened), no merchant sync,
// never updates/deletes (existing names are skipped), descriptions with unverified claims are imported empty.
// Category column is discarded. The CSV stays outside Git. Local CMS role only (getCmsDatabaseConfig: 127.0.0.1).
// --apply against the dev database additionally needs --allow-dev (requires separate user approval).
import { readFileSync } from "node:fs";
import pg from "pg";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { createCmsCatalog } from "../src/server/cms/catalog.mjs";
import { getCmsDatabaseConfig } from "../src/server/cms/request-policy.mjs";
import { roles } from "../src/server/db/auth-schema.mjs";
import * as s from "../src/server/db/schema.mjs";
import { createMediaAssets } from "../src/server/media/assets.mjs";
import { createLocalStorage, inspectImage } from "../src/server/media/storage.mjs";
import { csvRecords, planImport, toProductInput, categorySummary, normalizeName, fillableDescription, photoMap, photoAlt, checkPhotoUrl, downloadPhoto } from "./lib/catalog-csv.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const optionValue = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const file = optionValue("--file");
const photosFile = optionValue("--photos");
// Default off. For existing products only: fill an EMPTY description with the CSV text when it passes the claim filter.
const fillDescriptions = args.includes("--fill-descriptions");
if (process.env.NODE_ENV === "production") { console.error("Refusing: NODE_ENV=production."); process.exit(1); }
if (!file) { console.error("Usage: --file <csv> [--apply]"); process.exit(1); }
if (!process.env.PUBLIC_DATABASE_TARGET) { console.error("Refusing: set PUBLIC_DATABASE_TARGET=test (or dev) explicitly."); process.exit(1); }
if (apply && process.env.PUBLIC_DATABASE_TARGET !== "test" && !args.includes("--allow-dev")) {
  console.error("Refusing --apply on a non-test database without --allow-dev (needs separate approval)."); process.exit(1);
}

let pool;
try {
  const records = csvRecords(readFileSync(file, "utf8"), ["nama_menu", "harga", "deskripsi"]);
  const config = getCmsDatabaseConfig();
  pool = new pg.Pool(config);
  const db = drizzle(pool);
  const [owner] = await db.select().from(roles).where(eq(roles.role, "owner"));
  if (!owner?.enabled) { console.error("No enabled Owner account in this database; nothing done."); process.exit(1); }
  const api = createCmsCatalog({ db, authenticate: async () => ({ subject: owner.userId }) });
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}; target ${new URL(config.connectionString).pathname.slice(1)}; rows ${records.length}`);
  console.log("Categories discarded:", categorySummary(records).map(item => `${item.category} (${item.count})`).join("; "));

  const cards = (await api.list(null)).products;
  const existing = new Set(cards.map(card => normalizeName(card.name)));
  const cardByName = new Map(cards.map(card => [normalizeName(card.name), card]));
  const plans = planImport(records, existing);
  const photos = photosFile ? photoMap(csvRecords(readFileSync(photosFile, "utf8"), ["nama_menu", "url_foto_grabfood"])) : new Map();

  // Photo pipeline (apply only): download (host-locked) -> inspectImage -> reuse asset with same checksum, else upload via createMediaAssets.
  const storage = photosFile && apply ? createLocalStorage() : null;
  const actor = { subject: owner.userId, role: "owner" };
  const photoCounts = { downloaded: 0, uploaded: 0, reused: 0, attached: 0, failed: 0, none: 0, invalidUrl: 0, wouldDownload: 0 };
  const photoFailures = [];
  const obtainAsset = async url => {
    const bytes = await downloadPhoto(url);
    photoCounts.downloaded++;
    const report = await inspectImage(bytes);
    const [same] = await db.select({ id: s.mediaAssets.id }).from(s.mediaAssets)
      .where(and(eq(s.mediaAssets.checksum, report.checksum), eq(s.mediaAssets.kind, "image"))).limit(1);
    if (same) { photoCounts.reused++; return same.id; }
    const received = await storage.receive(new Response(bytes).body, report.mime);
    try {
      const media = createMediaAssets({ db, resolveActor: async () => actor, inspectFile: async key => {
        if (key !== received.report.storageKey) throw new Error("key mismatch");
        return received.report;
      } });
      const row = await media.registerFile({ storageKey: received.report.storageKey });
      photoCounts.uploaded++;
      return row.id;
    } catch (error) { await received.discard().catch(() => {}); throw error; }
  };
  const photoFor = plan => {
    const url = photos.get(normalizeName(plan.name));
    if (!photosFile) return null;
    if (!url) { photoCounts.none++; return null; }
    const checked = checkPhotoUrl(url);
    if (!checked.ok) { photoCounts.invalidUrl++; photoFailures.push(`line ${plan.line}: ${plan.name} (${checked.reason})`); return null; }
    return { url: checked.value, alt: photoAlt(plan.name) };
  };
  const fillCounts = { wouldFill: 0, filled: 0, failed: 0 };
  const failPhoto =(plan, error) => { photoCounts.failed++; photoFailures.push(`line ${plan.line}: ${plan.name} (${error?.code ?? error?.message ?? "error"})`); };

  // sort_order is monotonic and the list shows newest first, so creating bottom-to-top keeps CSV order on screen.
  const counts = { created: 0, skipped: 0, rejected: 0, wouldCreate: 0 };
  const cleared = [];
  for (const plan of [...plans].reverse()) {
    if (plan.status === "reject") { counts.rejected++; console.log(`REJECT line ${plan.line}: ${plan.name || "(tanpa nama)"} (${plan.reason})`); continue; }
    if (plan.status === "skip") {
      // Existing product: only fill a missing image; never touch other fields or an existing image.
      const card = plan.reason === "nama sudah ada" ? cardByName.get(normalizeName(plan.name)) : null;
      const photo = card && !card.image ? photoFor(plan) : null;
      const fill = fillDescriptions ? fillableDescription(card, plan) : null;
      if (photo && !apply) photoCounts.wouldDownload++;
      if (fill && !apply) fillCounts.wouldFill++;
      if (apply && (photo || fill)) {
        try {
          const input = { name: card.name, description: fill ?? card.description, price: card.price, expectedVersion: card.version };
          let attachedPhoto = false;
          if (photo) {
            try { input.imageAssetId = await obtainAsset(photo.url); input.imageAlt = photo.alt; attachedPhoto = true; }
            catch (error) { failPhoto(plan, error); }
          }
          if (attachedPhoto || fill) {
            await api.update(null, card.slug, input);
            if (attachedPhoto) photoCounts.attached++;
            if (fill) fillCounts.filled++;
            console.log(`update line ${plan.line}: ${plan.name} (${[attachedPhoto && "gambar", fill && "deskripsi"].filter(Boolean).join(" + ")} diisi)`);
            continue;
          }
        } catch (error) { fillCounts.failed++; console.log(`UPDATE FAILED line ${plan.line}: ${plan.name} (${error?.code ?? "error"})`); }
      }
      counts.skipped++; console.log(`skip   line ${plan.line}: ${plan.name} (${plan.reason})`); continue;
    }
    if (plan.descriptionCleared) cleared.push(plan);
    const photo = photoFor(plan);
    if (!apply) { counts.wouldCreate++; if (photo) photoCounts.wouldDownload++; continue; }
    const input = toProductInput(plan);
    if (photo) {
      try { input.imageAssetId = await obtainAsset(photo.url); input.imageAlt = photo.alt; photoCounts.attached++; }
      catch (error) { failPhoto(plan, error); }
    }
    try { await api.create(null, input); counts.created++; }
    catch (error) { counts.rejected++; console.log(`REJECT line ${plan.line}: ${plan.name} (${error?.code ?? "error"})`); }
  }
  console.log(`Description cleared (claims) for ${cleared.length} row(s):`);
  for (const plan of cleared.reverse()) console.log(`  line ${plan.line}: ${plan.name} -> ${plan.claims.join(", ")}`);
  console.log(apply
    ? `Result: created ${counts.created}, skipped ${counts.skipped}, rejected ${counts.rejected}`
    : `Result (dry-run, nothing written, no network): would create ${counts.wouldCreate}, skip ${counts.skipped}, reject ${counts.rejected}`);
  if (photosFile) {
    console.log(`Photos: ${JSON.stringify(photoCounts)}`);
    for (const line of photoFailures) console.log(`  photo problem ${line}`);
  }
  if (fillDescriptions) console.log(`Fill descriptions: ${JSON.stringify(fillCounts)}`);
  if (counts.rejected || photoCounts.failed || photoCounts.invalidUrl || fillCounts.failed) process.exitCode = 1;
} catch (error) {
  console.error("Failed:", error?.code ?? error?.message ?? "error");
  process.exitCode = 1;
} finally { if (pool) await pool.end(); }
