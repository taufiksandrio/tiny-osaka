ALTER TABLE public.publication_jobs DROP CONSTRAINT publication_jobs_page_revision_id_fkey;
--> statement-breakpoint
ALTER TABLE public.publication_jobs ADD CONSTRAINT publication_jobs_page_revision_id_fkey FOREIGN KEY(page_revision_id) REFERENCES public.page_revisions(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.publication_jobs DROP CONSTRAINT publication_jobs_catalog_revision_id_fkey;
--> statement-breakpoint
ALTER TABLE public.publication_jobs ADD CONSTRAINT publication_jobs_catalog_revision_id_fkey FOREIGN KEY(catalog_revision_id) REFERENCES public.catalog_revisions(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
--> statement-breakpoint
ALTER TABLE public.publication_events DROP CONSTRAINT publication_events_job_id_fkey;
--> statement-breakpoint
ALTER TABLE public.publication_events ADD CONSTRAINT publication_events_job_id_fkey FOREIGN KEY(job_id) REFERENCES public.publication_jobs(id) ON DELETE RESTRICT ON UPDATE RESTRICT;
