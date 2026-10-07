# AGENTS.md

## Project Overview

This repository contains the production backend for the Confident Developer portfolio and the backend deliverable for COMP229 Assignment 2.

The application uses Node.js, Express, Mongoose, and MongoDB Atlas. Coursework requirements are a mandatory subset of the production backend. Satisfy the supplied PDF and Postman collection while extending the system cleanly for the real portfolio.

The React, TypeScript, and Vite frontend lives in a separate repository. Do not add frontend components, browser styling, or Vite application code here.

## Sources of Truth

- `docs/assignment/Assignment 2- Backend CRUD with MongoDB.pdf` defines the coursework rubric.
- `postman/Assignment 2.postman_collection.json` defines the supplied request sequence and payloads.
- The approved portfolio designs define the additional data needed by the production UI.
- `docs/architecture/production-backend.md` defines the approved production API direction, access boundaries, data ownership, and implementation order.
- When the PDF and Postman payloads differ, preserve the required PDF fields while accepting and normalizing the supplied Postman payloads.
- Do not modify the supplied Postman collection. Add separate tests when more coverage is required.

## General Principles

- Prefer clear, maintainable modules over unnecessary abstractions.
- Keep controllers, models, routes, middleware, services, configuration, and utilities focused on one responsibility.
- Avoid duplicated validation, serialization, error handling, and response construction.
- Use descriptive, contextual names.
- Add dependencies only when they provide concrete value.
- Keep assignment compatibility while designing for production use.
- Do not place secrets, credentials, or environment-specific URLs in source code.

## Runtime and Modules

- Use Node.js 22 and npm.
- Use ECMAScript modules.
- Keep `server.js` in the backend root as the application entry point.
- The assignment server uses port `3000` by default.
- Use the built-in Node.js watch mode for local development; do not add nodemon without a concrete need.

## Application Structure

- `server.js`: load environment configuration, connect to MongoDB, start HTTP, and handle graceful shutdown.
- `src/app.js`: configure Express and register middleware and routes.
- `src/config`: environment and database configuration.
- `src/modules`: production feature modules. Keep feature-specific models, services, controllers, routes, validation, and serializers together.
- `src/modules/projects`: the production Projects module. Its shared `PortfolioProject` model is at the module root and protected write behavior is under `admin`.
- `src/modules/media`: the production Media module. Shared asset persistence and lifecycle services live at the module root, provider adapters live under `providers`, and protected HTTP delivery lives under `admin`.
- `src/controllers`, `src/models`, `src/routes`, `src/services`, `src/validation`, and `src/utils`: coursework compatibility code and production features not yet moved during the incremental feature-first refactor. Do not add new production feature files to these legacy layer directories.
- `src/middleware`: shared Express middleware and error handling.
- `test`: automated tests.
- `docs/assignment`: immutable coursework reference files.
- `postman`: supplied and project-owned API collections.

Do not create empty placeholder modules. Add a directory or file when it gains a concrete responsibility.

Production modules use direct imports rather than barrel files. A module may separate `admin` and `public` delivery code while keeping domain models shared at the module root. Structural moves must preserve API behavior and pass the complete test suite before the next feature is migrated.

The four coursework controllers are configured through `src/utils/crud-controller.js`, and the four routers use `src/routes/create-resource-router.js`. Keep the resource-specific controller and router modules even when behavior is shared. API-boundary normalization belongs in `src/utils/input-normalizers.js`; public Mongoose serialization belongs in `src/utils/schema-options.js`.

## Express

- Configure `http-errors`, Morgan, and CORS as required by the assignment.
- Production `/api/v1` uses Helmet, explicit credential-aware CORS origins, explicit body limits, and a shared IP rate limiter with standard rate-limit headers.
- Load and validate runtime settings through `src/config/environment.js`. Production requires explicit `CLIENT_ORIGINS`; configure `TRUST_PROXY` as a hop count instead of broadly trusting forwarded addresses.
- Keep the unversioned coursework routers disabled by default on `main`; `ENABLE_COURSEWORK_API=true` is an explicit compatibility mode.
- Register the global error handler after all routes and other middleware.
- Disable unnecessary framework-identifying headers.
- Keep request body limits explicit.
- Use conventional HTTP status codes and JSON responses.
- Validate production request bodies, path parameters, and query parameters with the shared Zod middleware. Controllers consume `request.validated`; use strict route schemas to reject unknown writable fields.
- Keep controllers thin when business logic becomes substantial.
- Return a consistent error shape and never leak production stack traces.
- Treat Mongoose validation and casting failures as client errors with status `400`; keep messages field-specific but do not expose rejected values or model internals.

## MongoDB and Mongoose

- Use MongoDB Atlas through Mongoose.
- The database selected by `MONGODB_URI` must be named `portfolio`.
- Keep the connection string in `.env`; commit only `.env.example`.
- Log a successful database connection as required by the assignment.
- Configure schemas deliberately with validation, timestamps, indexes, and serialization appropriate to each resource.
- Use current Mongoose query options such as `returnDocument: 'after'` instead of deprecated aliases.
- Return public `id` properties rather than MongoDB `_id` fields.
- Never expose `__v` or internal persistence details through the public API.
- Normalize alternate input property names at the API boundary instead of storing duplicate fields.

## Required Coursework Resources

Maintain separate models, controllers, and routers with complete CRUD operations for:

- `references`: required fields `name`, `testimonial`, `position`, and `company`.
- `projects`: required fields `title`, `completion`, `description`, and `image`.
- `services`: required fields `title` and `description`.
- `users`: required fields `firstname`, `lastname`, `email`, `password`, `created`, and `updated`.

Required route families:

- `/api/references`
- `/api/projects`
- `/api/services`
- `/api/users`

Each route family provides POST and GET collection operations plus GET, PUT, and DELETE operations at `/:id`.

## Required API Contract

- Create and get-by-ID responses include `success`, `message`, and `data`.
- Update and delete responses include `success` and `message`.
- Get-all responses include `success`, `message`, and a `data` array.
- Returned resource objects expose `id`, not `_id`.
- The supplied Postman collection relies on `data.id` after create operations and the final item in each get-all `data` array.
- Make list ordering deterministic so the supplied sequential CRUD flow remains reliable.
- Some Postman bodies omit PDF fields or provide aliases such as `firstname` and `firstName`. Accept and normalize the collection payloads without weakening production validation unnecessarily.

Current compatibility decisions:

- List endpoints sort by ascending MongoDB `_id`, which keeps ordering deterministic and places newly created Postman records last in the normal sequential flow.
- Reference input accepts `firstname`/`firstName` and `lastname`/`lastName`, derives `name` from them, and creates an explicit compatibility testimonial only when the supplied legacy create shape includes both a derived name and email.
- Project create input uses `/images/project-placeholder.webp` when the supplied Postman payload omits the required `image`; partial updates preserve the existing image.
- User input accepts both name casing variants. Passwords must contain 8–72 UTF-8 bytes, are hashed with bcrypt before persistence, use `select: false`, and are also removed by public serialization.
- PUT requests are partial updates for supplied Postman compatibility and reject empty update bodies.

## Production Extensions

- Treat coursework fields as the minimum schema rather than the complete product model.
- Put all new production endpoints under `/api/v1`; keep `GET /api/health` unversioned for hosting health checks.
- Host the frontend on Vercel and proxy relative `/api` requests to the Render backend with an external rewrite. Browser code must not call the `onrender.com` origin directly. Mirror the relative `/api` topology with the Vite development proxy in the frontend repository.
- Treat the unversioned coursework CRUD as a frozen assignment contract, not as the production security model. Remove it from `main` or place it behind an explicit development-only compatibility switch once production replacements exist.
- All portfolio content must be manageable through the authenticated admin API. There is one owner administrator, no public signup, and no production user-management CRUD.
- Production projects use their own collection and require configurable Home selection, primary-project selection, separate Home/Projects-page ordering, individual theme colors, logos, Home previews, screenshots, a displayed position, date ranges, build breakdowns, and external links.
- References will require three ratings, moderation state, pagination, deletion ownership, and abuse prevention. New submissions start pending. Submitter email is private and must never appear in public responses.
- Services will require display order and UI metadata such as icons and colors.
- Contact inquiries, profile posts, GitHub data, media assets, likes, and views remain separate concerns rather than being forced into the four coursework resources.
- Profile posts form a first-party personal mini-blog. Likes and views record real, idempotent or time-deduplicated interactions rather than decorative seed values.
- Fetch GitHub data through the backend and persist a cache snapshot; public frontend requests must not depend on a live GitHub request.
- Use Cloudinary Free initially through a provider-neutral media service. Use signed direct browser uploads, keep secrets server-side, store only media metadata in MongoDB, and constrain formats, transformations, and upload sizes.
- Extend schemas and contracts incrementally when the associated product feature is implemented.

Current project persistence decisions:

- `PortfolioProject` uses the explicit `portfolio_projects` collection and never shares the coursework `projects` collection.
- `MediaAsset` uses `media_assets`; project documents reference media by ObjectId and do not embed provider URLs or binary data.
- Draft projects require slug and title. Publication requires tagline, summary, complete Projects-page content, and media; featured publication additionally requires Home preview media and breakdown data.
- `themeColor` stores the individual project's normalized six-digit HEX color. It does not represent a role, service, or technology category.
- `position` is the single role label displayed by the approved design. Technologies are not stored on projects.
- Build-breakdown percentages are independent integers from 0 to 100 and are not required to sum to 100.
- Build-breakdown, link, and screenshot entries use stable Mongoose subdocument IDs. Their MongoDB array position is the display-order source of truth; do not add per-item order fields.
- Admin project PATCH treats each supplied nested array as its complete next state. Existing entries retain identity through `id`, new entries omit it, omitted entries are removed, and duplicate or unknown IDs are rejected before saving.
- Project links use `icon` with the allowlist `github`, `website`, `app-store`, and `external`; all project link URLs must use HTTPS.
- Protected project CRUD is available at `/api/v1/admin/projects` and `/:id`. Create and update accept strict allowlisted payloads; list optionally filters by status and sorts by descending creation time and `_id`.
- Home supports at most three published featured projects and one published primary project. The database enforces primary uniqueness; the project service enforces the three-project limit and replaces the current primary inside a MongoDB transaction. Disabling featured placement clears primary automatically, while explicitly requesting primary without featured is rejected.
- Every referenced media document must exist with `active` status when a project is saved. `publishedAt` is server-owned and is assigned on first publication.
- Deleting a project deletes only its document. It never deletes referenced `MediaAsset` documents or provider files; media lifecycle is managed separately.
- `projectsPageOrder` is distinct from Home order; avoid the ambiguous name `archiveOrder` because `archived` is also a publication state.

Current media decisions:

- Protected media management is available under `/api/v1/admin/media`; it includes signed-upload descriptors, idempotent registration, paginated listing, usage-aware detail, alt updates, and explicit deletion.
- Cloudinary integration is isolated behind `src/modules/media/providers/cloudinary-media-provider.js`. Domain services and controllers consume the provider interface rather than importing the Cloudinary SDK.
- Signed browser uploads use unique managed public IDs, `overwrite=false`, SHA-256 signatures, an application tag, and an image-format allowlist. The API secret never appears in responses.
- `MediaAsset.providerAssetId` stores Cloudinary's immutable `asset_id`. Registration fetches authoritative metadata through the provider instead of trusting URL, dimensions, format, or byte counts from the browser.
- Media lists use page-based pagination with default limit 24, maximum limit 100, and descending `createdAt`/`_id` ordering.
- Admin media serializers expose the delivery URL and useful metadata but omit provider asset IDs and persistence internals.
- Media deletion is blocked while any project references the asset. Unused assets become `pendingDeletion` before provider deletion; metadata is removed only after provider deletion succeeds or reports the asset already absent.
- Cloudinary environment values are optional as a complete group so the application can start before provider setup. Media provider operations return `503` until all three values are configured.

## Security

- Never store plaintext passwords. Hash passwords and omit password hashes from every API response.
- Validate and sanitize all untrusted input on the server.
- Protect every `/api/v1/admin/*` route with authorization. Do not launch production with public administrative create, update, or delete operations.
- Use a separately modeled `AdminUser`; never accept a client-controlled role and never provide a public admin bootstrap or signup endpoint.
- Use revocable opaque admin sessions in host-only `HttpOnly` cookies and store only session-token hashes. Production cookies use `Secure` and `SameSite=Lax` through the same-origin Vercel rewrite; do not set `Domain`. Expire sessions with a TTL index and verify exact approved origins for unsafe cookie-authenticated requests.
- Send `Cache-Control: private, no-store` on authentication and admin responses. Do not enable Vercel caching for session-specific routes.
- Provision the initial administrator with a local one-time script against Atlas, without placing the password in source code, command history, or logs.
- Public submission endpoints require rate limiting, payload limits, spam protection, and a moderation strategy.
- Restrict CORS to configured frontend origins.
- Keep public and admin serializers separate. Public serializers must use explicit field allowlists and exclude private email addresses and moderation metadata.
- Do not log credentials, tokens, password values, or complete sensitive request bodies.
- Avoid returning implementation details from errors.

Current authentication decisions:

- `AdminUser` is separate from the coursework `User`; its password hash uses bcrypt cost 12 and is excluded from queries by default.
- `AdminSession` stores only a SHA-256 token hash and expires through a TTL index. Login creates a 256-bit opaque token, revokes the administrator's previous sessions, and creates one seven-day session.
- Production uses the `__Secure-cd_admin_session` cookie; local development uses `cd_admin_session`. Both are `HttpOnly`, `SameSite=Lax`, scoped to `/api/v1`, and omit `Domain`; production additionally requires `Secure`.
- `POST /api/v1/auth/login`, `GET /api/v1/auth/session`, and `POST /api/v1/auth/logout` are the only authentication routes. There is no signup route.
- Login permits five failed attempts per IP in 15 minutes with the current in-memory limiter. Successful logins do not consume the failure allowance. Revisit the store before horizontally scaling the API.
- `npm run admin:create` is the only initial provisioning path. It requires an interactive terminal, hides password input, enforces 12 characters and the bcrypt 72-byte limit, and refuses to create a second administrator.

## Testing and Quality

- Use the Node.js test runner for automated tests unless a different tool has a concrete advantage.
- Test successful behavior, validation failures, missing records, malformed IDs, database failures, and response serialization.
- HTTP contract tests use isolated in-memory model adapters while retaining Mongoose document validation and serialization. They do not replace the required final verification against MongoDB Atlas.
- Run the supplied Postman collection against a clean or controlled database before taking submission screenshots.
- The supplied collection contains request-chaining scripts but no `pm.test` assertions. Keep it unchanged and add automated coverage separately.
- ESLint, automated tests, and relevant API checks must pass before a task is complete.
- Tests that exercise the frozen coursework contract must enable its routers explicitly when constructing the Express application.

## Git Workflow

- The submitted coursework is frozen at tag `assignment-2-submission` and branch `assignment-2`. Production work continues on `main`; keep the grading Render service pinned to `assignment-2`.
- Before every commit, review and update `AGENTS.md` so it reflects current architecture, API behavior, workflow requirements, and known constraints.
- If no update is needed, explicitly verify that `AGENTS.md` remains accurate before committing.
- Include relevant `AGENTS.md` changes in the same commit as the implementation that required them.
- Keep commits focused and make meaningful commits after major implementation stages, as required by the coursework.
- Do not commit `.env`, credentials, database dumps, generated logs, coverage output, or other secrets and runtime artifacts.
- Do not rewrite or discard user-authored changes.

## Before Finishing a Task

Always:

1. Run `npm run lint`.
2. Run `npm test`.
3. Exercise affected API contracts when database-backed behavior changes.
4. Confirm that the supplied Postman flow remains compatible.
5. Review and update `AGENTS.md` when decisions or requirements changed.
6. Avoid unrelated changes.
7. Summarize changed files, verification results, and important decisions.
