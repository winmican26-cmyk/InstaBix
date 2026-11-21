/**
 * Vitest setup. The unit suites test pure functions, so no database connection is
 * opened; the variables below only satisfy modules that read the environment at
 * import time. Anything that needs Postgres is an integration test and is run
 * against the real container, never mocked here.
 */
process.env.APP_URL ??= "http://localhost:3000";
process.env.AUTH_SECRET ??= "test-only-secret-value-that-is-long-enough";
process.env.DATABASE_URL ??= "postgres://vistabix_app:test@localhost:55432/vistabix";
