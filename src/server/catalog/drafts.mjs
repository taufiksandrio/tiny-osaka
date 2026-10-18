import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { catalogRevisions, categories, products, productVariants, variantTranslations, categoryEntries, categoryTranslations,
  productEntries, productTranslations, modifierGroups, modifierOptions,
  modifierGroupTranslations, modifierOptionTranslations } from "../db/schema.mjs";

// Internal persistence only: callers must supply an authorized server DB context.
// No route, role grant, approval or published-content operation is exposed here.
export class CatalogDraftError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CatalogDraftError";
    this.code = code;
  }
}
const validUuid = value => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const writableVersion = value => Number.isInteger(value) && value >= 1 && value < 2147483647;
const validTranslationText = input => typeof input.title === "string" && input.title.trim().length > 0 &&
  typeof input.description === "string" && !input.title.includes("\0") && !input.description.includes("\0");
const validatePriceEdit = input => {
  if (!input || ![input.revisionId, input.productId, input.variantId].every(validUuid) ||
    !writableVersion(input.expectedVersion) ||
    !Number.isSafeInteger(input.basePrice) || input.basePrice < 0) {
    throw new CatalogDraftError("INVALID_INPUT", "Require valid IDs, a writable revision version and nonnegative safe integer IDR price.");
  }
};
const persistenceError = error => {
  if (error instanceof CatalogDraftError) return error;
  if (["40001", "40P01"].includes(error?.code ?? error?.cause?.code)) return new CatalogDraftError("REVISION_CONFLICT", "Draft changed; reload before editing.");
  // Do not expose driver errors, SQL parameters or connection details to callers.
  return new CatalogDraftError("PERSISTENCE_FAILED", "Draft persistence failed.");
};

export const createCatalogDraft = async db => {
  try {
    const [revision] = await db.insert(catalogRevisions).values({}).returning();
    return revision;
  } catch (error) { throw persistenceError(error); }
};

// Every draft child writer must consume the same root token in its transaction.
const advanceDraftVersion = async (tx, revisionId, expectedVersion) => {
  const [revision] = await tx.update(catalogRevisions)
    .set({ version: sql`${catalogRevisions.version} + 1` })
    .where(and(eq(catalogRevisions.id, revisionId), eq(catalogRevisions.status, "draft"),
      eq(catalogRevisions.version, expectedVersion)))
    .returning({ version: catalogRevisions.version });
  if (!revision) throw new CatalogDraftError("REVISION_CONFLICT", "Draft is missing, unavailable or has changed; reload before editing.");
  return revision.version;
};

export const updateVariantPrice = async (db, input) => {
  validatePriceEdit(input);
  // Copy validated primitives before yielding; do not retain mutable input.
  const { revisionId, productId, variantId, expectedVersion, basePrice } = input;
  try {
    return await db.transaction(async tx => {
      // Atomic compare-and-increment locks the revision, serializing all writers
      // that use this contract. A waiting stale writer matches no row after commit.
      const version = await advanceDraftVersion(tx, revisionId, expectedVersion);
      const [variant] = await tx.update(productVariants).set({ basePrice })
        .where(and(eq(productVariants.revisionId, revisionId), eq(productVariants.productId, productId),
          eq(productVariants.id, variantId)))
        .returning({ id: productVariants.id, basePrice: productVariants.basePrice });
      if (!variant) throw new CatalogDraftError("VARIANT_NOT_FOUND", "Variant does not belong to the selected draft and product.");
      return { revisionId, version, variantId: variant.id, basePrice: variant.basePrice };
    });
  } catch (error) { throw persistenceError(error); }
};

const saveTranslation = async (db, input, entry, translations, identityKey) => {
  if (!input || !validUuid(input.revisionId) || !validUuid(input[identityKey]) || !writableVersion(input.expectedVersion) ||
    !validTranslationText(input)) {
    throw new CatalogDraftError("INVALID_INPUT", "Require valid draft/entry IDs, version, nonblank title and text description.");
  }
  const { revisionId, expectedVersion, title, description } = input;
  const identity = input[identityKey];
  try {
    return await db.transaction(async tx => {
      const version = await advanceDraftVersion(tx, revisionId, expectedVersion);
      const [parent] = await tx.select({ id: entry[identityKey] }).from(entry)
        .where(and(eq(entry.revisionId, revisionId), eq(entry[identityKey], identity))).limit(1);
      if (!parent) throw new CatalogDraftError("ENTRY_NOT_FOUND", "Category or product does not belong to this draft.");
      // Explicit fields only. Text is stored literally, never interpreted as HTML.
      const [saved] = await tx.insert(translations).values({ revisionId, [identityKey]: identity, title, description })
        .onConflictDoUpdate({ target: [translations.revisionId, translations[identityKey]],
          set: { title, description } })
        .returning({ title: translations.title, description: translations.description });
      return { revisionId, version, [identityKey]: identity, ...saved };
    });
  } catch (error) { throw persistenceError(error); }
};

export const saveCategoryTranslation = (db, input) => saveTranslation(db, input, categoryEntries, categoryTranslations, "categoryId");
export const saveProductTranslation = (db, input) => saveTranslation(db, input, productEntries, productTranslations, "productId");

const saveProductVariant = async (db, input, creating) => {
  if (!input || !validUuid(input.revisionId) || !validUuid(input.productId) ||
    (!creating && !validUuid(input.variantId)) || !writableVersion(input.expectedVersion) ||
    typeof input.code !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(input.code) ||
    !Number.isSafeInteger(input.basePrice) || input.basePrice < 0 ||
    !Number.isInteger(input.sortOrder) || input.sortOrder < 0 || input.sortOrder > 2147483647) {
    throw new CatalogDraftError("INVALID_INPUT", "Require valid draft/product/variant scope, version, code, safe IDR price and int4 sort order.");
  }
  const { revisionId, productId, variantId, expectedVersion, code, basePrice, sortOrder } = input;
  try {
    return await db.transaction(async tx => {
      const version = await advanceDraftVersion(tx, revisionId, expectedVersion);
      const [entry] = await tx.select({ id: productEntries.productId }).from(productEntries)
        .where(and(eq(productEntries.revisionId, revisionId), eq(productEntries.productId, productId))).limit(1);
      if (!entry) throw new CatalogDraftError("ENTRY_NOT_FOUND", "Product does not belong to this draft.");
      const scope = and(eq(productVariants.revisionId, revisionId), eq(productVariants.productId, productId));
      const variants = await tx.select({ id: productVariants.id, code: productVariants.code }).from(productVariants).where(scope);
      const current = creating ? undefined : variants.find(row => row.id === variantId.toLowerCase());
      if (!creating && !current) throw new CatalogDraftError("VARIANT_NOT_FOUND", "Variant does not belong to the selected draft and product.");
      if ((creating ? variants.length === 0 : variants.length === 1) && code !== "standard") {
        throw new CatalogDraftError("VARIANT_RULE_VIOLATION", "The first or sole variant must use the standard code.");
      }
      if (variants.some(row => row.code === code && row.id !== current?.id)) {
        throw new CatalogDraftError("VARIANT_CODE_CONFLICT", "Variant code already exists in this draft product.");
      }
      const values = { code, basePrice, sortOrder };
      const [saved] = creating
        ? await tx.insert(productVariants).values({ revisionId, productId, ...values }).returning()
        : await tx.update(productVariants).set(values).where(and(scope, eq(productVariants.id, variantId))).returning();
      return { revisionId, version, productId, variantId: saved.id, code: saved.code,
        basePrice: saved.basePrice, sortOrder: saved.sortOrder };
    });
  } catch (error) { throw persistenceError(error); }
};

export const createProductVariant = (db, input) => saveProductVariant(db, input, true);
export const updateProductVariant = (db, input) => saveProductVariant(db, input, false);

export const saveVariantTranslation = async (db, input) => {
  if (!input || ![input.revisionId, input.productId, input.variantId].every(validUuid) ||
    !writableVersion(input.expectedVersion) || !validTranslationText(input)) {
    throw new CatalogDraftError("INVALID_INPUT", "Require valid draft/product/variant scope, version and text fields.");
  }
  const { revisionId, productId, variantId, expectedVersion, title, description } = input;
  try {
    return await db.transaction(async tx => {
      const version = await advanceDraftVersion(tx, revisionId, expectedVersion);
      const [variant] = await tx.select({ id: productVariants.id }).from(productVariants)
        .where(and(eq(productVariants.revisionId, revisionId), eq(productVariants.productId, productId),
          eq(productVariants.id, variantId))).limit(1);
      if (!variant) throw new CatalogDraftError("VARIANT_NOT_FOUND", "Variant does not belong to the selected draft and product.");
      const [saved] = await tx.insert(variantTranslations).values({ revisionId, productId, variantId, title, description })
        .onConflictDoUpdate({ target: [variantTranslations.revisionId, variantTranslations.productId, variantTranslations.variantId],
          set: { title, description } }).returning({ title: variantTranslations.title, description: variantTranslations.description });
      return { revisionId, version, productId, variantId: variant.id, ...saved };
    });
  } catch (error) { throw persistenceError(error); }
};

const validCode = value => typeof value === "string" && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(value);
const validInt4 = value => Number.isInteger(value) && value >= 0 && value <= 2147483647;
const validModifierScope = input => input && validUuid(input.revisionId) && validUuid(input.productId) && writableVersion(input.expectedVersion);

const saveModifierGroup = async (db, input, creating) => {
  if (!validModifierScope(input) || (!creating && !validUuid(input.groupId)) || !validCode(input.code) ||
    !["single", "multiple"].includes(input.selectionType) || !validInt4(input.minSelections) ||
    !validInt4(input.maxSelections) || input.minSelections > input.maxSelections ||
    (input.selectionType === "single" && input.maxSelections > 1) || !validInt4(input.sortOrder)) {
    throw new CatalogDraftError("INVALID_INPUT", "Require valid modifier group scope, version, code, selection limits and sort order.");
  }
  const { revisionId, productId, groupId, expectedVersion, code, selectionType, minSelections, maxSelections, sortOrder } = input;
  try {
    return await db.transaction(async tx => {
      const version = await advanceDraftVersion(tx, revisionId, expectedVersion);
      const [entry] = await tx.select({ id: productEntries.productId }).from(productEntries)
        .where(and(eq(productEntries.revisionId, revisionId), eq(productEntries.productId, productId))).limit(1);
      if (!entry) throw new CatalogDraftError("ENTRY_NOT_FOUND", "Product does not belong to this draft.");
      const scope = and(eq(modifierGroups.revisionId, revisionId), eq(modifierGroups.productId, productId));
      const groups = await tx.select({ id: modifierGroups.id, code: modifierGroups.code }).from(modifierGroups).where(scope);
      const current = creating ? undefined : groups.find(row => row.id === groupId.toLowerCase());
      if (!creating && !current) throw new CatalogDraftError("MODIFIER_GROUP_NOT_FOUND", "Modifier group does not belong to this draft product.");
      if (groups.some(row => row.code === code && row.id !== current?.id)) {
        throw new CatalogDraftError("MODIFIER_GROUP_CODE_CONFLICT", "Modifier group code already exists in this draft product.");
      }
      // Drafts may have too few options during setup. Pricing readiness checks
      // cross-row feasibility separately; local min/max rules always apply.
      const values = { code, selectionType, minSelections, maxSelections, sortOrder };
      const [saved] = creating
        ? await tx.insert(modifierGroups).values({ revisionId, productId, ...values }).returning()
        : await tx.update(modifierGroups).set(values).where(and(scope, eq(modifierGroups.id, groupId))).returning();
      return { revisionId, version, productId, groupId: saved.id, code: saved.code, selectionType: saved.selectionType,
        minSelections: saved.minSelections, maxSelections: saved.maxSelections, sortOrder: saved.sortOrder };
    });
  } catch (error) { throw persistenceError(error); }
};

export const createModifierGroup = (db, input) => saveModifierGroup(db, input, true);
export const updateModifierGroup = (db, input) => saveModifierGroup(db, input, false);

const saveModifierOption = async (db, input, creating) => {
  if (!validModifierScope(input) || !validUuid(input.groupId) || (!creating && !validUuid(input.optionId)) ||
    !validCode(input.code) || !Number.isSafeInteger(input.priceDelta) || input.priceDelta < 0 || !validInt4(input.sortOrder)) {
    throw new CatalogDraftError("INVALID_INPUT", "Require valid modifier option scope, version, code, safe IDR delta and sort order.");
  }
  const { revisionId, productId, groupId, optionId, expectedVersion, code, priceDelta, sortOrder } = input;
  try {
    return await db.transaction(async tx => {
      const version = await advanceDraftVersion(tx, revisionId, expectedVersion);
      const [group] = await tx.select({ id: modifierGroups.id }).from(modifierGroups)
        .where(and(eq(modifierGroups.revisionId, revisionId), eq(modifierGroups.productId, productId), eq(modifierGroups.id, groupId))).limit(1);
      if (!group) throw new CatalogDraftError("MODIFIER_GROUP_NOT_FOUND", "Modifier group does not belong to this draft product.");
      const scope = and(eq(modifierOptions.revisionId, revisionId), eq(modifierOptions.productId, productId), eq(modifierOptions.groupId, groupId));
      const options = await tx.select({ id: modifierOptions.id, code: modifierOptions.code }).from(modifierOptions).where(scope);
      const current = creating ? undefined : options.find(row => row.id === optionId.toLowerCase());
      if (!creating && !current) throw new CatalogDraftError("MODIFIER_OPTION_NOT_FOUND", "Modifier option does not belong to this draft product/group.");
      if (options.some(row => row.code === code && row.id !== current?.id)) {
        throw new CatalogDraftError("MODIFIER_OPTION_CODE_CONFLICT", "Modifier option code already exists in this draft group.");
      }
      const values = { code, priceDelta, sortOrder };
      const [saved] = creating
        ? await tx.insert(modifierOptions).values({ revisionId, productId, groupId: group.id, ...values }).returning()
        : await tx.update(modifierOptions).set(values).where(and(scope, eq(modifierOptions.id, optionId))).returning();
      return { revisionId, version, productId, groupId: saved.groupId, optionId: saved.id,
        code: saved.code, priceDelta: saved.priceDelta, sortOrder: saved.sortOrder };
    });
  } catch (error) { throw persistenceError(error); }
};

export const createModifierOption = (db, input) => saveModifierOption(db, input, true);
export const updateModifierOption = (db, input) => saveModifierOption(db, input, false);

const saveModifierTranslation = async (db, input, isOption) => {
  if (!validModifierScope(input) || !validUuid(input.groupId) || (isOption && !validUuid(input.optionId)) || !validTranslationText(input)) {
    throw new CatalogDraftError("INVALID_INPUT", "Require valid modifier translation scope, version and text fields.");
  }
  const { revisionId, productId, groupId, optionId, expectedVersion, title, description } = input;
  const parent = isOption ? modifierOptions : modifierGroups;
  const translations = isOption ? modifierOptionTranslations : modifierGroupTranslations;
  try {
    return await db.transaction(async tx => {
      const version = await advanceDraftVersion(tx, revisionId, expectedVersion);
      const conditions = [eq(parent.revisionId, revisionId), eq(parent.productId, productId), eq(parent.id, isOption ? optionId : groupId)];
      if (isOption) conditions.push(eq(modifierOptions.groupId, groupId));
      const [row] = await tx.select({ id: parent.id }).from(parent).where(and(...conditions)).limit(1);
      if (!row) throw new CatalogDraftError(isOption ? "MODIFIER_OPTION_NOT_FOUND" : "MODIFIER_GROUP_NOT_FOUND", "Modifier translation parent does not belong to the selected draft scope.");
      const values = { revisionId, productId, groupId: isOption ? groupId : row.id, title, description };
      const target = [translations.revisionId, translations.productId, translations.groupId];
      if (isOption) { values.optionId = row.id; target.push(modifierOptionTranslations.optionId); }
      const [saved] = await tx.insert(translations).values(values)
        .onConflictDoUpdate({ target, set: { title, description } }).returning({ title: translations.title, description: translations.description });
      return { revisionId, version, productId, groupId: values.groupId, ...(isOption ? { optionId: row.id } : {}), ...saved };
    });
  } catch (error) { throw persistenceError(error); }
};

export const saveModifierGroupTranslation = (db, input) => saveModifierTranslation(db, input, false);
export const saveModifierOptionTranslation = (db, input) => saveModifierTranslation(db, input, true);

const createCatalogIdentity = async (db, input, isProduct) => {
  if (!input || !validUuid(input.revisionId) || !writableVersion(input.expectedVersion) ||
    !validCode(input.slug) || !validInt4(input.sortOrder) || (isProduct && !validUuid(input.categoryId))) {
    throw new CatalogDraftError("INVALID_INPUT", "Require a valid draft/version, slug, sort order and category for a product.");
  }
  const { revisionId, expectedVersion, slug, sortOrder, categoryId } = input;
  const identityTable = isProduct ? products : categories;
  const entryTable = isProduct ? productEntries : categoryEntries;
  const key = isProduct ? "productId" : "categoryId";
  try {
    return await db.transaction(async tx => {
      const version = await advanceDraftVersion(tx, revisionId, expectedVersion);
      if (isProduct) {
        const [category] = await tx.select({ id: categoryEntries.categoryId }).from(categoryEntries)
          .where(and(eq(categoryEntries.revisionId, revisionId), eq(categoryEntries.categoryId, categoryId))).limit(1);
        if (!category) throw new CatalogDraftError("ENTRY_NOT_FOUND", "Category does not belong to this draft.");
      }
      // Global unique slug protects concurrent creation in different revisions.
      // Never attach an existing identity implicitly on a slug collision.
      const [identity] = await tx.insert(identityTable).values({ slug })
        .onConflictDoNothing({ target: identityTable.slug }).returning({ id: identityTable.id });
      if (!identity) throw new CatalogDraftError("SLUG_CONFLICT", "Slug is already used in this catalog namespace.");
      const values = { revisionId, [key]: identity.id, sortOrder };
      if (isProduct) values.categoryId = categoryId;
      await tx.insert(entryTable).values(values);
      return { ...values, version, slug };
    });
  } catch (error) { throw persistenceError(error); }
};

export const createCatalogCategory = (db, input) => createCatalogIdentity(db, input, false);
export const createCatalogProduct = (db, input) => createCatalogIdentity(db, input, true);

const updateCatalogPlacement = async (db, input, isProduct) => {
  const key = isProduct ? "productId" : "categoryId";
  if (!input || !validUuid(input.revisionId) || !validUuid(input[key]) || !writableVersion(input.expectedVersion) ||
    !validInt4(input.sortOrder) || (isProduct && !validUuid(input.categoryId))) {
    throw new CatalogDraftError("INVALID_INPUT", "Require valid draft/entry IDs, version, category and sort order.");
  }
  const { revisionId, expectedVersion, categoryId, sortOrder } = input;
  const identity = input[key];
  const table = isProduct ? productEntries : categoryEntries;
  try {
    return await db.transaction(async tx => {
      const version = await advanceDraftVersion(tx, revisionId, expectedVersion);
      const values = { sortOrder };
      if (isProduct) {
        const [category] = await tx.select({ id: categoryEntries.categoryId }).from(categoryEntries)
          .where(and(eq(categoryEntries.revisionId, revisionId), eq(categoryEntries.categoryId, categoryId))).limit(1);
        if (!category) throw new CatalogDraftError("ENTRY_NOT_FOUND", "Category does not belong to this draft.");
        values.categoryId = category.id;
      }
      const [entry] = await tx.update(table).set(values)
        .where(and(eq(table.revisionId, revisionId), eq(table[key], identity))).returning();
      if (!entry) throw new CatalogDraftError("ENTRY_NOT_FOUND", "Category or product does not belong to this draft.");
      return { revisionId, version, [key]: entry[key], ...values };
    });
  } catch (error) { throw persistenceError(error); }
};

export const updateCategoryPlacement = (db, input) => updateCatalogPlacement(db, input, false);
export const updateProductPlacement = (db, input) => updateCatalogPlacement(db, input, true);

// Explicit whitelist in FK dependency order. Identity/slug tables, root metadata
// and any future approval fields are not copied by this operation.
const cloneChildren = [
  ["category_entries", ["category_id", "sort_order"]],
  ["category_translations", ["category_id", "title", "description"]],
  ["product_entries", ["product_id", "category_id", "sort_order", "grabfood_url", "gofood_url", "shopeefood_url"]],
  ["product_translations", ["product_id", "title", "description"]],
  ["product_variants", ["product_id", "id", "code", "base_price", "sort_order"]],
  ["variant_translations", ["product_id", "variant_id", "title", "description"]],
  ["modifier_groups", ["product_id", "id", "code", "selection_type", "min_selections", "max_selections", "sort_order"]],
  ["modifier_group_translations", ["product_id", "group_id", "title", "description"]],
  ["modifier_options", ["product_id", "group_id", "id", "code", "price_delta", "sort_order"]],
  ["modifier_option_translations", ["product_id", "group_id", "option_id", "title", "description"]],
  ["catalog_media_refs", ["id", "product_id", "asset_id", "alt_id", "caption_id", "sort_order"]],
];

// excludeProductId (optional) copies the snapshot without one product: the card delete flow
// builds its replacement snapshot this way, because CMS roles cannot DELETE frozen/child rows.
export const cloneCatalogDraft = async (db, input) => {
  if (!input || !validUuid(input.sourceRevisionId) || !Number.isInteger(input.expectedSourceVersion) ||
    input.expectedSourceVersion < 1 || input.expectedSourceVersion > 2147483647 ||
    (input.excludeProductId !== undefined && !validUuid(input.excludeProductId))) {
    throw new CatalogDraftError("INVALID_INPUT", "Require a valid source revision ID and integer source version.");
  }
  const { sourceRevisionId, expectedSourceVersion, excludeProductId } = input;
  try {
    return await db.transaction(async tx => {
      // FOR SHARE blocks root UPDATEs by compliant writers while allowing reads
      // and other clones. The source version is not consumed by copying.
      const [source] = await tx.select({ id: catalogRevisions.id }).from(catalogRevisions)
        .where(and(eq(catalogRevisions.id, sourceRevisionId),
          eq(catalogRevisions.version, expectedSourceVersion))).for("share");
      if (!source) throw new CatalogDraftError("REVISION_CONFLICT", "Source revision is missing, unavailable or has changed; reload before copying.");
      const draft = await createCatalogDraft(tx);
      for (const [name, columns] of cloneChildren) {
        const table = sql`${sql.identifier("public")}.${sql.identifier(name)}`;
        const fields = sql.join(columns.map(column => sql.identifier(column)), sql`, `);
        const skip = excludeProductId && columns.includes("product_id") ? sql` AND product_id <> ${excludeProductId}::uuid` : sql``;
        await tx.execute(sql`INSERT INTO ${table} (revision_id, ${fields})
          SELECT ${draft.id}::uuid, ${fields} FROM ${table} WHERE revision_id = ${sourceRevisionId}::uuid${skip}`);
      }
      return draft;
    });
  } catch (error) { throw persistenceError(error); }
};
