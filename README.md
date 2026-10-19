# Confident Developer Backend

REST API for the Confident Developer portfolio and COMP229 Assignment 2.

## Stack

- Node.js 22
- Express 5
- MongoDB Atlas
- Mongoose
- ESLint
- Node.js test runner

## Local setup

1. Use Node.js 22 (`nvm use`).
2. Install dependencies with `npm install`.
3. Copy `.env.example` to `.env` and replace the MongoDB Atlas placeholders.
4. Ensure the MongoDB connection string selects the `portfolio` database.
5. Keep `ENABLE_COURSEWORK_API=false` for production development.
6. Add all three `CLOUDINARY_*` values when testing media uploads; never commit them.
7. Set `GITHUB_USERNAME` to the public portfolio account. `GITHUB_TOKEN` is optional and must remain secret.
8. Set `TURNSTILE_SECRET_KEY` when testing reference submissions. Cloudflare's official test secret is suitable locally but is rejected in production.
9. Set `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, and `CONTACT_NOTIFICATION_TO_EMAIL` together to enable contact email delivery. The sender must belong to a domain accepted by Resend.
10. Start the development server with `npm run dev`.

The API listens on port `3000` by default. Check it at `GET /api/health`.

## Deployment

The coursework backend is deployed on Render:

- Health check: https://confident-developer-backend.onrender.com/api/health
- API base URL: https://confident-developer-backend.onrender.com/api

The free Render instance may require a short cold start after a period of inactivity.

## Commands

```text
npm run dev    Start the server with Node watch mode
npm start      Start the server normally
npm run lint   Run ESLint
npm test       Run the Node.js test suite
npm run admin:create  Interactively provision the single production administrator
npm run projects:import -- --dry-run  Validate the local project import without network access
npm run projects:import  Interactively import the approved projects through the Admin API
npm run services:import -- --dry-run  Validate the local service import without network access
npm run services:import  Interactively import the approved services through the Admin API
```

## Assignment references

The assignment PDF and supplied Postman collection are stored under `docs/assignment` and `postman`. The supplied collection must remain unchanged for grading.

## Production API

New portfolio endpoints live under `/api/v1`. `GET /api/v1` reports that the versioned API is available. The application applies security headers, an API rate limit, explicit payload limits, and an allowlist from `CLIENT_ORIGINS`.

The production architecture and planned endpoint boundaries are documented in `docs/architecture/production-backend.md`.

Public project endpoints are:

- `GET /api/v1/projects`
- `GET /api/v1/projects?placement=home`
- `GET /api/v1/projects/:slug`

They return only published projects. The collection is ordered for the Projects page by default, while `placement=home` returns featured Home projects in their configured order. The common project representation includes `themeColor` for the existing brand treatment and `projectsPageTheme.tabColor` plus `projectsPageTheme.panelColor` for Projects-page chrome; the frontend derives the translucent browser frame from `tabColor`. Detail lookup uses the public slug rather than a MongoDB ID and adds `scope` plus ordered screenshots. Successful public responses are briefly cacheable by shared CDNs; validation and not-found errors are not.

Public service endpoints are:

- `GET /api/v1/services`
- `GET /api/v1/services?placement=home`

They return only published services. The default collection uses Services-page order, while Home placement filters featured services and uses its own configured order. Icon and tone values are stable keys for frontend-owned SVG and CSS mappings; the API never returns frontend asset paths or color literals.

The public GitHub summary endpoint is:

- `GET /api/v1/github-summary`

It returns the latest MongoDB snapshot of non-fork public repository count and unique reported language count. Public rendering never waits on GitHub. A stale snapshot is returned immediately while one background refresh begins; a missing initial snapshot returns `503` until an administrator refreshes it.

Public Profile Post endpoints are:

- `GET /api/v1/profile-post`
- `GET /api/v1/profile-post/interaction?revision=<number>`
- `PUT /api/v1/profile-post/like`
- `DELETE /api/v1/profile-post/like`
- `POST /api/v1/profile-post/view`

The public post contains the current text, revision, content date, and real like/view counters. Like and view bodies contain the rendered `revision`. Anonymous interactions use a host-only `HttpOnly` visitor cookie; likes are idempotent and views are counted at most once per visitor in 24 hours. Mutation and personalized interaction responses are never cached.

Public profile endpoints are:

- `GET /api/v1/profile`
- `GET /api/v1/profile/resume`

The profile endpoint returns only the configured public display name, handle, and optimized avatar representation. The resume endpoint returns a short-cacheable redirect to the current managed PDF attachment on the media CDN. Frontend code should use these stable relative APIs rather than storing or constructing Cloudinary URLs.

Public reference endpoints are:

- `GET /api/v1/references`
- `POST /api/v1/references`
- `GET /api/v1/references/submissions/:id`
- `DELETE /api/v1/references/:id/submission`

Only approved references appear in the public list. When their total count is zero, the response may include the configured profile-backed `emptyState`; otherwise that property is `null`. New submissions always begin as pending and require normalized profile fields, three ratings, the empty honeypot field `website`, and a valid Turnstile token. The frontend must retain the one-time `managementToken` returned by POST and send it as `X-Reference-Management-Token` when retrieving or deleting that submission. Submission and deletion also require the configured frontend `Origin`; private email is never returned by public endpoints.

The public contact endpoint is:

- `POST /api/v1/contact`

It accepts required `name`, `email`, `message`, `scopes`, and `budget` fields plus a Turnstile token and the empty `website` honeypot. Scope is a non-empty unique array of stable allowlisted keys, while budget is one allowlisted key. The endpoint requires the configured frontend `Origin`, permits five attempts per IP per hour, rejects the same normalized email/message fingerprint for 24 hours, and returns no inquiry data. Every accepted inquiry and its pending owner-notification outbox record are committed in one Atlas transaction. Contact messages and email addresses remain private and are not available through any public read endpoint.

Admin authentication endpoints are:

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/logout`

There is no public signup. Run `npm run admin:create` in an interactive local terminal to provision the single owner account against the configured Atlas database. Never pass its password through command arguments or environment variables.

Authenticated contact inbox endpoints are:

- `GET /api/v1/admin/inquiries`
- `GET /api/v1/admin/inquiries/:id`
- `PATCH /api/v1/admin/inquiries/:id/status`
- `POST /api/v1/admin/inquiries/:id/replies`
- `POST /api/v1/admin/inquiries/:id/owner-notification/retry`
- `POST /api/v1/admin/inquiries/:id/replies/:replyId/retry`
- `DELETE /api/v1/admin/inquiries/:id`

The inbox list supports strict page-based pagination and an optional `new`, `read`, `replied`, or `archived` status filter. Opening detail is read-only; the frontend explicitly sends the `read` action when an inquiry is actually opened. Status actions also support idempotent `archive` and `restore`, while permanent deletion is allowed only after archiving. Email and message are available only through these authenticated representations, and the submission fingerprint is never returned. Admin representations include the allowlisted owner-notification state; historical inquiries without a job return `ownerNotification: null`. Inquiry detail also contains the ordered private history of administrator replies and their delivery state.

Creating a reply requires a trusted origin, a strict `{ "message": "..." }` body, and a UUID `Idempotency-Key` header. The reply and its outbox envelope commit in one Atlas transaction and return `201` without waiting for Resend. A newly queued reply marks a new inquiry read; only provider acceptance moves an active inquiry to `replied`. Archived inquiries must be restored before another reply can be queued. Visitor replies go to the configured owner address through `Reply-To` but are not ingested into this API.

When the complete email configuration is present, an in-process worker sends both new-inquiry notifications and administrator replies through Resend and advances jobs through `processing` to `accepted`, retryable `pending`, or terminal `failed`. Without configuration, the worker stays disabled and durable jobs remain pending.

`EmailDelivery` keeps provider acceptance separate from the recipient outcome (`unknown`, `delayed`, `delivered`, `bounced`, or `complained`). A configured `POST /api/v1/webhooks/resend` endpoint verifies the untouched request body with `RESEND_WEBHOOK_SECRET`, deduplicates signed events, and reconciles delivery by private provider identity or a non-personal delivery tag. The admin detail exposes only allowlisted delivery dates and state. Failed jobs other than missing-source failures can be transactionally requeued through the two retry endpoints; both require a UUID `Idempotency-Key`, and archived inquiries must be restored first. Bounce and complaint outcomes are never automatically retried.

To activate delivery outcomes in production, create a Resend webhook for `email.sent`, `email.delivery_delayed`, `email.delivered`, `email.bounced`, and `email.complained`, point it to the deployed `/api/v1/webhooks/resend` URL, and set its `whsec_...` signing secret as `RESEND_WEBHOOK_SECRET`. The route is unavailable when that secret is omitted.

Authenticated project management endpoints are:

- `POST /api/v1/admin/projects`
- `GET /api/v1/admin/projects`
- `GET /api/v1/admin/projects/:id`
- `PATCH /api/v1/admin/projects/:id`
- `DELETE /api/v1/admin/projects/:id`

Project writes require the configured frontend `Origin`. Deleting a project does not delete its referenced media assets or provider files.

Authenticated service management endpoints are:

- `POST /api/v1/admin/services`
- `GET /api/v1/admin/services`
- `GET /api/v1/admin/services/:id`
- `PATCH /api/v1/admin/services/:id`
- `DELETE /api/v1/admin/services/:id`

The authenticated GitHub refresh endpoint is:

- `POST /api/v1/admin/github/refresh`

It initializes or explicitly refreshes the snapshot. The optional GitHub token stays server-side, provider errors retain the last successful public counts, and admin responses are never cached.

Authenticated Profile Post endpoints are:

- `GET /api/v1/admin/profile-post`
- `PUT /api/v1/admin/profile-post`

The `PUT` body is `{ "text": "..." }`. Replacing the text creates a new revision, updates its displayed date, and transactionally resets likes and views. Sending the existing text is a no-op.

Authenticated profile management endpoints are:

- `GET /api/v1/admin/profile`
- `PUT /api/v1/admin/profile`
- `POST /api/v1/admin/profile/resume/upload-signature`
- `GET /api/v1/admin/profile/resume`
- `PUT /api/v1/admin/profile/resume`

The root profile endpoints manage the public display name, handle, and active image avatar as one complete identity. The resume upload descriptor permits only a managed PDF up to 5 MB. After direct browser upload, `PUT` registers authoritative provider metadata and assigns the document as the singleton profile resume. Replaced avatar and resume assets remain in the media library until explicitly deleted when unused.

Authenticated reference section settings endpoints are:

- `GET /api/v1/admin/references/settings`
- `PUT /api/v1/admin/references/settings`

The strict PUT body contains only `emptyStateMessage`. Its date changes only when normalized text changes. The public References response emits the composed message and public profile identity only while no approved references exist.

Authenticated media management endpoints are:

- `POST /api/v1/admin/media/upload-signature`
- `POST /api/v1/admin/media`
- `GET /api/v1/admin/media`
- `GET /api/v1/admin/media/:id`
- `PATCH /api/v1/admin/media/:id`
- `DELETE /api/v1/admin/media/:id`

Uploads go directly from the browser to Cloudinary using a backend-generated signature. The backend then verifies authoritative Cloudinary metadata before registration. Media assets distinguish images from documents; project media remains image-only, while the profile resume accepts only PDF. Media operations return `503` until `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are configured together.

## Initial project content import

The versioned manifest in `scripts/project-import-manifest.js` maps the approved Unicon, SuperSauced, and DomSot content to local PNG files under the ignored `makets/project-assets` directory. Run the offline dry-run first to validate every payload, path, PNG header, dimension, size, and content hash without contacting the API.

The apply command requires an interactive terminal, a running configured API, and the existing administrator credentials. It signs in through the Auth API, uploads media through the Media API, and creates or updates drafts through the Projects API; it never writes directly to MongoDB or Cloudinary. Login rotates the administrator's existing session. Separate confirmations guard remote changes and final publication, and credentials are neither accepted as command arguments nor written to disk.

Interrupted runs resume from `output/project-import-state.json`, which is ignored by Git and written with owner-only permissions. The state retains content hashes and registered media IDs, preserves stable nested project IDs on updates, and records superseded assets for later review without deleting them automatically. Use `--base-url` and `--origin` to target a deployed API; non-local targets must use HTTPS.

## Initial service content import

The service manifest in `scripts/service-import-manifest.js` contains the approved Product & UI/UX Design, Mobile Development, Web Development, and Backend & Architecture Home content. Its dry-run validates all content, presentation keys, and unique ordering without network access. Apply mode uses the authenticated Services API, updates records by slug, prepares all records as drafts, and asks separately before publication. As with project import, login rotates the existing administrator session and credentials are never accepted through command arguments or stored on disk.

## Coursework API

The Assignment 2 branch retains complete CRUD endpoints at:

- `/api/references`
- `/api/projects`
- `/api/services`
- `/api/users`

Each resource supports `GET` and `POST` on the collection and `GET`, `PUT`, and `DELETE` on `/:id`. Public documents use `id` instead of MongoDB internals. User passwords are hashed before storage and never included in responses.

On `main`, these unversioned routes are disabled by default. Set `ENABLE_COURSEWORK_API=true` only when explicitly running the legacy assignment contract. The grading deployment remains pinned to the frozen `assignment-2` branch.

The API accepts the alternate name casing used by the supplied Postman collection. It also supplies compatibility values for the collection's omitted reference testimonial and project image while the database schemas continue to enforce the complete assignment model.
