// The caller validates the exact file/hash/history and holds its advisory lock.
// Do not nest Drizzle's migrator here: its session transaction can commit before
// the caller's final checks. SQL, history and verification share this transaction.
export const applyReviewedMigration = async (client, migrations, verify, prepare = async () => {}) => {
  await client.query("BEGIN");
  try {
    await prepare();
    for (const migration of (Array.isArray(migrations) ? migrations : [migrations])) {
      for (const statement of migration.sql) await client.query(statement);
      await client.query('INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1,$2)',
        [migration.hash, migration.folderMillis]);
    }
    await verify();
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
};
