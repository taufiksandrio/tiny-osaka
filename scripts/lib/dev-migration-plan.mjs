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
  Object.freeze({ tag: "0007_auth_foundation", when: 1792135912129,
    hash: "0d7d4b2d676aa6246c1ae43c70f7b51da4c229abda141714ebec017ed67f537c" }),
  Object.freeze({ tag: "0008_cms_pages_access", when: 1792200000000,
    hash: "58d3eccd13fb7a677e55f1bd93ace040beed1b6f46b14c39cee4b8ff171ca573" }),
  Object.freeze({ tag: "0009_cms_catalog_access", when: 1792206000000,
    hash: "c4f74b9e47b7bce5326ffca6c23bd7d32d35404b2c21877513c1c104c3ed1cb6" }),
  Object.freeze({ tag: "0010_cms_media_access", when: 1792212000000,
    hash: "f3190657dac792572dbaa38fab48dcaf0ececeac7a9d8c8e537b4711c40ad956" }),
  Object.freeze({ tag: "0011_media_poster_read", when: 1792212600000,
    hash: "bbe0e9ba1926850c601e99063a1f8d4fe7a4fd3fa76f4db7810c41a367bdd14f" }),
  Object.freeze({ tag: "0012_scheduled_publishing", when: 1792216200000,
    hash: "1f3909c8dcd91ed5a77ea3a3a3481495f96e8d3ae694599e65115fb2ce794072" }),
  Object.freeze({ tag: "0013_publication_identity_restrict", when: 1792216260000,
    hash: "92c63a272f8192c2eebaf221325c0c67cd674eac82c8f5f82a223582096500e9" }),
  Object.freeze({ tag: "0014_catalog_card_crud", when: 1792216320000,
    hash: "da9e2e1a8ec2a1db9adf3237a8337a0d0de8666e833e6d052d491772d3fe375e" }),
  Object.freeze({ tag: "0015_catalog_order_links", when: 1792216380000,
    hash: "64c694563b15638beb782fbdeb0b979884372eef6e4660f5bc3ec2e54c9fa403" }),
  Object.freeze({ tag: "0016_drop_language_columns", when: 1792308540559,
    hash: "c9bd255cc6ce5183f94b99e0f8d881ce2f380e814ad331c96b74df4d158584ad" }),
  Object.freeze({ tag: "0017_public_read_order_links", when: 1792394940000,
    hash: "adf41753af20b1d3db3123d7ce2a1d11b8b16defefc28a06e4c6477c50f7eaa2" }),
]);
export const foundationTables = Object.freeze(["catalog_revisions", "categories", "category_entries", "category_translations",
  "product_entries", "product_translations", "products"].sort());
export const pricingTables = Object.freeze([...foundationTables, "product_variants", "variant_translations",
  "modifier_groups", "modifier_group_translations", "modifier_options", "modifier_option_translations"].sort());
export const workflowTables = Object.freeze([...pricingTables, "catalog_submissions", "catalog_approvals", "catalog_publication", "catalog_workflow_events"].sort());
export const contentTables = Object.freeze([...workflowTables, "pages", "page_revisions", "page_translations", "page_submissions", "page_approvals", "page_publications", "page_workflow_events"].sort());
export const allTables = Object.freeze([...contentTables, "publication_jobs", "publication_events", "media_assets", "media_events", "catalog_media_refs", "page_media_refs"].sort());
// 0014 adds the append-only deletion log. allTables stays the 0000-0013 set so fixtures that lock/clean
// "all tables" keep working before and after 0014; use tablesForState for exact schema checks.
export const deletionTables = Object.freeze(["catalog_deletion_log"]);
// Tables that exist at a given applied-history length (0012/0013 add jobs; 0014 adds the deletion log; 0015 only adds columns, 0016 only drops columns; neither adds a table).
export const tablesForState = length => [...allTables.filter(name => length >= 13 || !["publication_jobs", "publication_events"].includes(name)),
  ...(length >= 15 ? deletionTables : [])].sort();
const metadataNames = ["__drizzle_migrations", "__drizzle_migrations_id_seq", "__drizzle_migrations_pkey"];
const refuse = () => { throw new DevMigrationPlanError("Refusing dev migration: files, history or objects differ from the reviewed 0000-0017 plan."); };

export const validateDevMigrationFiles = (journal, files) => {
  if (journal?.version !== "7" || journal.dialect !== "postgresql" ||
    ![18, 19].includes(journal.entries?.length) || !Array.isArray(files) || files.length !== journal.entries.length) refuse();
  // 0018 (MCP OAuth tables) is test-only until dev is separately approved; this runner never applies it.
  if (journal.entries.length === 19 && journal.entries[18].tag !== "0018_mcp_oauth") refuse();
  for (const [idx, expected] of reviewedMigrations.entries()) {
    const entry = journal.entries[idx];
    const file = files[idx];
    if (!entry || !file || entry.idx !== idx || entry.version !== "7" || entry.tag !== expected.tag ||
      entry.when !== expected.when || entry.breakpoints !== true || file.hash !== expected.hash ||
      file.folderMillis !== expected.when) refuse();
  }
};

// Only reviewed catalog/media states (including the forward intermediate) are allowed.
// Empty/uninitialized DBs need a separately approved bootstrap operation.
export const validateDevMigrationState = ({ history, objects, relations, metadataOwner }) => {
  if (!Array.isArray(history) || ![12, 13, 14, 15, 16, 17, 18].includes(history.length) ||
    !Array.isArray(objects) || !Array.isArray(relations) || metadataOwner !== "tiny_osaka_dev_owner") refuse();
  for (const [idx, row] of history.entries()) {
    if (row.hash !== reviewedMigrations[idx].hash || Number(row.created_at) !== reviewedMigrations[idx].when) refuse();
  }
  const tables = tablesForState(history.length);
  if (JSON.stringify(objects.map(row => row.name)) !== JSON.stringify(tables) ||
    objects.some(row => row.owner !== "tiny_osaka_dev_owner" || row.kind !== "r") ||
    JSON.stringify(relations.map(row => row.name)) !== JSON.stringify(metadataNames) ||
    relations.some((row, idx) => row.owner !== "tiny_osaka_dev_owner" || row.kind !== ["r", "S", "i"][idx])) refuse();
  return history.length;
};
