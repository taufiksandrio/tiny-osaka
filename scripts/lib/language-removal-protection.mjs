import assert from "node:assert/strict";

// ADR-039 (migration 0016): the single place that names the removed language columns, only to prove
// they are gone. Read-only catalog queries; safe to run inside any verification transaction.
const removedColumns = ["locale", "alt_en", "caption_en"];
const primaryKeys = Object.freeze({
  category_translations: "PRIMARY KEY (revision_id, category_id)",
  product_translations: "PRIMARY KEY (revision_id, product_id)",
  variant_translations: "PRIMARY KEY (revision_id, product_id, variant_id)",
  modifier_group_translations: "PRIMARY KEY (revision_id, product_id, group_id)",
  modifier_option_translations: "PRIMARY KEY (revision_id, product_id, group_id, option_id)",
  page_translations: "PRIMARY KEY (revision_id)",
});

export const verifyLanguageColumnsRemoved = async client => {
  const { rows: columns } = await client.query(`SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema='public' AND column_name = ANY($1::text[])`, [removedColumns]);
  assert.deepEqual(columns, []);
  const { rows: constraints } = await client.query(`SELECT c.conname, pg_get_constraintdef(c.oid) AS def FROM pg_constraint c
    JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public'`);
  assert.deepEqual(constraints.filter(row => /\b(locale|alt_en|caption_en)\b/.test(row.def) || /_locale$/.test(row.conname)), []);
  for (const [table, definition] of Object.entries(primaryKeys)) {
    const { rows } = await client.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid=$1::regclass AND conname=$2 AND contype='p'`, [`public.${table}`, `${table}_pk`]);
    assert.deepEqual(rows.map(row => row.def), [definition]);
  }
  for (const table of ["catalog_media_refs", "page_media_refs"]) {
    const { rows } = await client.query(`SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
      WHERE conrelid=$1::regclass AND conname=$2 AND contype='c'`, [`public.${table}`, `${table}_text`]);
    assert.equal(rows.length, 1);
    assert.ok(rows[0].def.includes("alt_id") && rows[0].def.includes("500") && rows[0].def.includes("caption_id") && rows[0].def.includes("2000"));
  }
  const { rows: functions } = await client.query(`SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args, p.prosrc
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      AND p.proname IN ('public_read_catalog','public_read_page','catalog_purge_product') ORDER BY p.proname`);
  assert.deepEqual(functions.map(row => `${row.proname}(${row.args})`),
    ["catalog_purge_product(p_product_id uuid, p_actor text)", "public_read_catalog()", "public_read_page(p_key text)"]);
  assert.ok(functions.every(row => !/locale|alt_en|caption_en/.test(row.prosrc)));
};

// Read-only pre-check for state 16 (before the columns are dropped): counts only, no row content.
export const countLegacyLanguageRows = async client => {
  const out = {};
  for (const table of Object.keys(primaryKeys)) {
    const { rows: [row] } = await client.query(`SELECT count(*)::integer AS total, count(*) FILTER (WHERE locale <> 'id')::integer AS non_id FROM public.${table}`);
    out[table] = row;
  }
  for (const table of ["catalog_media_refs", "page_media_refs"]) {
    const { rows: [row] } = await client.query(`SELECT count(*)::integer AS total, count(*) FILTER (WHERE alt_en <> '' OR caption_en <> '')::integer AS en_text FROM public.${table}`);
    out[table] = row;
  }
  return out;
};
