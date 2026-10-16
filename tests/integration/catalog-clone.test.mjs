import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import pg from "pg";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { connectTestOwner } from "../../scripts/lib/test-db.mjs";
import { pricingTables } from "../../scripts/lib/test-migration-plan.mjs";
import { getDatabaseConfig } from "../../src/server/db/config.mjs";
import { cloneCatalogDraft, createCatalogDraft, updateVariantPrice, CatalogDraftError } from "../../src/server/catalog/drafts.mjs";

const childTables = ["category_entries", "category_translations", "product_entries", "product_translations",
  "product_variants", "variant_translations", "modifier_groups", "modifier_group_translations", "modifier_options", "modifier_option_translations"];
const errorCode = code => error => error instanceof CatalogDraftError && error.code === code;
const sourceInput = ids => ({ sourceRevisionId: ids.source, expectedSourceVersion: 7 });

const snapshot = async (client, revision) => {
  const result = {};
  for (const table of childTables) {
    const { rows } = await client.query(`SELECT * FROM public.${table} WHERE revision_id=$1`, [revision]);
    result[table] = rows.map(({ revision_id: _revision, ...row }) => JSON.stringify(row)).sort();
  }
  return result;
};
const root = async (client, revision) => (await client.query("SELECT * FROM catalog_revisions WHERE id=$1", [revision])).rows[0];
const waitBlocked = async (client, pid) => {
  for (let attempt = 0; attempt < 80; attempt++) {
    const { rows: [row] } = await client.query("SELECT cardinality(pg_blocking_pids($1::integer)) > 0 AS blocked", [pid]);
    if (row.blocked) return;
    await delay(25);
  }
  assert.fail("Independent writer/clone must be blocked by the source revision lock.");
};

// Only generated test fixture IDs are ever cleaned. Track new roots before the
// outer transaction commits, including nested clone calls and ambiguous errors.
const withFixture = async (run, seed = true) => {
  const client = await connectTestOwner();
  const db = drizzle(client);
  const revisions = [];
  const ids = Object.fromEntries(["category", "product", "variant", "large", "group", "option", "freeOption"].map(key => [key, randomUUID()]));
  const trackedClone = async (context = db, input = sourceInput(ids)) => context.transaction(async tx => {
    const draft = await cloneCatalogDraft(tx, input);
    revisions.push(draft.id);
    return draft;
  });
  try {
    await db.transaction(async tx => {
      for (const key of ["source", "unrelated"]) {
        const draft = await createCatalogDraft(tx);
        ids[key] = draft.id;
        revisions.push(draft.id);
      }
    });
    await client.query("BEGIN");
    await client.query("UPDATE catalog_revisions SET version=7 WHERE id=$1", [ids.source]);
    if (seed) {
      await client.query("INSERT INTO categories(id,slug) VALUES ($1,$2)", [ids.category, `qa-clone-${ids.category}`]);
      await client.query("INSERT INTO products(id,slug) VALUES ($1,$2)", [ids.product, `qa-clone-${ids.product}`]);
      for (const revision of [ids.source, ids.unrelated]) {
        await client.query("INSERT INTO category_entries(revision_id,category_id,sort_order) VALUES ($1,$2,3)", [revision, ids.category]);
        await client.query("INSERT INTO product_entries(revision_id,product_id,category_id,sort_order) VALUES ($1,$2,$3,4)", [revision, ids.product, ids.category]);
        await client.query("INSERT INTO product_variants(revision_id,product_id,id,code,base_price,sort_order) VALUES ($1,$2,$3,'standard',$4,5)",
          [revision, ids.product, ids.variant, revision === ids.source ? 250000 : 987654]);
      }
      await client.query("INSERT INTO product_variants(revision_id,product_id,id,code,base_price,sort_order) VALUES ($1,$2,$3,'large',9007199254740991,6)", [ids.source, ids.product, ids.large]);
      await client.query("INSERT INTO modifier_groups(revision_id,product_id,id,code,selection_type,min_selections,max_selections,sort_order) VALUES ($1,$2,$3,'toppings','multiple',1,2,7)", [ids.source, ids.product, ids.group]);
      for (const [option, code, price, sort] of [[ids.option, "paid", 150000, 8], [ids.freeOption, "free", 0, 9]]) {
        await client.query("INSERT INTO modifier_options(revision_id,product_id,group_id,id,code,price_delta,sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7)",
          [ids.source, ids.product, ids.group, option, code, price, sort]);
      }
      for (const locale of ["id", "en"]) {
        await client.query("INSERT INTO category_translations(revision_id,category_id,locale,title,description) VALUES ($1,$2,$3,$4,$5)", [ids.source, ids.category, locale, `QA category ${locale}`, `QA category description ${locale}`]);
        await client.query("INSERT INTO product_translations(revision_id,product_id,locale,title,description) VALUES ($1,$2,$3,$4,$5)", [ids.source, ids.product, locale, `QA product ${locale}`, `QA product description ${locale}`]);
        for (const variant of [ids.variant, ids.large]) {
          await client.query("INSERT INTO variant_translations(revision_id,product_id,variant_id,locale,title,description) VALUES ($1,$2,$3,$4,$5,$6)", [ids.source, ids.product, variant, locale, `QA variant ${locale}`, `QA variant description ${locale}`]);
        }
        await client.query("INSERT INTO modifier_group_translations(revision_id,product_id,group_id,locale,title,description) VALUES ($1,$2,$3,$4,$5,$6)", [ids.source, ids.product, ids.group, locale, `QA group ${locale}`, `QA group description ${locale}`]);
        for (const option of [ids.option, ids.freeOption]) {
          await client.query("INSERT INTO modifier_option_translations(revision_id,product_id,group_id,option_id,locale,title,description) VALUES ($1,$2,$3,$4,$5,$6,$7)", [ids.source, ids.product, ids.group, option, locale, `QA option ${locale}`, `QA option description ${locale}`]);
        }
      }
    }
    await client.query("COMMIT");
    await run({ client, db, ids, revisions, trackedClone });
  } finally {
    try {
      await client.query("ROLLBACK");
      await client.query("BEGIN");
      for (const table of [...childTables].reverse()) {
        await client.query(`DELETE FROM public.${table} WHERE revision_id=ANY($1::uuid[])`, [revisions]);
      }
      await client.query("DELETE FROM catalog_revisions WHERE id=ANY($1::uuid[])", [revisions]);
      await client.query("DELETE FROM products WHERE id=$1 AND slug=$2", [ids.product, `qa-clone-${ids.product}`]);
      await client.query("DELETE FROM categories WHERE id=$1 AND slug=$2", [ids.category, `qa-clone-${ids.category}`]);
      await client.query("COMMIT");
      for (const table of ["catalog_revisions", ...childTables]) {
        const key = table === "catalog_revisions" ? "id" : "revision_id";
        const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM public.${table} WHERE ${key}=ANY($1::uuid[])`, [revisions]);
        assert.equal(row.count, 0, "Clone fixture revisions/children must be removed.");
      }
      const { rows: [row] } = await client.query("SELECT (SELECT count(*) FROM products WHERE id=$1) + (SELECT count(*) FROM categories WHERE id=$2) AS count", [ids.product, ids.category]);
      assert.equal(Number(row.count), 0);
    } catch {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`Synthetic clone cleanup failed; inspect ONLY fixture IDs: ${JSON.stringify({ ...ids, revisions })}`);
    } finally { await client.end(); }
  }
};

test("copies all ten child tables exactly, retaining identities and resetting only the new root", () => withFixture(async ({ client, ids, trackedClone }) => {
  const before = await snapshot(client, ids.source);
  const sourceRoot = await root(client, ids.source);
  const unrelatedBefore = await snapshot(client, ids.unrelated);
  assert.ok(Object.values(before).every(rows => rows.length > 0));
  const draft = await trackedClone();
  assert.notEqual(draft.id, ids.source);
  assert.equal(draft.status, "draft");
  assert.equal(draft.version, 1);
  assert.ok(draft.createdAt instanceof Date);
  assert.deepEqual(await snapshot(client, draft.id), before);
  assert.deepEqual(await snapshot(client, ids.source), before);
  assert.deepEqual(await root(client, ids.source), sourceRoot);
  assert.deepEqual(await snapshot(client, ids.unrelated), unrelatedBefore);
  for (const [table, id] of [["products", ids.product], ["categories", ids.category]]) {
    const { rows } = await client.query(`SELECT id,slug FROM ${table}`);
    assert.deepEqual(rows, [{ id, slug: `qa-clone-${id}` }]);
  }
}));

test("editing the clone or source does not change the other revision's child rows", () => withFixture(async ({ client, db, ids, trackedClone }) => {
  const sourceBefore = await snapshot(client, ids.source);
  const clone = await trackedClone();
  await updateVariantPrice(db, { revisionId: clone.id, productId: ids.product, variantId: ids.variant, expectedVersion: 1, basePrice: 400000 });
  assert.deepEqual(await snapshot(client, ids.source), sourceBefore);
  const cloneBefore = await snapshot(client, clone.id);
  await updateVariantPrice(db, { revisionId: ids.source, productId: ids.product, variantId: ids.variant, expectedVersion: 7, basePrice: 600000 });
  assert.deepEqual(await snapshot(client, clone.id), cloneBefore);
  assert.equal((await root(client, clone.id)).version, 2);
  assert.equal((await root(client, ids.source)).version, 8);
}));

test("empty drafts copy as empty drafts without invented products", () => withFixture(async ({ client, trackedClone }) => {
  const draft = await trackedClone();
  assert.equal(draft.version, 1);
  assert.ok(Object.values(await snapshot(client, draft.id)).every(rows => rows.length === 0));
}, false));

test("incomplete localized drafts retain exactly the missing fields", () => withFixture(async ({ client, ids, trackedClone }) => {
  await client.query("DELETE FROM variant_translations WHERE revision_id=$1 AND locale='en'", [ids.source]);
  const before = await snapshot(client, ids.source);
  const draft = await trackedClone();
  assert.deepEqual(await snapshot(client, draft.id), before);
  assert.equal(before.variant_translations.length, 2);
}));

test("an exhausted source version can be copied into a fresh version-one draft", () => withFixture(async ({ client, ids, trackedClone }) => {
  await client.query("UPDATE catalog_revisions SET version=2147483647 WHERE id=$1", [ids.source]);
  const draft = await trackedClone(undefined, { sourceRevisionId: ids.source, expectedSourceVersion: 2147483647 });
  assert.equal(draft.version, 1);
  assert.equal((await root(client, ids.source)).version, 2147483647);
  assert.deepEqual(await snapshot(client, draft.id), await snapshot(client, ids.source));
}));

test("missing and stale source revisions are refused before creating a new root", () => withFixture(async ({ client, ids, trackedClone }) => {
  const before = (await client.query("SELECT id FROM catalog_revisions ORDER BY id")).rows;
  for (const input of [{ sourceRevisionId: randomUUID(), expectedSourceVersion: 7 },
    { sourceRevisionId: ids.source, expectedSourceVersion: 6 }]) {
    await assert.rejects(trackedClone(undefined, input), errorCode("REVISION_CONFLICT"));
  }
  assert.deepEqual((await client.query("SELECT id FROM catalog_revisions ORDER BY id")).rows, before);
}));

test("a real SQL error halfway through copying rolls back root and already copied children", () => withFixture(async ({ client, db, ids, trackedClone }) => {
  const before = await snapshot(client, ids.source);
  const roots = (await client.query("SELECT id FROM catalog_revisions ORDER BY id")).rows;
  await db.transaction(async outer => {
    const faultyDb = { transaction: run => outer.transaction(inner => {
      let copies = 0;
      const proxy = new Proxy(inner, { get: (target, key) => {
        if (key === "execute") return async statement => {
          if (++copies === 6) await target.execute(sql`SELECT 1 / 0`);
          return target.execute(statement);
        };
        const value = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      } });
      return run(proxy);
    }) };
    await assert.rejects(cloneCatalogDraft(faultyDb, sourceInput(ids)), errorCode("PERSISTENCE_FAILED"));
    // The enclosing transaction is still usable after clone's savepoint rollback.
    assert.deepEqual((await client.query("SELECT id FROM catalog_revisions ORDER BY id")).rows, roots);
    for (const table of childTables) {
      const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM ${table} WHERE revision_id<>ALL($1::uuid[])`, [[ids.source, ids.unrelated]]);
      assert.equal(row.count, 0, "No partially copied rows may survive the clone failure.");
    }
    const draft = await trackedClone(outer);
    assert.equal(draft.version, 1);
  });
  assert.deepEqual(await snapshot(client, ids.source), before);
}));

test("copy waits for an editor and rejects the stale source version after that edit commits", () => withFixture(async ({ client, db, ids, trackedClone }) => {
  const worker = await connectTestOwner();
  let pending;
  try {
    const { rows: [identity] } = await worker.query("SELECT pg_backend_pid() AS pid");
    await db.transaction(async tx => {
      await updateVariantPrice(tx, { revisionId: ids.source, productId: ids.product, variantId: ids.variant, expectedVersion: 7, basePrice: 400000 });
      pending = trackedClone(drizzle(worker)).then(value => ({ value }), error => ({ error }));
      await waitBlocked(client, identity.pid);
    });
    const outcome = await pending;
    assert.ok(errorCode("REVISION_CONFLICT")(outcome.error));
    assert.equal((await root(client, ids.source)).version, 8);
  } finally {
    if (pending) await pending;
    await worker.end();
  }
}));

test("copy's shared source lock blocks editing until its complete snapshot commits", () => withFixture(async ({ client, db, ids, revisions }) => {
  const worker = await connectTestOwner();
  let pending;
  let draft;
  const before = await snapshot(client, ids.source);
  try {
    const { rows: [identity] } = await worker.query("SELECT pg_backend_pid() AS pid");
    await db.transaction(async tx => {
      draft = await cloneCatalogDraft(tx, sourceInput(ids));
      revisions.push(draft.id);
      pending = updateVariantPrice(drizzle(worker), { revisionId: ids.source, productId: ids.product, variantId: ids.variant, expectedVersion: 7, basePrice: 400000 })
        .then(value => ({ value }), error => ({ error }));
      await waitBlocked(client, identity.pid);
    });
    const outcome = await pending;
    assert.equal(outcome.value?.version, 8);
    assert.deepEqual(await snapshot(client, draft.id), before);
    assert.notDeepEqual(await snapshot(client, ids.source), before);
  } finally {
    if (pending) await pending;
    await worker.end();
  }
}));

test("unchanged application role cannot read/clone a draft", () => withFixture(async ({ ids }) => {
  const config = getDatabaseConfig(process.env, "test");
  assert.equal(new URL(config.connectionString).username, "tiny_osaka_test_app");
  const client = new pg.Client(config);
  try {
    try { await client.connect(); } catch { throw new Error("Test app connection failed; inspect credentials locally."); }
    await assert.rejects(cloneCatalogDraft(drizzle(client), sourceInput(ids)), errorCode("PERSISTENCE_FAILED"));
  } finally { await client.end(); }
}));

test("all thirteen tables are empty after source/clone fixture cleanup", async () => {
  const client = await connectTestOwner();
  try {
    await client.query("BEGIN READ ONLY");
    for (const table of pricingTables) {
      const { rows: [row] } = await client.query(`SELECT count(*)::integer AS count FROM public.${table}`);
      assert.equal(row.count, 0);
    }
    await client.query("ROLLBACK");
  } finally { await client.end(); }
});
