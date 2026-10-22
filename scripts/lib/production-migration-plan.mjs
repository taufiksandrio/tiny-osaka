import { tablesForState } from "./dev-migration-plan.mjs";

export class RemoteMigrationPlanError extends Error {}

export const remoteTargetNames = Object.freeze(["staging", "production"]);
export const ownerOf = target => `tiny_osaka_${target}_owner`;
// Operator must type this exact value (target + last migration number) to apply.
export const confirmationFor = target => `${target}-0019`;
export const CONFIRM_ENV = "TINY_OSAKA_CONFIRM_PRODUCTION_MIGRATION";

// Pinned hashes of drizzle-remote/*.sql (Option P: dev/test files plus staging/production owner branches).
// Files without owner dispatch are byte-identical to drizzle/ and keep the reviewed dev hashes.
export const remoteMigrations = Object.freeze([
  ["0000_catalog_foundation", 1792083736942, "6bae882b3912c8ba1607d38a755f555749e8fd97e2f4685a8da8388d902ee081"],
  ["0001_catalog_pricing", 1792118484382, "ae73813aaa600199bb8730d8080e4a5a4a9ed957d6b144d61b3befbb8ea00749"],
  ["0002_catalog_publication", 1792125749731, "1339b13fc2746b1f2a0270f19742146ca64bf379b34b330fd08cefd319f653e6"],
  ["0003_catalog_receipt_check", 1792126336589, "eab38d47fa0bbdae7ba3665065b7e6f274aaee035832ea3a498e89ac392ac255"],
  ["0004_page_content", 1792128507544, "90ab3e1612cf1db7b39e589f0b6100565ef35209316164cdfdad93b764a33deb"],
  ["0005_media_references", 1792131022250, "db7e113275b5ae5ccb6264f7cbfe4e63aca6d8b785b9b01afc9f0b923f7188e0"],
  ["0006_public_read_path", 1792132965724, "373d8f7a655df07814b9aa1ca582d32f6834d8b8a108b02563570b4366b2cb53"],
  ["0007_auth_foundation", 1792135912129, "c9a981b729e1cdd3ffeea576f8794f088a3b1a2f6750917005b50bed12407797"],
  ["0008_cms_pages_access", 1792200000000, "f6903fc34d5304419906f84394135f4dfae95f3c307cc4c227c15960c92fb0b4"],
  ["0009_cms_catalog_access", 1792206000000, "3da23a1984bb5bfa32c5776fbf3cdca928c87439cfe1ab700a1960b47e4d6a4d"],
  ["0010_cms_media_access", 1792212000000, "dd45f0933dcbc21c72fca6e65228562b18c112eeadec1cc54804c7d702d3199b"],
  ["0011_media_poster_read", 1792212600000, "bbe0e9ba1926850c601e99063a1f8d4fe7a4fd3fa76f4db7810c41a367bdd14f"],
  ["0012_scheduled_publishing", 1792216200000, "1484edd973b272f2aafedf8438b2078fa6d51d1ebc367c7fc4c07172120b3f05"],
  ["0013_publication_identity_restrict", 1792216260000, "92c63a272f8192c2eebaf221325c0c67cd674eac82c8f5f82a223582096500e9"],
  ["0014_catalog_card_crud", 1792216320000, "5328cadde1d461cc565242cdef18910a49934758ef2646a528129e2081cd0749"],
  ["0015_catalog_order_links", 1792216380000, "64c694563b15638beb782fbdeb0b979884372eef6e4660f5bc3ec2e54c9fa403"],
  ["0016_drop_language_columns", 1792308540559, "0706689a7a60841ccd51c2bec550755bacd35bd0c22463d76ba9c48f81eb1255"],
  ["0017_public_read_order_links", 1792394940000, "adf41753af20b1d3db3123d7ce2a1d11b8b16defefc28a06e4c6477c50f7eaa2"],
  ["0018_mcp_oauth", 1792570138788, "bfe28b583eed085f25fccfe7f8577f596367b3a9ba37a8dd12124f7ff219ca0f"],
  ["0019_mcp_uploads", 1792575079972, "a7f5c4e58dcf4b44dbdd2150f19b0bcab0f03c9e5043a055e3f67fc7b4723075"],
].map(([tag, when, hash]) => Object.freeze({ tag, when, hash })));

const metadataNames = ["__drizzle_migrations", "__drizzle_migrations_id_seq", "__drizzle_migrations_pkey"];
const refuse = () => { throw new RemoteMigrationPlanError("Refusing migration: files, history or objects differ from the reviewed 0000-0019 remote plan."); };

export const validateRemoteMigrationFiles = (journal, files) => {
  if (journal?.version !== "7" || journal.dialect !== "postgresql" ||
    journal.entries?.length !== 20 || !Array.isArray(files) || files.length !== 20) refuse();
  for (const [idx, expected] of remoteMigrations.entries()) {
    const entry = journal.entries[idx], file = files[idx];
    if (!entry || !file || entry.idx !== idx || entry.version !== "7" || entry.tag !== expected.tag ||
      entry.when !== expected.when || entry.breakpoints !== true || file.hash !== expected.hash ||
      file.folderMillis !== expected.when) refuse();
  }
};

// Returns 0 for a completely empty database (apply 0000-0019), 18 for a database at the previously reviewed
// 0000-0017 (apply 0018-0019 on top) or 20 for the fully applied reviewed plan. 0018 and 0019 only touch the
// cms_auth schema, so the public table set is identical for 18 and 20.
// Anything else (including 19) or any unexpected object is refused: this runner never repairs, resets or deletes.
export const validateRemoteMigrationState = ({ target, history, objects, relations, schemas, metadataOwner }) => {
  const owner = ownerOf(target);
  if (!Array.isArray(objects) || !Array.isArray(relations) || !Array.isArray(schemas)) refuse();
  if (history === null) {
    // Empty database: no application objects and none of the schemas the migrations create.
    if (objects.length || relations.length || schemas.length) refuse();
    return 0;
  }
  if (!Array.isArray(history) || ![18, 20].includes(history.length) || metadataOwner !== owner) refuse();
  for (const [idx, row] of history.entries()) {
    if (row.hash !== remoteMigrations[idx].hash || Number(row.created_at) !== remoteMigrations[idx].when) refuse();
  }
  if (JSON.stringify(objects.map(row => row.name)) !== JSON.stringify(tablesForState(history.length)) ||
    objects.some(row => row.owner !== owner || row.kind !== "r") ||
    JSON.stringify(relations.map(row => row.name)) !== JSON.stringify(metadataNames) ||
    relations.some((row, idx) => row.owner !== owner || row.kind !== ["r", "S", "i"][idx])) refuse();
  return history.length;
};
