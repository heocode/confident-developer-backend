# Production Backend Architecture

## Status

This document records the approved direction for turning the coursework backend into the production API for the Confident Developer portfolio. It is an implementation contract, not a description of features that already exist.

The submitted assignment is frozen at tag `assignment-2-submission` and branch `assignment-2`. Production development continues on `main`. The Render service used for grading must continue deploying `assignment-2` so changes to `main` cannot alter the submitted API.

## Product Scope

The backend supports the approved desktop portfolio designs and a separate React, TypeScript, and Vite frontend. All site content must be manageable through an authenticated admin interface.

The production product includes:

- profile and homepage content;
- projects and project detail pages;
- services and service detail pages;
- moderated public references;
- contact inquiries;
- a personal mini-blog;
- real post likes and views;
- cached GitHub profile and repository statistics;
- managed image assets.

The backend repository does not contain frontend code.

## Code Organization

Production code is moving incrementally from horizontal layer directories to feature-first modules under `src/modules`. Each completed module owns its feature-specific model, services, controllers, routes, validation, and serializers. Shared application configuration and cross-cutting HTTP middleware remain outside feature modules.

The Projects module is located at `src/modules/projects`. Its `PortfolioProject` model is shared at the module root, while authenticated project commands and admin HTTP delivery live under `src/modules/projects/admin`. A public subdirectory is created only when the public Projects API is implemented; empty placeholder modules are not used.

The Services module is located at `src/modules/services`. Its production-only `PortfolioService` model is shared at the module root, while authenticated commands and public reads are separated under `admin` and `public`. It never reuses the coursework service collection.

The GitHub module is located at `src/modules/github`. It owns the singleton snapshot and refresh policy, isolates GitHub REST access under `providers`, and separates the public summary from the authenticated refresh endpoint.

The Profile Post module is located at `src/modules/profile-post`. It owns the singleton Home post, anonymous visitor identity, revision-scoped likes and views, and separate public and admin delivery.

The Profile module is located at `src/modules/profile`. It owns the singleton Site Profile, public display identity, managed avatar, managed resume assignment, and stable public delivery. Future Profile/About fields extend this singleton incrementally.

The Media module is located at `src/modules/media`. Shared asset persistence and lifecycle behavior live at the module root, Cloudinary is isolated under `providers`, and authenticated media HTTP delivery lives under `admin`.

The Authentication module is located at `src/modules/auth`. It owns administrator and session persistence, authentication business logic, cookie policy, login validation, safe admin serialization, authentication routes, and the middleware used to protect the admin API. Cross-cutting rate limiting, trusted-origin checks, request validation, no-store policy, and global error handling remain shared middleware.

The frozen Assignment 2 compatibility layer is isolated under `src/coursework`, retaining its internal models/controllers/routes organization and shared CRUD factories. It is mounted only when `ENABLE_COURSEWORK_API=true`. The production composition root lives at `src/api/v1-router.js` and connects feature-owned routers without owning their behavior. Automated tests mirror configuration, coursework, and production module boundaries under `test`.

## Deployment Topology

The production frontend is hosted on Vercel and the production backend is hosted separately on Render. Browser code uses relative `/api/v1/...` URLs and does not embed or call the Render origin directly.

Vercel uses an external rewrite as a reverse proxy while preserving the browser-visible URL:

```text
Browser: https://<frontend-host>/api/v1/...
                          |
                          v
Vercel external rewrite: https://<backend-host>/api/v1/...
```

This makes the API session first-party from the browser's perspective and avoids depending on third-party cookies between `vercel.app` and `onrender.com`. The frontend repository owns the Vercel rewrite configuration. Local Vite development should mirror this topology by proxying `/api` to `http://localhost:3000`.

Session cookies do not set a `Domain` attribute. Production admin cookies use `HttpOnly`, `Secure`, `SameSite=Lax`, and a restrictive path. Development may disable `Secure` only for local HTTP. Authenticated frontend requests continue to use relative URLs.

Authentication and admin responses must send `Cache-Control: private, no-store` so neither browsers nor the Vercel proxy cache session-specific data. Public GET caching is configured separately and deliberately. Vercel preview origins do not receive admin access automatically; each permitted origin must be explicitly configured.

Render proxy trust and client-IP behavior must be verified in the deployed topology before relying on IP-based controls. Rate limiting is defense in depth and must not be the only authorization boundary.

## API Lifecycle

### Coursework API

The unversioned `/api/references`, `/api/projects`, `/api/services`, and `/api/users` routes exist for Assignment 2 compatibility. They are preserved in the frozen assignment branch.

They are not the production contract. In particular, the public users CRUD and client-controlled `role` field must never be exposed by the production deployment. Once equivalent production features are available on `main`, the legacy routes will be removed from `main` or gated behind an explicit development-only compatibility switch.

`GET /api/health` may remain unversioned for hosting health checks.

### Production API

All new product routes use `/api/v1`. Successful responses use the existing `success`, `message`, and optional `data` shape. Errors use `success: false` and a safe `message`; validation errors may also include structured field details when they do not expose internals.

Collection endpoints use deterministic ordering and cursor or page-based pagination as appropriate. Public identifiers remain `id`; MongoDB `_id`, `__v`, password hashes, session tokens, private email addresses, moderation metadata, and provider secrets are never serialized publicly.

## Access Boundaries

### Public read routes

Implemented project routes:

```text
GET /api/v1/projects
GET /api/v1/projects?placement=home
GET /api/v1/projects/:slug
```

The default collection contains published projects ordered by `projectsPageOrder` and `_id`. Home placement contains only published featured projects ordered by `home.order` and `_id`. Both use the same card representation, including links; detail lookup uses the public slug and adds `scope` plus ordered screenshots. The frontend may map `/projects/:slug` to the same accordion-style Projects page while the API remains under `/api/v1/projects/:slug`.

Implemented service routes:

```text
GET /api/v1/services
GET /api/v1/services?placement=home
```

The default collection contains published services ordered by `servicesPageOrder` and `_id`. Home placement contains only published featured services ordered by `home.order` and `_id`. Both use the same Home-ready public representation; detail lookup is intentionally deferred until the dedicated Services page fields and original assets are implemented.

The implemented GitHub summary route is:

```text
GET /api/v1/github-summary
```

It returns the last successful MongoDB snapshot containing non-fork public repository count, the union count of positive-byte languages reported by GitHub, and refresh time. A public request never waits on GitHub. Missing initial data returns `503`; stale data is returned immediately while a single background refresh starts.

Implemented Profile Post read routes are:

```text
GET /api/v1/profile-post
GET /api/v1/profile-post/interaction?revision=<number>
```

The first route returns the current Home post and its aggregate counters with a 15-second shared-cache lifetime. The personalized interaction route reports whether the current visitor liked the rendered revision and is always `private, no-store`.

Implemented public profile routes are:

```text
GET /api/v1/profile
GET /api/v1/profile/resume
```

The root route returns the public display name, normalized handle, and provider-neutral optimized avatar representation. The resume route returns a short-cacheable `302` to a backend-generated Cloudinary attachment URL for the active managed PDF. Relative API URLs remain stable across replacements, and the frontend never stores or constructs provider URLs.

Implemented reference read route:

```text
GET /api/v1/references
```

It returns only approved references with page-based pagination and an explicit privacy-safe serializer. When the total approved count is zero, it also composes the References-owned empty-state message with the Site Profile public identity; otherwise `emptyState` is `null`. Successful lists have a 30-second shared-cache lifetime without stale-while-revalidate so removal by moderation has a bounded cache delay.

Remaining planned public read routes:

```text
GET /api/v1/services/:slug
GET /api/v1/posts
GET /api/v1/posts/:slug
```

Only published projects, services, posts, and approved references are returned. List responses expose only the fields needed by their cards; detail routes may expose richer public fields.

Successful public project, service, GitHub summary, and resume redirect responses send `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300` and `CDN-Cache-Control: max-age=60, stale-while-revalidate=300`. The Profile Post uses a shorter 15-second shared lifetime and 30-second stale window so counter and content changes converge sooner. Express sets these headers only after successful service and serialization work, so validation, not-found, availability, and server errors are not cached. The dedicated CDN header makes caching explicit for Vercel external rewrites; an existing Vercel project must still verify or enable external-origin caching in its CDN configuration. Content changes are eventually visible within the bounded cache window rather than instantly purged; targeted Vercel cache invalidation can be added later if immediate emergency removal becomes a product requirement.

### Public write routes

Implemented Profile Post interaction routes:

```text
PUT    /api/v1/profile-post/like
DELETE /api/v1/profile-post/like
POST   /api/v1/profile-post/view
```

Their strict request bodies contain only the currently rendered `revision`. They require an exact trusted `Origin`, have dedicated in-memory rate limits, and always return `private, no-store`. A stale revision returns `409` instead of applying an interaction to replacement content.

Implemented reference submission and ownership routes:

```text
POST   /api/v1/references
GET    /api/v1/references/submissions/:id
DELETE /api/v1/references/:id/submission
```

The POST and DELETE routes require an exact trusted frontend `Origin`. The submit route uses strict normalized fields, a honeypot, a five-attempts-per-hour IP limiter, 24-hour duplicate detection, and server-side Cloudflare Turnstile verification. Production verifies the expected hostname and `reference_submit` action and cannot start with official Turnstile test credentials. Every accepted record starts as `pending`; failed automated checks are rejected before persistence rather than being stored with a moderation decision.

Submission returns a random 256-bit management token once. Only its SHA-256 hash is stored, and the status and deletion routes require the raw token in `X-Reference-Management-Token`. Ownership failures intentionally return the same `404` as an unknown record. These responses are `private, no-store`, and no raw IP address is persisted.

Remaining planned public write route:

```text
POST   /api/v1/contact
```

Reference submissions always start in `pending` state. A submitter's email is used only for verification and management and is never returned by public reference routes. The frontend must state:

> Your email is used only to verify and manage your reference. It will never be displayed on the site.

Contact inquiries will be rate-limited, size-limited, validated, and protected by a configurable anti-spam challenge before launch.

Profile Post likes and views represent recorded interactions, not decorative seed values. A 256-bit anonymous first-party visitor identifier is stored in a host-only `HttpOnly`, `SameSite=Lax` cookie that becomes `Secure` in production; only its SHA-256 hash is persisted. Likes are idempotent per revision and visitor. Views are deduplicated per revision and visitor for 24 hours. Raw IP addresses are not persisted for these interactions.

### Authentication routes

Planned routes:

```text
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/session
```

The portfolio uses a single-owner admin model; it has no public signup or user-management API. The initial admin is provisioned by a local one-time script against Atlas, never through a public bootstrap route.

Authentication uses a 256-bit opaque session token in a host-only `HttpOnly` cookie. Production cookies are `Secure` and `SameSite=Lax` because requests reach the API through the same-origin Vercel rewrite. Only a SHA-256 hash of the token is stored in an `AdminSession` document. Login revokes previous sessions for the single administrator and creates one seven-day session. Sessions are revocable and expire automatically through a TTL index. Unsafe cookie-authenticated requests require an exact approved `Origin`.

Login is limited to five failed attempts per IP in 15 minutes. Successful login attempts do not consume the failure allowance. The initial in-memory limiter is suitable for one application process; a shared store is required before horizontal scaling.

### Admin routes

All `/api/v1/admin/*` routes require a valid admin session. Unsafe methods additionally require an exact configured `Origin`.

Implemented project routes are:

```text
POST   /api/v1/admin/projects
GET    /api/v1/admin/projects
GET    /api/v1/admin/projects/:id
PATCH  /api/v1/admin/projects/:id
DELETE /api/v1/admin/projects/:id
```

The collection route optionally filters by `status` and uses descending creation time plus `_id` for deterministic admin ordering. Create and update bodies are strict allowlists. `publishedAt` is server-owned and assigned at first publication.

Implemented service routes are:

```text
POST   /api/v1/admin/services
GET    /api/v1/admin/services
GET    /api/v1/admin/services/:id
PATCH  /api/v1/admin/services/:id
DELETE /api/v1/admin/services/:id
```

The collection route optionally filters by `status` and uses descending creation time plus `_id`. Writes use strict allowlists, merge partial Home placement updates, and enforce the four-service Home limit transactionally.

The implemented GitHub administration route is:

```text
POST /api/v1/admin/github/refresh
```

It initializes or refreshes the singleton snapshot through the GitHub provider. The request accepts no writable settings. Failures preserve the last successful counts, persist only an allowlisted operational failure code, and return a safe provider error.

Implemented Profile Post administration routes are:

```text
GET /api/v1/admin/profile-post
PUT /api/v1/admin/profile-post
```

The strict replacement body contains only plain text of 1–500 characters. Changing it increments the revision, updates the content date, and transactionally clears interaction records and aggregate counters. Replacing it with identical normalized text is a no-op.

Implemented profile administration routes are:

```text
GET  /api/v1/admin/profile
PUT  /api/v1/admin/profile
POST /api/v1/admin/profile/resume/upload-signature
GET  /api/v1/admin/profile/resume
PUT  /api/v1/admin/profile/resume
```

The root routes retrieve and replace the complete public identity using display name, normalized handle, and an active image MediaAsset ID. The resume upload descriptor permits one managed PDF up to 5 MB. Its strict replacement body contains only provider and immutable provider asset ID; the backend obtains all delivery and file metadata from Cloudinary before assigning the document.

Implemented reference section settings routes are:

```text
GET /api/v1/admin/references/settings
PUT /api/v1/admin/references/settings
```

The strict PUT body contains only the empty-state message. A changed normalized message receives a server-owned content date, while identical text is a no-op.

Implemented media routes are:

```text
POST   /api/v1/admin/media/upload-signature
POST   /api/v1/admin/media
GET    /api/v1/admin/media
GET    /api/v1/admin/media/:id
PATCH  /api/v1/admin/media/:id
DELETE /api/v1/admin/media/:id
```

The media collection uses page-based pagination with a default page size of 24 and maximum of 100. Detail responses include project usage counts. Registration is idempotent by provider asset ID, and PATCH currently updates the default alt text.

Remaining planned route families are:

```text
/api/v1/admin/references
/api/v1/admin/inquiries
/api/v1/admin/posts
```

Admin serializers may include private operational fields, but never password hashes, raw session tokens, deletion-token hashes, or storage-provider secrets.

## Data Model Direction

Schemas will be extended incrementally as their endpoints are implemented. Fields listed here define the intended boundaries; exact limits and optionality belong in the implementation and tests.

### AdminUser and AdminSession

`AdminUser` stores normalized email, display name, bcrypt password hash, active state, and login timestamps. It does not accept a client-controlled role. `AdminSession` stores the admin reference, SHA-256 token hash, creation time, and expiration time.

### SiteProfile

`SiteProfile` uses the immutable singleton key `portfolio` in `site_profiles`. It stores the required active resume reference and an optional complete public identity containing display name, normalized handle, and active image avatar reference. Identity is independent from the private `AdminUser`; existing resume-only records remain valid until identity is configured. Future approved biography, location, availability, social, education, work, and CTA fields extend the same singleton rather than creating competing profile records.

Identity and resume replacement update only singleton references. Previous assets remain in the media library for explicit lifecycle review instead of being deleted automatically. The stable public identity endpoint returns a backend-generated avatar URL, while the resume endpoint redirects to a provider-generated attachment URL named `Vadim-Iskakov-Resume.pdf`.

### Project

Production projects are stored in the explicit `portfolio_projects` collection. They never share the coursework `projects` collection because the frozen assignment deployment retains public CRUD access to that legacy data.

A `PortfolioProject` contains:

- a unique stable `slug` and required `title`;
- `draft`, `published`, or `archived` status;
- Home copy in `tagline` and `summary`;
- Projects-page copy in `scope` and the single displayed `position`;
- a concrete normalized `themeColor` in `#RRGGBB` format;
- a timeline with required start date for publication and a nullable end date for ongoing work;
- Home placement with `featured`, `primary`, and integer `order` values;
- a separate integer `projectsPageOrder` for the project tabs/page;
- up to 12 build-breakdown items with stable subdocument IDs and independent integer percentages from 0 through 100; percentages are completion/capability indicators and do not need to total 100;
- up to 10 HTTPS links with stable subdocument IDs and `github`, `website`, `app-store`, or `external` icon keys;
- `logoAsset`, `homePreviewAsset`, and up to 12 ordered screenshot references;
- publication and persistence timestamps.

Drafts require only slug and title so incomplete work can be saved. Published projects require tagline, summary, scope, position, theme color, timeline start, logo, at least one screenshot, and publication time. A published featured project additionally requires its Home preview and build breakdown. The service assigns `publishedAt` automatically on first publication instead of accepting it as writable input.

Only a featured project may be primary. Removing a project from Home automatically clears its primary state, while an explicitly contradictory state is rejected. A partial unique MongoDB index prevents more than one published primary project. The project service additionally limits Home to three published featured projects, requires referenced media to exist in active state, and atomically replaces the current primary inside a MongoDB transaction.

Build breakdowns, project links, and screenshots use MongoDB array order as their display-order source of truth; nested items do not carry separate order fields. Admin responses expose each subdocument `_id` as `id`. PATCH accepts complete replacement arrays: known IDs retain identity, new items omit `id`, omitted items are deleted, and unknown or duplicate IDs are rejected before the transaction saves. This supports future drag-and-drop reordering without recreating media assets.

Deleting a project removes only the `PortfolioProject` document. Referenced media metadata and provider files remain available because assets can be shared and have an independent lifecycle. The Media API owns usage checks and explicit deletion.

Project color describes the visual identity of the individual project, not a development discipline. The frontend derives accessible surfaces, borders, progress colors, and contrasting text from `themeColor`. Technologies are not part of the approved Project design and are not stored on the project model.

### Service

Production services are stored in the explicit `portfolio_services` collection. The Home-ready model contains a unique stable slug, title, description, `draft`/`published`/`archived` state, allowlisted icon and tone keys, Home placement and order, a separate Services-page order, server-owned first-publication time, and persistence timestamps.

The icon key selects one of the frontend-owned service SVGs, and the tone key selects a frontend-owned CSS theme. The API does not store or return source paths, imported SVG modules, CSS class names, or color literals. Published services require description, icon, and tone; Home contains at most four published featured services. Public serializers omit state, internal order values, timestamps, and MongoDB internals because response order is authoritative.

Capabilities, tool presentation, related projects, showcase media, and slug detail are deliberately deferred until the dedicated Services page is implemented. They will extend this model without changing the Home list contract.

### Reference

References use the explicit `portfolio_references` collection. They store the author's public name, company, position, immutable original testimonial, separately editable public testimonial, three integer ratings from 1 to 5, private normalized email, moderation status, display order, server-owned lifecycle dates, submission metadata, and a non-selected hashed deletion-management token. Valid states are `pending`, `approved`, and `rejected`.

Protected moderation is available through `/api/v1/admin/references`, `/:id`, and `/:id/moderation`. Moderation uses explicit `approve`, `reject`, and `reopen` actions. Rejection requires an allowlisted private reason; `other` additionally requires a private note. Admin editing currently changes only the displayed testimonial and display order. The original testimonial is preserved, and no edited marker is exposed publicly.

Public serializers expose only approved content and never expose email, original text, management-token hashes, moderation state, rejection details, or persistence internals.

`ReferenceSectionSettings` uses the immutable singleton key `home` in `reference_section_settings`. It stores the administrator-editable empty-state message and its server-owned content date. The public list includes the composed message and Site Profile identity only when the total approved count is zero; pending and rejected records do not suppress it, and incomplete configuration degrades to `emptyState: null` without breaking approved-content delivery.

Public submission is mounted with strict normalized input, three required ratings, URL rejection, a honeypot, a dedicated five-per-hour IP limiter, 24-hour duplicate detection, and server-side Turnstile verification. Production validates both hostname and the `reference_submit` action; official test credentials are non-production only. Automated failures do not create records, and all accepted submissions begin as `pending` for human moderation.

The submission response returns a random 256-bit management token once, while the document stores only its SHA-256 hash. `GET /api/v1/references/submissions/:id` and `DELETE /api/v1/references/:id/submission` require that token in `X-Reference-Management-Token`; invalid ownership is intentionally indistinguishable from a missing record. Submission and ownership responses are `private, no-store`, submitter email remains private, and raw IP addresses are not persisted.

### ContactInquiry

Contact inquiries store name, private email, message, selected scope, budget band, status, and limited anti-abuse metadata. They are admin-only records. Status changes support an inbox workflow without turning inquiries into users.

### ProfilePost

`ProfilePost` is currently a singleton Home-section document in `profile_posts`, selected by the immutable unique key `home`. It stores plain text, an integer revision, the content-update date, and non-negative integer like/view counters. This deliberately does not invent a general article model before the future mini-blog is designed.

`ProfilePostLike` and `ProfilePostView` store the post reference, revision, and a non-selected visitor-token hash with a unique compound index. Views also store the last counted time. Updating the post to different text runs in a MongoDB transaction: the revision advances, the displayed date changes, aggregate counters return to zero, and previous interaction documents are removed atomically. Consequently this flow requires the replica-set transaction support supplied by Atlas.

### GitHubSnapshot

GitHub data is fetched server-side and cached under the singleton `portfolio` key in `github_snapshots`. Public output contains only repository count, language count, and the last successful check time. Internal state retains a single-page repository ETag, last attempt time, and an allowlisted failure code; provider response bodies and credentials are never persisted.

The REST adapter lists public owner repositories, excludes forks, validates every pagination and repository-language URL against `api.github.com`, and requests language breakdowns sequentially. A single-page list uses its ETag for conditional refresh. Paginated lists deliberately omit a partial validator. Snapshots become stale after six hours, at which point public reads return the existing value immediately and start one in-process background refresh. The authenticated refresh endpoint remains the explicit initialization and recovery mechanism. `GITHUB_TOKEN` is optional and server-only.

### MediaAsset

Media metadata is stored in the explicit `media_assets` collection, separately from domain documents. `kind` distinguishes images from documents while legacy records without the persisted field remain image-compatible. The model stores provider, unique provider asset ID, HTTPS delivery URL, provider resource type, format, integer dimensions, byte size, accessible label, lifecycle state, and timestamps. For Cloudinary, the provider asset ID is the immutable `asset_id`, not the renameable public ID. Images are limited to 10 MB and 10,000 pixels per dimension; the current document flow accepts only PDF up to 5 MB. Binary files are not stored in MongoDB.

Admin serializers return kind, delivery URL, and presentation metadata while omitting the provider asset ID. Media lists use descending creation time and `_id` plus page-based pagination. Detail responses include project usage and whether the Site Profile currently references the asset as its resume or avatar. Project publication and public identity assignment accept only active image-kind assets.

## Media Strategy

Cloudinary Free is the initial media provider. The admin frontend requests a signed upload descriptor from the backend and uploads directly to Cloudinary. Each descriptor fixes a unique managed public ID, prevents overwrite, applies a flow-specific format allowlist and application tag, and uses SHA-256 signing. Images use `portfolio/images/`; resume PDFs use `portfolio/documents/resume/`. The API secret never reaches the browser. Cloudinary Free requires PDF delivery to be enabled once in product-environment Security settings.

After upload, the frontend sends only the provider name, returned immutable asset ID, and, for normal media registration, alt text. The backend fetches authoritative metadata from Cloudinary's Admin API instead of trusting a browser-provided URL, format, dimensions, or byte count. Resume registration owns its fixed accessible label and filename. Repeated registration of the same provider asset is idempotent.

Deletion first checks project logo, Home preview, screenshot, active Site Profile resume, and active Site Profile avatar references. A referenced asset returns `409`. An unused asset is persisted as `pendingDeletion` before the provider call; its MongoDB metadata is removed only after Cloudinary reports deletion or that the provider asset is already absent. A failed provider request leaves the pending record available for retry.

Application code accesses storage through a small provider-neutral media service so Cloudinary can later be replaced by Cloudflare R2 or another provider without rewriting controllers or schemas.

Public serializers ask that service for named `avatar`, `logo`, `homePreview`, or `screenshot` delivery presets. The Cloudinary adapter turns those presets into bounded automatic-format and automatic-quality transformations. The resume uses a separate attachment preset and is exposed only through the stable backend redirect. Public responses contain no provider asset ID or provider lifecycle metadata.

Initial approved project content is bootstrapped by the interactive `projects:import` script from a versioned manifest and ignored local PNG sources. Its dry-run validates content and media offline. Apply mode authenticates as the owner and uses the same Auth, Media, and Projects HTTP contracts as the future admin UI, including signed direct provider uploads and server-side publication validation; it does not write directly to MongoDB or Cloudinary. An ignored owner-only resume file tracks content hashes and registered IDs, while superseded media remains subject to the normal explicit media lifecycle.

To preserve the free tier:

- prefer WebP/AVIF delivery and automatic quality selection;
- define a small fixed set of transformation presets;
- enforce file type, dimension, and byte limits;
- avoid video unless it becomes a real requirement;
- use responsive loading and lazy loading in the frontend;
- remove orphaned uploads safely;
- monitor usage and plan migration before sustained usage reaches roughly 70–80% of the allowance.

## Security Baseline

Before the production API is publicly launched:

- install and configure Helmet;
- restrict CORS to explicit configured origins and enable credentials only where required;
- apply global and route-specific rate limits;
- validate request bodies, path parameters, and query parameters at the API boundary;
- reject unknown writable fields;
- cap JSON, form, and media metadata payload sizes;
- protect admin mutations with authentication and origin checks;
- prevent caching of authentication and admin responses with `Cache-Control: private, no-store`;
- keep public and admin serializers separate;
- redact sensitive fields from logs and errors;
- use constant-time comparisons where tokens are checked;
- expire sessions and management tokens;
- configure trusted proxies deliberately for Render;
- add anti-spam protection to public forms before launch.

Secrets live only in local `.env` files and hosting-provider environment settings. Logs must never contain passwords, cookie values, authorization values, Cloudinary signatures, GitHub tokens, connection strings, complete contact messages, or private reference emails.

## Validation and Serialization

Production input schemas are route-specific. Create and update operations use explicit allowlists rather than passing request bodies directly to Mongoose. Public submission schemas are separate from admin update schemas.

Mongoose validation remains a persistence safeguard, not the only API validation layer. Domain services enforce cross-document rules. Serializers explicitly select response fields for each audience instead of relying on one generic document transform to define privacy.

## External Services and Failure Behavior

- MongoDB Atlas is the source of truth and uses the `portfolio` database.
- Vercel hosts the frontend and proxies relative `/api` requests to Render through an external rewrite.
- Render hosts the backend; its direct health endpoint remains available for platform monitoring.
- Cloudinary stores media binaries; MongoDB stores their metadata and relationships.
- GitHub is an eventually consistent enrichment source; stale cached data remains usable during GitHub outages.
- Email delivery, if later added for contact notifications or reference verification, must be hidden behind a service interface and must not block persistence when asynchronous delivery is appropriate.

External failures return safe API errors and retain enough non-sensitive diagnostic context in server logs. Retriable work must be idempotent.

## Testing Strategy

Each production feature requires:

- controller/HTTP contract tests for success, validation, authorization, serialization, and failure paths;
- model tests for schema validation, indexes, hooks, and sensitive-field behavior;
- service tests for authentication, moderation, counters, GitHub caching, and media-provider boundaries;
- selected integration tests against a controlled MongoDB database;
- manual deployed smoke tests for CORS, cookies, Atlas, Cloudinary, and the frontend origin.

The immutable supplied Postman collection remains relevant only to the frozen assignment branch. A separate production collection may be added for `/api/v1`.

## Implementation Order

1. Establish `/api/v1`, production configuration validation, Helmet, CORS/origin policy, rate limiting, request validation conventions, and public/admin serializers.
2. Implement `AdminUser`, `AdminSession`, one-time admin provisioning, login/session/logout, and admin authorization tests.
3. Migrate projects and services to production schemas and public/admin endpoints.
4. Implement reference submission, privacy-safe serialization, moderation, ownership deletion, and abuse controls.
5. Implement site profile and contact inquiries.
6. Implement Cloudinary-backed media management and attach managed assets to content.
7. Implement profile posts and real like/view interactions.
8. Implement cached GitHub integration.
9. Add deployed integration checks, production API documentation, operational cleanup, and launch review.

Every stage must preserve a runnable application, pass lint and tests, update `AGENTS.md` when decisions change, and avoid deploying incomplete administrative access controls publicly.
