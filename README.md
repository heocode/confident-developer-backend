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
5. Start the development server with `npm run dev`.

The API listens on port `3000` by default. Check it at `GET /api/health`.

## Commands

```text
npm run dev    Start the server with Node watch mode
npm start      Start the server normally
npm run lint   Run ESLint
npm test       Run the Node.js test suite
```

## Assignment references

The assignment PDF and supplied Postman collection are stored under `docs/assignment` and `postman`. The supplied collection must remain unchanged for grading.

## Current status

The Express and MongoDB foundation is configured. Coursework CRUD resources will be implemented in the next stage.
