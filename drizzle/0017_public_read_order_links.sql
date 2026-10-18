-- ADR-037 follow-up (menu card order popup): public_read_catalog() additionally returns the three stored
-- order links per product ('grabfoodUrl','gofoodUrl','shopeefoodUrl'; JSON null when empty). Hand-reviewed;
-- NOT applied to dev/production by agents. Function-only change: no table, column, trigger, hash or content row
-- is touched. CREATE OR REPLACE keeps owner, SECURITY DEFINER, search_path and the existing ACL (owner + app role
-- EXECUTE only); the grants are not widened. The server (src/server/public/data.mjs) re-validates every link
-- against the exact-host allowlist and drops anything invalid before it reaches the browser.
-- Rollback: re-create the public_read_catalog() body from 0016_drop_language_columns.sql.
CREATE OR REPLACE FUNCTION public.public_read_catalog() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
SELECT jsonb_build_object(
 'revision',jsonb_build_object('id',r.id,'version',r.version),
 'categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.category_id,'slug',c.slug,'title',t.title,'description',t.description,'sortOrder',e.sort_order) ORDER BY e.sort_order,e.category_id),'[]'::jsonb)
   FROM public.category_entries e JOIN public.categories c ON c.id=e.category_id JOIN public.category_translations t ON t.revision_id=e.revision_id AND t.category_id=e.category_id WHERE e.revision_id=r.id),
 'products',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',e.product_id,'slug',p.slug,'categoryId',e.category_id,'sortOrder',e.sort_order,'title',t.title,'description',t.description,'grabfoodUrl',e.grabfood_url,'gofoodUrl',e.gofood_url,'shopeefoodUrl',e.shopeefood_url,
   'variants',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',v.id,'code',v.code,'basePrice',v.base_price,'sortOrder',v.sort_order,'title',vt.title,'description',vt.description) ORDER BY v.sort_order,v.id),'[]'::jsonb)
     FROM public.product_variants v JOIN public.variant_translations vt ON vt.revision_id=v.revision_id AND vt.product_id=v.product_id AND vt.variant_id=v.id WHERE v.revision_id=r.id AND v.product_id=e.product_id),
   'groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'code',g.code,'selectionType',g.selection_type,'minSelections',g.min_selections,'maxSelections',g.max_selections,'sortOrder',g.sort_order,'title',gt.title,
     'options',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'code',o.code,'priceDelta',o.price_delta,'sortOrder',o.sort_order,'title',ot.title) ORDER BY o.sort_order,o.id),'[]'::jsonb)
       FROM public.modifier_options o JOIN public.modifier_option_translations ot ON ot.revision_id=o.revision_id AND ot.product_id=o.product_id AND ot.group_id=o.group_id AND ot.option_id=o.id WHERE o.revision_id=r.id AND o.product_id=e.product_id AND o.group_id=g.id)) ORDER BY g.sort_order,g.id),'[]'::jsonb)
     FROM public.modifier_groups g JOIN public.modifier_group_translations gt ON gt.revision_id=g.revision_id AND gt.product_id=g.product_id AND gt.group_id=g.id WHERE g.revision_id=r.id AND g.product_id=e.product_id)
 ) ORDER BY e.sort_order,e.product_id),'[]'::jsonb)
 FROM public.product_entries e JOIN public.products p ON p.id=e.product_id JOIN public.product_translations t ON t.revision_id=e.revision_id AND t.product_id=e.product_id WHERE e.revision_id=r.id),
 'media',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'productId',m.product_id,'sortOrder',m.sort_order,'alt',m.alt_id,'caption',m.caption_id,'asset',jsonb_build_object('id',a.id,'kind',a.kind,'width',a.width,'height',a.height,'durationMs',a.duration_ms,'externalId',a.external_id),'poster',CASE WHEN p.id IS NULL THEN NULL ELSE jsonb_build_object('id',p.id,'kind',p.kind,'width',p.width,'height',p.height,'durationMs',p.duration_ms,'externalId',p.external_id) END) ORDER BY m.sort_order,m.id),'[]'::jsonb) FROM public.catalog_media_refs m JOIN public.media_assets a ON a.id=m.asset_id LEFT JOIN public.media_assets p ON p.id=a.poster_id WHERE m.revision_id=r.id)
)
FROM public.catalog_publication live JOIN public.catalog_revisions r ON r.id=live.revision_id AND r.content_hash=live.content_hash AND r.status='published'
JOIN public.catalog_approvals a ON a.revision_id=r.id AND a.content_hash=live.content_hash
WHERE live.id=1
$$;
