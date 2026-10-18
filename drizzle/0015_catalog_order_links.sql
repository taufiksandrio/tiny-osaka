-- ADR-037 rev.6 (optional per-product order links, stored only). Additive; hand-reviewed; NOT applied by agents.
-- Local/isolated databases only until a separate production approval exists.
-- Nullable columns without defaults: no table rewrite and no existing row is touched, so frozen snapshot
-- rows and their content hashes are unchanged. Row triggers do not fire for DDL. catalog_purge_product (0014)
-- and the public read function (0006) are intentionally not replaced: links are removed with their
-- product_entries rows and are never exposed publicly.
ALTER TABLE public.product_entries ADD COLUMN grabfood_url text;
--> statement-breakpoint
ALTER TABLE public.product_entries ADD COLUMN gofood_url text;
--> statement-breakpoint
ALTER TABLE public.product_entries ADD COLUMN shopeefood_url text;
--> statement-breakpoint
ALTER TABLE public.product_entries ADD CONSTRAINT product_entries_grabfood_url_check CHECK (grabfood_url IS NULL OR (grabfood_url ~ '^https://' AND length(grabfood_url) <= 2048));
--> statement-breakpoint
ALTER TABLE public.product_entries ADD CONSTRAINT product_entries_gofood_url_check CHECK (gofood_url IS NULL OR (gofood_url ~ '^https://' AND length(gofood_url) <= 2048));
--> statement-breakpoint
ALTER TABLE public.product_entries ADD CONSTRAINT product_entries_shopeefood_url_check CHECK (shopeefood_url IS NULL OR (shopeefood_url ~ '^https://' AND length(shopeefood_url) <= 2048));
