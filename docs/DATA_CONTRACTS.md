# Conceptual Contracts — DO NOT mistake for confirmed platform API schema

## Proposed entities (subject to architecture approval)
`User(id,email,role,status,createdAt)`; `Session(userId,issuedAt,lastActiveAt,expiresAt)`; `AuditEvent(actor,action,target,revision,time,metadata)`; `ContentPage(id,type,slug,locale,status,publishedRevisionId)`; `PageRevision(id,pageId,fields,createdBy,approvedBy,approvedAt,scheduledFor,version)`; `Media(id,type,storageKey,mime,size,alt,posterKey,owner)`; `Product(id,slug,category,basePrice,media)`; `ProductTranslation(productId,locale,title,description,seo)`; `ModifierGroup(id,productId,min,max,selectionType)`; `ModifierOption(id,groupId,title,priceDelta)`; `MerchantMapping(productId,platform,externalId,verifiedProductUrl,verifiedStoreUrl,lastSyncHash)`; `SyncRun(id,initiator,platform,status,attempt,idempotencyKey,requestSummary,finishedAt,errorCategory)`; `PlatformSettings(platform,isEnabled,connectionStatus)`. Define real DB constraints and normalized relations during schema design.

## Invariants
- No merchant platform UI/API fields should be assumed identical; independent adapters convert from CMS canonical model.
- No numeric inventory quantity. URL fallback only to real verified store links, never fabricated deeplinks.
- `price` and modifier deltas stored as integer IDR amounts, never floating-point currency.
- Product data changes create a versioned candidate requiring Owner approval before sync; saved draft never triggers sync.
- Approval tied to revision hash/id. Concurrent edits require conflict detection.
- Synchronization returns per-platform status; queue job includes explicitly approved immutable payload snapshot.
- Platform on/off is permission-restricted, separately logged; default OFF prior to verified authorized access.

## GA4 minimal measurement plan (proposed contract)
- Standard page views plus `view_item` with stable item identifier and locale.
- Custom `click_order` event with `item_id` (if product-specific), `platform` (`gofood`/`grabfood`), `source_page` (non-PII path), `placement` (CTA placement), `locale`; use GA4 acquisition and approved campaign UTMs. Register appropriate custom dimensions in GA4 as necessary.
- Do not send user's email, name, phone, cookies or other personal information as custom params.
- Prevent duplicate analytics events across generic outbound tracking and custom CTA tracking.
- `click_order` represents a click, NEVER a paid order or completed purchase.

## Bilingual routing (proposed)
`/id/...` and `/en/...`, consistent slugs / localized content mapping, self + reciprocal hreflang, canonical per locale, localized sitemap and noindex on drafts. Need owner approval of exact path strategy.
