import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createCatalogDraft, updateVariantPrice, cloneCatalogDraft, saveCategoryTranslation,
  saveProductTranslation, createProductVariant, updateProductVariant, saveVariantTranslation,
  createModifierGroup, updateModifierGroup, createModifierOption, updateModifierOption,
  saveModifierGroupTranslation, saveModifierOptionTranslation,
  createCatalogCategory, createCatalogProduct, updateCategoryPlacement, updateProductPlacement,
  CatalogDraftError } from "../../src/server/catalog/drafts.mjs";

const input = () => ({ revisionId: randomUUID(), productId: randomUUID(), variantId: randomUUID(), expectedVersion: 1, basePrice: 250000 });
const modifierInput = () => ({ ...input(), groupId: randomUUID(), optionId: randomUUID(), code: "qa-code", selectionType: "multiple",
  minSelections: 0, maxSelections: 2, sortOrder: 0, priceDelta: 150000, locale: "id", title: "QA modifier", description: "" });
const rejectInvalid = async value => {
  let dbAccessed = false;
  const db = new Proxy({}, { get: () => { dbAccessed = true; throw new Error("DB must not be accessed for invalid input"); } });
  await assert.rejects(updateVariantPrice(db, value), error => error instanceof CatalogDraftError && error.code === "INVALID_INPUT");
  assert.equal(dbAccessed, false);
};

test("rejects missing, malformed or non-string scope IDs before DB access", async () => {
  for (const value of [null, undefined, {}]) await rejectInvalid(value);
  for (const key of ["revisionId", "productId", "variantId"]) {
    for (const value of [null, "", "foreign-id", 1, "00000000-0000-0000-0000-000000000000 "]) {
      await rejectInvalid({ ...input(), [key]: value });
    }
  }
});

test("rejects invalid or exhausted revision versions before DB access", async () => {
  for (const expectedVersion of [0, -1, 0.5, "1", NaN, Infinity, 2147483647, 2147483648, null]) {
    await rejectInvalid({ ...input(), expectedVersion });
  }
});

test("rejects fractional, negative, unsafe or non-numeric prices before DB access", async () => {
  for (const basePrice of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "250000", 250000n, null, undefined]) {
    await rejectInvalid({ ...input(), basePrice });
  }
});

test("unexpected driver errors are replaced without raw details or cause", async () => {
  const db = {
    insert: () => { throw new Error("private-connection-details"); },
    transaction: async () => { throw new Error("private-connection-details"); },
  };
  for (const run of [() => createCatalogDraft(db), () => updateVariantPrice(db, input()),
    () => cloneCatalogDraft(db, { sourceRevisionId: randomUUID(), expectedSourceVersion: 1 }),
    () => saveCategoryTranslation(db, { revisionId: randomUUID(), categoryId: randomUUID(), expectedVersion: 1, locale: "id", title: "QA", description: "" }),
    () => saveProductTranslation(db, { revisionId: randomUUID(), productId: randomUUID(), expectedVersion: 1, locale: "en", title: "QA", description: "" }),
    () => createProductVariant(db, { ...input(), code: "standard", sortOrder: 0 }),
    () => updateProductVariant(db, { ...input(), code: "standard", sortOrder: 0 }),
    () => saveVariantTranslation(db, { ...input(), locale: "id", title: "QA", description: "" }),
    ...[createModifierGroup, updateModifierGroup, createModifierOption, updateModifierOption,
      saveModifierGroupTranslation, saveModifierOptionTranslation].map(save => () => save(db, modifierInput())),
    ...[createCatalogCategory, createCatalogProduct, updateCategoryPlacement, updateProductPlacement]
      .map(save => () => save(db, { ...input(), categoryId: randomUUID(), slug: "qa-slug", sortOrder: 0 }))]) {
    await assert.rejects(run(), error => {
      assert.ok(error instanceof CatalogDraftError);
      assert.equal(error.code, "PERSISTENCE_FAILED");
      assert.equal(error.message, "Draft persistence failed.");
      assert.equal(error.cause, undefined);
      return true;
    });
  }
});

test("category/product creation and placement reject invalid input before DB access", async () => {
  let dbAccessed = false;
  const db = new Proxy({}, { get: () => { dbAccessed = true; throw new Error("Unexpected DB access"); } });
  for (const save of [createCatalogCategory, createCatalogProduct, updateCategoryPlacement, updateProductPlacement]) {
    const valid = { ...input(), categoryId: randomUUID(), slug: "qa-slug", sortOrder: 0 };
    const fields = [{ revisionId: null }, { expectedVersion: 0 }, { expectedVersion: 2147483647 },
      { sortOrder: -1 }, { sortOrder: 0.5 }, { sortOrder: 2147483648 }];
    if ([createCatalogCategory, createCatalogProduct].includes(save)) fields.push({ slug: "Bad Slug" }, { slug: "a--b" }, { slug: null });
    if (save !== createCatalogCategory) fields.push({ categoryId: "bad" });
    if (save === updateProductPlacement) fields.push({ productId: null });
    for (const value of [null, {}, ...fields.map(change => ({ ...valid, ...change }))]) {
      await assert.rejects(save(db, value), error => error instanceof CatalogDraftError && error.code === "INVALID_INPUT");
    }
  }
  assert.equal(dbAccessed, false);
});

const invalidModifierInputs = async (save, fields) => {
  let dbAccessed = false;
  const db = new Proxy({}, { get: () => { dbAccessed = true; throw new Error("Unexpected DB access"); } });
  for (const value of [null, {}, ...[{ revisionId: "bad" }, { productId: null }, { expectedVersion: 0 },
    { expectedVersion: 2147483647 }, ...fields].map(change => ({ ...modifierInput(), ...change }))]) {
    await assert.rejects(save(db, value), error => error instanceof CatalogDraftError && error.code === "INVALID_INPUT");
  }
  assert.equal(dbAccessed, false);
};

test("modifier group input rejects invalid code, type, min/max, sort and update scope before DB access", async () => {
  for (const save of [createModifierGroup, updateModifierGroup]) {
    const fields = [{ code: "Bad Code" }, { selectionType: "other" }, { minSelections: -1 },
      { minSelections: 3, maxSelections: 2 }, { maxSelections: 0.5 }, { maxSelections: 2147483648 },
      { selectionType: "single", maxSelections: 2 }, { sortOrder: -1 }, { sortOrder: "0" }];
    if (save === updateModifierGroup) fields.push({ groupId: null });
    await invalidModifierInputs(save, fields);
  }
});

test("modifier option input rejects group/scope, invalid code/delta/sort before DB access", async () => {
  for (const save of [createModifierOption, updateModifierOption]) {
    const fields = [{ groupId: "bad" }, { code: "bad--code" },
      ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "100"].map(priceDelta => ({ priceDelta })),
      { sortOrder: 2147483648 }, { sortOrder: null }];
    if (save === updateModifierOption) fields.push({ optionId: null });
    await invalidModifierInputs(save, fields);
  }
});

test("modifier translation validates full scope, exact locale and plain text before DB access", async () => {
  for (const save of [saveModifierGroupTranslation, saveModifierOptionTranslation]) {
    const fields = [{ groupId: null }, { locale: "jp" }, { title: " \t\n\u00a0" },
      { title: "QA\0" }, { description: null }, { description: "QA\0" }];
    if (save === saveModifierOptionTranslation) fields.push({ optionId: "bad" });
    await invalidModifierInputs(save, fields);
  }
});

test("variant create/update reject invalid scope, version, code, price and sort order before DB access", async () => {
  let dbAccessed = false;
  const db = new Proxy({}, { get: () => { dbAccessed = true; throw new Error("Unexpected DB access"); } });
  for (const save of [createProductVariant, updateProductVariant]) {
    const valid = { ...input(), code: "standard", sortOrder: 0 };
    const fields = [{ revisionId: "bad" }, { productId: null }, { expectedVersion: 2147483647 },
      ...["", "Bad", "bad code", "a--b", null].map(code => ({ code })),
      ...[-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, "1"].map(basePrice => ({ basePrice })),
      ...[-1, 0.5, 2147483648, undefined, "1"].map(sortOrder => ({ sortOrder })),
    ];
    if (save === updateProductVariant) fields.push({ variantId: null });
    for (const value of [null, {}, ...fields.map(field => ({ ...valid, ...field }))]) {
      await assert.rejects(save(db, value), error => error instanceof CatalogDraftError && error.code === "INVALID_INPUT");
    }
  }
  assert.equal(dbAccessed, false);
});

test("variant translation validates complete composite scope and text before DB access", async () => {
  let dbAccessed = false;
  const db = new Proxy({}, { get: () => { dbAccessed = true; throw new Error("Unexpected DB access"); } });
  const valid = { ...input(), locale: "id", title: "QA variant", description: "" };
  for (const value of [null, {}, ...[{ revisionId: "bad" }, { productId: null }, { variantId: null },
    { expectedVersion: 0 }, { locale: "jp" }, { title: " \t\n\u00a0" }, { title: "QA\0" },
    { description: null }, { description: "QA\0" }].map(fields => ({ ...valid, ...fields }))]) {
    await assert.rejects(saveVariantTranslation(db, value), error => error instanceof CatalogDraftError && error.code === "INVALID_INPUT");
  }
  assert.equal(dbAccessed, false);
});

test("translation writers reject invalid locale, title, description, scope and version before DB access", async () => {
  let dbAccessed = false;
  const db = new Proxy({}, { get: () => { dbAccessed = true; throw new Error("Unexpected DB access"); } });
  for (const [save, key] of [[saveCategoryTranslation, "categoryId"], [saveProductTranslation, "productId"]]) {
    const valid = { revisionId: randomUUID(), [key]: randomUUID(), expectedVersion: 1, locale: "id", title: "QA title", description: "" };
    for (const value of [null, {},
      ...[undefined, null, "bad", 1].map(id => ({ ...valid, [key]: id })),
      ...["bad", null].map(revisionId => ({ ...valid, revisionId })),
      ...[0, -1, 0.5, "1", 2147483647, null].map(expectedVersion => ({ ...valid, expectedVersion })),
      ...["jp", "ID", null, undefined].map(locale => ({ ...valid, locale })),
      ...["", " \t\n\u00a0", null, 1, "QA\0title"].map(title => ({ ...valid, title })),
      ...[undefined, null, 1, "QA\0description"].map(description => ({ ...valid, description })),
    ]) {
      await assert.rejects(save(db, value), error => error instanceof CatalogDraftError && error.code === "INVALID_INPUT");
    }
  }
  assert.equal(dbAccessed, false);
});

test("rejects invalid clone scope/version before DB access", async () => {
  let dbAccessed = false;
  const db = new Proxy({}, { get: () => { dbAccessed = true; throw new Error("Unexpected DB access"); } });
  for (const value of [null, {}, { sourceRevisionId: "bad", expectedSourceVersion: 1 },
    ...[0, -1, 0.5, "1", NaN, Infinity, 2147483648, null].map(expectedSourceVersion => ({ sourceRevisionId: randomUUID(), expectedSourceVersion }))]) {
    await assert.rejects(cloneCatalogDraft(db, value), error => error instanceof CatalogDraftError && error.code === "INVALID_INPUT");
  }
  assert.equal(dbAccessed, false);
});
