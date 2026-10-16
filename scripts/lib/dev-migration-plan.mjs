export class DevMigrationPlanError extends Error {}

export const reviewedMigrations = Object.freeze([
  Object.freeze({ tag: "0000_catalog_foundation", when: 1792083736942,
    hash: "6bae882b3912c8ba1607d38a755f555749e8fd97e2f4685a8da8388d902ee081" }),
  Object.freeze({ tag: "0001_catalog_pricing", when: 1792118484382,
    hash: "ae73813aaa600199bb8730d8080e4a5a4a9ed957d6b144d61b3befbb8ea00749" }),
  Object.freeze({ tag: "0002_catalog_publication", when: 1792125749731,
    hash: "1339b13fc2746b1f2a0270f19742146ca64bf379b34b330fd08cefd319f653e6" }),
  Object.freeze({ tag: "0003_catalog_receipt_check", when: 1792126336589,
    hash: "eab38d47fa0bbdae7ba3665065b7e6f274aaee035832ea3a498e89ac392ac255" }),
  Object.freeze({ tag: "0004_page_content", when: 1792128507544,
    hash: "90ab3e1612cf1db7b39e589f0b6100565ef35209316164cdfdad93b764a33deb" }),
  Object.freeze({ tag: "0005_media_references", when: 1792131022250,
    hash: "db7e113275b5ae5ccb6264f7cbfe4e63aca6d8b785b9b01afc9f0b923f7188e0" }),
  Object.freeze({ tag: "0006_public_read_path", when: 1792132965724,
    hash: "10eccdef5b917b81648ad84324e542f1bef224c9fc7ba52403844ea70d858f12" }),
]);
export const foundationTables = Object.freeze(["catalog_revisions", "categories", "category_entries", "category_translations",
  "product_entries", "product_translations", "products"].sort());
export const pricingTables = Object.freeze([...foundationTables, "product_variants", "variant_translations",
  "modifier_groups", "modifier_group_translations", "modifier_options", "modifier_option_translations"].sort());
export const workflowTables = Object.freeze([...pricingTables, "catalog_submissions", "catalog_approvals", "catalog_publication", "catalog_workflow_events"].sort());
export const contentTables = Object.freeze([...workflowTables, "pages", "page_revisions", "page_translations", "page_submissions", "page_approvals", "page_publications", "page_workflow_events"].sort());
export const allTables = Object.freeze([...contentTables, "media_assets", "media_events", "catalog_media_refs", "page_media_refs"].sort());
const metadataNames = ["__drizzle_migrations", "__drizzle_migrations_id_seq", "__drizzle_migrations_pkey"];
const refuse = () => { throw new DevMigrationPlanError("Refusing dev migration: files, history or objects differ from the reviewed 0000-0006 plan."); };

export const validateDevMigrationFiles = (journal, files) => {
  if (journal?.version !== "7" || journal.dialect !== "postgresql" ||
    journal.entries?.length !== 7 || !Array.isArray(files) || files.length !== 7) refuse();
  for (const [idx, expected] of reviewedMigrations.entries()) {
    const entry = journal.entries[idx];
    const file = files[idx];
    if (!entry || !file || entry.idx !== idx || entry.version !== "7" || entry.tag !== expected.tag ||
      entry.when !== expected.when || entry.breakpoints !== true || file.hash !== expected.hash ||
      file.folderMillis !== expected.when) refuse();
  }
};

// Only the existing reviewed page content or fully applied media state is allowed.
// Empty/uninitialized DBs need a separately approved bootstrap operation.
export const validateDevMigrationState = ({ history, objects, relations, metadataOwner }) => {
  if (!Array.isArray(history) || ![6, 7].includes(history.length) ||
    !Array.isArray(objects) || !Array.isArray(relations) || metadataOwner !== "tiny_osaka_dev_owner") refuse();
  for (const [idx, row] of history.entries()) {
    if (row.hash !== reviewedMigrations[idx].hash || Number(row.created_at) !== reviewedMigrations[idx].when) refuse();
  }
  const tables = allTables;
  if (JSON.stringify(objects.map(row => row.name)) !== JSON.stringify(tables) ||
    objects.some(row => row.owner !== "tiny_osaka_dev_owner" || row.kind !== "r") ||
    JSON.stringify(relations.map(row => row.name)) !== JSON.stringify(metadataNames) ||
    relations.some((row, idx) => row.owner !== "tiny_osaka_dev_owner" || row.kind !== ["r", "S", "i"][idx])) refuse();
  return history.length;
};
