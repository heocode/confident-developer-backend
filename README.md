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
8. Start the development server with `npm run dev`.

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

They return only published projects. The collection is ordered for the Projects page by default, while `placement=home` returns featured Home projects in their configured order. Detail lookup uses the public slug rather than a MongoDB ID. Successful public responses are briefly cacheable by shared CDNs; validation and not-found errors are not.

Public service endpoints are:

- `GET /api/v1/services`
- `GET /api/v1/services?placement=home`

They return only published services. The default collection uses Services-page order, while Home placement filters featured services and uses its own configured order. Icon and tone values are stable keys for frontend-owned SVG and CSS mappings; the API never returns frontend asset paths or color literals.

The public GitHub summary endpoint is:

- `GET /api/v1/github-summary`

It returns the latest MongoDB snapshot of non-fork public repository count and unique reported language count. Public rendering never waits on GitHub. A stale snapshot is returned immediately while one background refresh begins; a missing initial snapshot returns `503` until an administrator refreshes it.

Admin authentication endpoints are:

- `POST /api/v1/auth/login`
- `GET /api/v1/auth/session`
- `POST /api/v1/auth/logout`

There is no public signup. Run `npm run admin:create` in an interactive local terminal to provision the single owner account against the configured Atlas database. Never pass its password through command arguments or environment variables.

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

Authenticated media management endpoints are:

- `POST /api/v1/admin/media/upload-signature`
- `POST /api/v1/admin/media`
- `GET /api/v1/admin/media`
- `GET /api/v1/admin/media/:id`
- `PATCH /api/v1/admin/media/:id`
- `DELETE /api/v1/admin/media/:id`

Uploads go directly from the browser to Cloudinary using a backend-generated signature. The backend then verifies authoritative Cloudinary metadata before registration. Media operations return `503` until `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, and `CLOUDINARY_API_SECRET` are configured together.

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
