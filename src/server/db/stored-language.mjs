// The site is Indonesian-only (ADR-034, ADR-038). The schema still requires a locale column value in
// the translation tables and in the public_read_* SQL functions (no migration in this stage), so this
// is the single place that supplies it. Never expose it through an API, prop or URL.
export const STORED_LOCALE = "id";
