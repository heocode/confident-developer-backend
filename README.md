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
6. Start the development server with `npm run dev`.

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
```

## Assignment references

The assignment PDF and supplied Postman collection are stored under `docs/assignment` and `postman`. The supplied collection must remain unchanged for grading.

## Production API

New portfolio endpoints live under `/api/v1`. `GET /api/v1` reports that the versioned API is available. The application applies security headers, an API rate limit, explicit payload limits, and an allowlist from `CLIENT_ORIGINS`.

The production architecture and planned endpoint boundaries are documented in `docs/architecture/production-backend.md`.

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

## Coursework API

The Assignment 2 branch retains complete CRUD endpoints at:

- `/api/references`
- `/api/projects`
- `/api/services`
- `/api/users`

Each resource supports `GET` and `POST` on the collection and `GET`, `PUT`, and `DELETE` on `/:id`. Public documents use `id` instead of MongoDB internals. User passwords are hashed before storage and never included in responses.

On `main`, these unversioned routes are disabled by default. Set `ENABLE_COURSEWORK_API=true` only when explicitly running the legacy assignment contract. The grading deployment remains pinned to the frozen `assignment-2` branch.

The API accepts the alternate name casing used by the supplied Postman collection. It also supplies compatibility values for the collection's omitted reference testimonial and project image while the database schemas continue to enforce the complete assignment model.
