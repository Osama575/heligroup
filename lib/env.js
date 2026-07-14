// Environment bootstrap. MUST be the first import in server.js: ESM evaluates
// imports before module code runs, so any module that reads NODE_ENV at load
// time (express, lib/auth.js) only sees the default if it's applied here, in an
// import that precedes them — not in server.js body code.
//
// Default to production (EJS view caching, terse errors): hosts like
// Hostinger/Passenger often don't set NODE_ENV, and without it Express
// recompiles every template on every request. Set NODE_ENV=development in .env
// to opt out locally (templates then hot-reload without a restart).

import "dotenv/config";

if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
