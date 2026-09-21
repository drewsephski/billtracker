import { Client } from "pg";
import {
  checkReleaseEnvironment,
  checkReleaseSchema,
  readReleaseSchema,
  releaseExpectations,
} from "../lib/release/check";

// Intentionally do NOT load .env.local: the operator must supply the actual
// deployment environment. Never silently check a different database.
async function main() {
  const errors = checkReleaseEnvironment(process.env);
  if (errors.length) {
    for (const error of errors) console.error(`Release check: ${error}`);
    process.exitCode = 1;
    return;
  }
  const expected = releaseExpectations(process.cwd());
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    options:
      "-c default_transaction_read_only=on -c statement_timeout=10000 -c lock_timeout=3000",
    connectionTimeoutMillis: 10_000,
    application_name: "homeshare-release-check-read-only",
  });
  try {
    await client.connect();
    const failures = checkReleaseSchema(
      await readReleaseSchema(client),
      expected,
    );
    if (failures.length) {
      for (const failure of failures)
        console.error(`Release check: ${failure}`);
      process.exitCode = 1;
    } else
      console.log(
        `Release check passed: environment, public schema, financial invariants and ${expected.migrations.length} migrations. No data was changed.`,
      );
  } finally {
    await client.end();
  }
}
main().catch(() => {
  // Driver errors may contain credentials/hosts/SQL. Never print them.
  console.error(
    "Release check failed: could not inspect database metadata. Check connectivity, read permissions, and the migration journal. No migrations were run.",
  );
  process.exitCode = 1;
});
