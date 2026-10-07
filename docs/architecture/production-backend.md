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

Planned routes:

```text
GET /api/v1/profile
GET /api/v1/projects
GET /api/v1/projects/:slug
GET /api/v1/services
GET /api/v1/services/:slug
GET /api/v1/references
GET /api/v1/posts
GET /api/v1/posts/:slug
GET /api/v1/github-summary
```

Only published projects, services, posts, and approved references are returned. List responses expose only the fields needed by their cards; detail routes may expose richer public fields.

### Public write routes

Planned routes:

```text
POST   /api/v1/references
DELETE /api/v1/references/:id/submission
POST   /api/v1/contact
POST   /api/v1/posts/:id/likes
DELETE /api/v1/posts/:id/likes
POST   /api/v1/posts/:id/views
```

Reference submissions always start in `pending` state. A submitter's email is used only for verification and management and is never returned by public reference routes. The frontend must state:

> Your email is used only to verify and manage your reference. It will never be displayed on the site.

A reference deletion-management token is returned only at submission time; only its hash is stored. Contact inquiries and reference submissions are rate-limited, size-limited, validated, and protected by a configurable anti-spam challenge before launch.

Likes and views represent recorded interactions, not decorative seed values. An anonymous first-party visitor identifier may be stored in a secure cookie and only a one-way derivative is persisted. Likes are idempotent per post and visitor. Views are deduplicated within a defined time window. Raw IP addresses are not stored for analytics.

### Authentication routes

Planned routes:

```text
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/auth/session
```

The portfolio uses a single-owner admin model; it has no public signup or user-management API. The initial admin is provisioned by a local one-time script against Atlas, never through a public bootstrap route.

Authentication uses a high-entropy opaque session token in an `HttpOnly`, `Secure` cookie. Only a hash of the token is stored in an `AdminSession` document. Sessions are revocable, expire automatically through a TTL index, and are rotated after login. Unsafe cookie-authenticated requests require an approved `Origin`; cookie `SameSite` behavior and CORS credentials must match the final frontend/API domains.

### Admin routes

All `/api/v1/admin/*` routes require a valid admin session. Planned route families are:

```text
/api/v1/admin/profile
/api/v1/admin/projects
/api/v1/admin/services
/api/v1/admin/references
/api/v1/admin/inquiries
/api/v1/admin/posts
/api/v1/admin/github
/api/v1/admin/media
```

Admin serializers may include private operational fields, but never password hashes, raw session tokens, deletion-token hashes, or storage-provider secrets.

## Data Model Direction

Schemas will be extended incrementally as their endpoints are implemented. Fields listed here define the intended boundaries; exact limits and optionality belong in the implementation and tests.

### AdminUser and AdminSession

`AdminUser` stores normalized email, display name, password hash, active state, and login timestamps. It does not accept a client-controlled role. `AdminSession` stores the admin reference, token hash, expiration, last-used time, and limited audit metadata.

### SiteProfile

A singleton document stores public identity, hero copy, biography, location, availability, social links, education, current work, contact CTA, and references to managed portrait/resume assets. Public and admin serializers are separate.

### Project

Projects retain the coursework title, completion date, description, and image intent while gaining a stable unique slug, publication state, homepage/main-project flags, display order, client or product label, roles, date range, summary and long-form content, logo, screenshots, build-breakdown items, technology labels, and validated external links.

Only one project may be designated as the main project. Business rules that cannot be guaranteed by a simple index belong in a service and transaction where supported.

### Service

Services gain a stable unique slug, publication state, display order, short and long descriptions, icon key, color/theme metadata, capability items, tool labels, media, and references to related projects.

### Reference

References store the author's public name, company, position, testimonial, three bounded ratings, private normalized email, moderation status, display order, submission metadata, and a hashed deletion-management token. Valid states are `pending`, `approved`, and `rejected`. Public serializers expose only approved content and never expose email or moderation internals.

### ContactInquiry

Contact inquiries store name, private email, message, selected scope, budget band, status, and limited anti-abuse metadata. They are admin-only records. Status changes support an inbox workflow without turning inquiries into users.

### ProfilePost

Posts store a stable unique slug, title, excerpt, body, publication state/date, display metadata, optional cover asset, tags, and denormalized like/view counters. Interaction records enforce idempotency and allow counters to be reconciled.

### GitHubSnapshot

GitHub data is fetched server-side and cached as a snapshot with source timestamps and refresh/error metadata. Public requests read the cache rather than calling GitHub directly. Refresh uses stale-while-revalidate behavior plus an authenticated manual refresh, so the feature does not depend on an always-awake free worker. A GitHub token is optional and remains server-only.

### MediaAsset

Media metadata is stored separately from domain documents: provider, provider asset ID, secure URL, resource type, dimensions, bytes, format, alt text, ownership/usage metadata, and lifecycle state. Binary files are not stored in MongoDB.

## Media Strategy

Cloudinary Free is the initial media provider. The admin frontend requests a short-lived signed upload payload from the backend and uploads directly to Cloudinary. The API secret never reaches the browser. The backend validates and persists the returned asset metadata and owns deletion.

Application code accesses storage through a small provider-neutral media service so Cloudinary can later be replaced by Cloudflare R2 or another provider without rewriting controllers or schemas.

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
