# AGENTS.md

## Project Overview

This repository contains the production backend for the Confident Developer portfolio and the backend deliverable for COMP229 Assignment 2.

The application uses Node.js, Express, Mongoose, and MongoDB Atlas. Coursework requirements are a mandatory subset of the production backend. Satisfy the supplied PDF and Postman collection while extending the system cleanly for the real portfolio.

The React, TypeScript, and Vite frontend lives in a separate repository. Do not add frontend components, browser styling, or Vite application code here.

## Sources of Truth

- `docs/assignment/Assignment 2- Backend CRUD with MongoDB.pdf` defines the coursework rubric.
- `postman/Assignment 2.postman_collection.json` defines the supplied request sequence and payloads.
- The approved portfolio designs define the additional data needed by the production UI.
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
- `src/controllers`: HTTP request handlers for each resource.
- `src/models`: Mongoose schemas and models.
- `src/routes`: resource routers.
- `src/middleware`: shared Express middleware and error handling.
- `src/services`: business logic and external integrations when extracting it provides value.
- `src/utils`: small shared utilities such as serializers or response helpers.
- `test`: automated tests.
- `docs/assignment`: immutable coursework reference files.
- `postman`: supplied and project-owned API collections.

Do not create empty placeholder modules. Add a directory or file when it gains a concrete responsibility.

The four coursework controllers are configured through `src/utils/crud-controller.js`, and the four routers use `src/routes/create-resource-router.js`. Keep the resource-specific controller and router modules even when behavior is shared. API-boundary normalization belongs in `src/utils/input-normalizers.js`; public Mongoose serialization belongs in `src/utils/schema-options.js`.

## Express

- Configure `http-errors`, Morgan, and CORS as required by the assignment.
- Register the global error handler after all routes and other middleware.
- Disable unnecessary framework-identifying headers.
- Keep request body limits explicit.
- Use conventional HTTP status codes and JSON responses.
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
- Projects will require configurable Home selection, main-project selection, display order, logos, screenshots, roles, date ranges, build breakdowns, and external links.
- References will require ratings, moderation state, pagination, deletion ownership, and abuse prevention.
- Services will require display order and UI metadata such as icons and colors.
- Contact inquiries, profile posts, GitHub data, likes, and views should remain separate concerns rather than being forced into the four coursework resources.
- Extend schemas and contracts incrementally when the associated product feature is implemented.

## Security

- Never store plaintext passwords. Hash passwords and omit password hashes from every API response.
- Validate and sanitize all untrusted input on the server.
- Before production launch, protect administrative create, update, and delete operations with authorization even if coursework testing initially requires open CRUD endpoints.
- Public submission endpoints require rate limiting, payload limits, spam protection, and a moderation strategy.
- Restrict CORS to configured frontend origins.
- Do not log credentials, tokens, password values, or complete sensitive request bodies.
- Avoid returning implementation details from errors.

## Testing and Quality

- Use the Node.js test runner for automated tests unless a different tool has a concrete advantage.
- Test successful behavior, validation failures, missing records, malformed IDs, database failures, and response serialization.
- HTTP contract tests use isolated in-memory model adapters while retaining Mongoose document validation and serialization. They do not replace the required final verification against MongoDB Atlas.
- Run the supplied Postman collection against a clean or controlled database before taking submission screenshots.
- The supplied collection contains request-chaining scripts but no `pm.test` assertions. Keep it unchanged and add automated coverage separately.
- ESLint, automated tests, and relevant API checks must pass before a task is complete.

## Git Workflow

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
