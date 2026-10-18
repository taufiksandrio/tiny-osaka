import { verifyCatalogProtection } from "../../scripts/lib/catalog-protection.mjs";

// Test-database only (callers use connectTestOwner, which pins database and role). The deletion log is
// append-only for every role, so committed QA deletions can only be removed by the owner with the guard
// trigger disabled for exactly the rows whose product name starts with "QA ", inside one transaction that
// re-enables and re-verifies the guards before COMMIT.
export const removeQaDeletionLog = async owner => {
  await owner.query("BEGIN");
  try {
    await owner.query("LOCK TABLE public.catalog_deletion_log IN ACCESS EXCLUSIVE MODE");
    await owner.query("ALTER TABLE public.catalog_deletion_log DISABLE TRIGGER USER");
    await owner.query("DELETE FROM public.catalog_deletion_log WHERE product_name LIKE 'QA %'");
    await owner.query("ALTER TABLE public.catalog_deletion_log ENABLE TRIGGER USER");
    await verifyCatalogProtection(owner, "tiny_osaka_test_owner", 17);
    await owner.query("COMMIT");
  } catch (error) { await owner.query("ROLLBACK"); throw error; }
};
