import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "../db/schema";

type Environment = Record<string, string | undefined>;
export function checkReleaseEnvironment(env: Environment): string[] {
  const errors: string[] = [];
  for (const name of [
    "DATABASE_URL",
    "NEON_AUTH_BASE_URL",
    "NEON_AUTH_COOKIE_SECRET",
    "APP_URL",
    "CRON_SECRET",
  ])
    if (!env[name]?.trim()) errors.push(`${name} is required.`);
  if ((env.NEON_AUTH_COOKIE_SECRET?.length || 0) < 32)
    errors.push("NEON_AUTH_COOKIE_SECRET must have at least 32 characters.");
  if ((env.CRON_SECRET?.length || 0) < 32)
    errors.push("CRON_SECRET must have at least 32 characters.");
  if (env.SEED_ALLOWED && env.SEED_ALLOWED !== "false")
    errors.push("SEED_ALLOWED must be absent or false for release.");
  if (env.HOMESHARE_ENV && env.HOMESHARE_ENV !== "production")
    errors.push("HOMESHARE_ENV must be absent or production for release.");
  for (const name of ["RUN_DB_TESTS", "HOMESHARE_E2E_LLM_STUB"])
    if (["1", "true"].includes(env[name] || ""))
      errors.push(`${name} must be disabled for release.`);
  for (const name of ["APP_URL", "NEON_AUTH_BASE_URL"]) {
    try {
      const url = new URL(env[name] || "");
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(url.hostname) ||
        url.hostname.endsWith(".localhost") ||
        (name === "APP_URL" && url.pathname !== "/")
      )
        throw new Error();
    } catch {
      errors.push(
        `${name} must be a valid public HTTPS ${name === "APP_URL" ? "origin" : "URL"}.`,
      );
    }
  }
  try {
    const url = new URL(env.DATABASE_URL || "");
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !["require", "verify-ca", "verify-full"].includes(
        url.searchParams.get("sslmode") || "",
      )
    )
      throw new Error();
    // Do not allow connection-string options to override read-only startup settings.
    if (url.searchParams.has("options")) throw new Error();
  } catch {
    errors.push(
      "DATABASE_URL must be a Postgres URL with TLS and no options override.",
    );
  }
  return errors;
}

export function releaseExpectations(root: string) {
  const journal = JSON.parse(
    readFileSync(join(root, "drizzle/meta/_journal.json"), "utf8"),
  ) as { entries: { tag: string; when: number }[] };
  const functions = new Map<string, string>();
  const migrations = journal.entries.map(({ tag, when }) => {
    const sql = readFileSync(join(root, "drizzle", `${tag}.sql`), "utf8");
    for (const match of sql.matchAll(
      /CREATE (?:OR REPLACE )?FUNCTION (\w+)\(\) RETURNS trigger LANGUAGE plpgsql AS \$\$([\s\S]*?)\$\$/g,
    ))
      functions.set(match[1], match[2]);
    return {
      tag,
      when: String(when),
      hash: createHash("sha256").update(sql).digest("hex"),
    };
  });
  return {
    tables: Object.values(schema).map(getTableConfig),
    migrations,
    functions,
    triggers: [
      ["bills", "bill_balance", "check_bill_balance", true],
      ["bill_splits", "split_balance", "check_bill_balance", true],
      [
        "recurring_bill_templates",
        "template_balance",
        "check_template_balance",
        true,
      ],
      [
        "recurring_template_splits",
        "template_split_balance",
        "check_template_balance",
        true,
      ],
      ["payments", "payment_amount_check", "check_payment_amount", false],
      [
        "bill_splits",
        "settled_split_immutable",
        "protect_settled_split",
        false,
      ],
    ] as const,
  };
}
export type SchemaSnapshot = {
  columns: {
    table_name: string;
    column_name: string;
    data_type: string;
    not_null: boolean;
  }[];
  indexes: {
    table_name: string;
    name: string;
    columns: string[];
    is_unique: boolean;
    valid: boolean;
    partial: boolean;
  }[];
  constraints: {
    table_name: string;
    name: string;
    kind: string;
    validated: boolean;
    columns: string[];
  }[];
  triggers: {
    table_name: string;
    name: string;
    enabled: string;
    function_name: string;
    deferred: boolean;
  }[];
  functions: { name: string; body: string }[];
  migrations: { hash: string; created_at: string }[];
};
const normalize = (sql: string) => sql.replace(/\s+/g, " ").trim();
const sqlType = (value: string) => (value === "bigserial" ? "bigint" : value);
export function checkReleaseSchema(
  snapshot: SchemaSnapshot,
  expected: ReturnType<typeof releaseExpectations>,
): string[] {
  const errors: string[] = [];
  for (const table of expected.tables) {
    for (const column of table.columns) {
      const actual = snapshot.columns.find(
        (c) => c.table_name === table.name && c.column_name === column.name,
      );
      if (!actual) errors.push(`Missing public.${table.name}.${column.name}.`);
      else if (
        actual.data_type !== sqlType(column.getSQLType()) ||
        actual.not_null !== column.notNull
      )
        errors.push(
          `Column definition differs: public.${table.name}.${column.name}.`,
        );
    }
    for (const index of table.indexes) {
      const actual = snapshot.indexes.find(
        (i) => i.table_name === table.name && i.name === index.config.name,
      );
      const columns = index.config.columns.map((c) =>
        "name" in c ? c.name : "expression",
      );
      if (
        !actual ||
        !actual.valid ||
        actual.partial ||
        actual.is_unique !== index.config.unique ||
        JSON.stringify(actual.columns) !== JSON.stringify(columns)
      )
        errors.push(`Missing or incompatible index: ${index.config.name}.`);
    }
    const constraints = [
      ...table.uniqueConstraints.map((c) => ({
        name: c.name!,
        kind: "u",
        columns: c.columns.map((c) => c.name),
      })),
      ...table.checks.map((c) => ({ name: c.name, kind: "c" })),
      ...table.foreignKeys.map((c) => ({ name: c.getName(), kind: "f" })),
      ...table.columns
        .filter((c) => c.primary)
        .map((c) => ({
          name: `${table.name}_pkey`,
          kind: "p",
          columns: [c.name],
        })),
      ...table.columns
        .filter((c) => c.isUnique)
        .map((c) => ({ name: c.uniqueName!, kind: "u", columns: [c.name] })),
    ];
    for (const constraint of constraints) {
      const actual = snapshot.constraints.find(
        (c) =>
          c.table_name === table.name &&
          c.name === constraint.name.slice(0, 63),
      );
      if (
        !actual ||
        !actual.validated ||
        actual.kind !== constraint.kind ||
        ("columns" in constraint &&
          JSON.stringify(actual.columns) !== JSON.stringify(constraint.columns))
      )
        errors.push(`Missing or incompatible constraint: ${constraint.name}.`);
    }
  }
  if (
    snapshot.indexes.some((i) => i.name === "one_active_payment_per_split") ||
    snapshot.constraints.some((c) => c.name === "member_one_household")
  )
    errors.push(
      "Obsolete single-payment or single-household restriction remains (migrations 0003/0004).",
    );
  for (const [table, name, fn, deferred] of expected.triggers) {
    if (
      !snapshot.triggers.some(
        (t) =>
          t.table_name === table &&
          t.name === name &&
          ["O", "A"].includes(t.enabled) &&
          t.function_name === fn &&
          t.deferred === deferred,
      )
    )
      errors.push(`Missing or incompatible financial trigger: ${name}.`);
  }
  for (const [name, body] of expected.functions)
    if (
      !snapshot.functions.some(
        (fn) => fn.name === name && normalize(fn.body) === normalize(body),
      )
    )
      errors.push(
        `Financial function differs from reviewed migrations: ${name}.`,
      );
  for (const migration of expected.migrations)
    if (
      !snapshot.migrations.some(
        (m) =>
          m.hash === migration.hash && String(m.created_at) === migration.when,
      )
    )
      errors.push(`Missing or changed migration: ${migration.tag}.`);
  return errors;
}

// Only catalog metadata and Drizzle's journal are read. No application rows,
// auth tables, ORM initialization, migrations, or maintenance helpers.
export async function readReleaseSchema(client: {
  query(sql: string): Promise<{ rows: never[] | Record<string, unknown>[] }>;
}): Promise<SchemaSnapshot> {
  await client.query(
    "BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY",
  );
  try {
    const columns = (
      await client.query(
        `SELECT c.relname AS table_name, a.attname AS column_name, format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull AS not_null FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p') AND a.attnum > 0 AND NOT a.attisdropped`,
      )
    ).rows;
    const indexes = (
      await client.query(
        `SELECT t.relname AS table_name, c.relname AS name, i.indisunique AS is_unique, (i.indisvalid AND i.indisready) AS valid, (i.indpred IS NOT NULL) AS partial, ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum, pos) JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum ORDER BY k.pos) AS columns FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid JOIN pg_class t ON t.oid = i.indrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public'`,
      )
    ).rows;
    const constraints = (
      await client.query(
        `SELECT t.relname AS table_name, c.conname AS name, c.contype AS kind, c.convalidated AS validated, ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(attnum, pos) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum ORDER BY k.pos) AS columns FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace WHERE n.nspname = 'public'`,
      )
    ).rows;
    const triggers = (
      await client.query(
        `SELECT c.relname AS table_name, t.tgname AS name, t.tgenabled AS enabled, p.proname AS function_name, (t.tgdeferrable AND t.tginitdeferred) AS deferred FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_proc p ON p.oid = t.tgfoid WHERE n.nspname = 'public' AND NOT t.tgisinternal`,
      )
    ).rows;
    const functions = (
      await client.query(
        `SELECT p.proname AS name, p.prosrc AS body FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.pronargs = 0 AND p.prorettype = 'trigger'::regtype`,
      )
    ).rows;
    const journal = (
      await client.query(
        "SELECT to_regclass('drizzle.__drizzle_migrations') AS journal",
      )
    ).rows[0];
    const migrations = journal?.journal
      ? (
          await client.query(
            "SELECT hash, created_at::text FROM drizzle.__drizzle_migrations",
          )
        ).rows
      : [];
    return {
      columns,
      indexes,
      constraints,
      triggers,
      functions,
      migrations,
    } as SchemaSnapshot;
  } finally {
    await client.query("ROLLBACK");
  }
}
