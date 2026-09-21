import { describe, expect, it, vi } from "vitest";
import {
  checkReleaseEnvironment,
  checkReleaseSchema,
  readReleaseSchema,
  releaseExpectations,
  type SchemaSnapshot,
} from "@/lib/release/check";
import { assertDevelopmentWrites } from "@/lib/release/development-guard";
import { readFileSync } from "node:fs";

const expected = releaseExpectations(process.cwd());
// Independently use the committed Drizzle snapshot, not the runtime manifest.
const snapshot = JSON.parse(
  readFileSync("drizzle/meta/0006_snapshot.json", "utf8"),
);
function currentSchema(): SchemaSnapshot {
  type Table = {
    name: string;
    columns: Record<
      string,
      { name: string; type: string; notNull: boolean; primaryKey: boolean }
    >;
    indexes: Record<
      string,
      { name: string; columns: { expression: string }[]; isUnique: boolean }
    >;
    uniqueConstraints: Record<string, { name: string; columns: string[] }>;
    foreignKeys: Record<string, { name: string; columnsFrom: string[] }>;
    checkConstraints: Record<string, { name: string }>;
  };
  const tables = Object.values(snapshot.tables) as Table[];
  return {
    columns: tables.flatMap((t) =>
      Object.values(t.columns).map((c) => ({
        table_name: t.name,
        column_name: c.name,
        data_type: c.type === "bigserial" ? "bigint" : c.type,
        not_null: c.notNull,
      })),
    ),
    indexes: tables.flatMap((t) =>
      Object.values(t.indexes).map((i) => ({
        table_name: t.name,
        name: i.name,
        columns: i.columns.map((c) => c.expression),
        is_unique: i.isUnique,
        valid: true,
        partial: false,
      })),
    ),
    constraints: tables.flatMap((t) => [
      ...Object.values(t.uniqueConstraints).map((c) => ({
        table_name: t.name,
        name: c.name.slice(0, 63),
        columns: c.columns,
        kind: "u",
        validated: true,
      })),
      ...Object.values(t.foreignKeys).map((c) => ({
        table_name: t.name,
        name: c.name.slice(0, 63),
        columns: c.columnsFrom,
        kind: "f",
        validated: true,
      })),
      ...Object.values(t.checkConstraints).map((c) => ({
        table_name: t.name,
        name: c.name,
        columns: [],
        kind: "c",
        validated: true,
      })),
      ...Object.values(t.columns)
        .filter((c) => c.primaryKey)
        .map((c) => ({
          table_name: t.name,
          name: `${t.name}_pkey`,
          columns: [c.name],
          kind: "p",
          validated: true,
        })),
    ]),
    functions: Array.from(expected.functions, ([name, body]) => ({
      name,
      body,
    })),
    triggers: expected.triggers.map(
      ([table_name, name, function_name, deferred]) => ({
        table_name,
        name,
        function_name,
        deferred,
        enabled: "O",
      }),
    ),
    migrations: expected.migrations.map((m) => ({
      hash: m.hash,
      created_at: m.when,
    })),
  };
}
const production = {
  DATABASE_URL:
    "postgresql://user:private@ep-live-pooler.example.com/neondb?sslmode=verify-full",
  APP_URL: "https://homeshare.example.com",
  NEON_AUTH_BASE_URL: "https://ep-live.neonauth.example.com/neondb/auth",
  NEON_AUTH_COOKIE_SECRET: "c".repeat(32),
  CRON_SECRET: "d".repeat(32),
};
describe("read-only release verification", () => {
  it("accepts current schema and full reviewed migration chain", () => {
    expect(expected.migrations).toHaveLength(7);
    expect(checkReleaseSchema(currentSchema(), expected)).toEqual([]);
    expect(checkReleaseEnvironment(production)).toEqual([]);
  });
  it.each(["chat_messages", "chat_jobs", "payments", "household_members"])(
    "detects missing %s schema",
    (table) => {
      const state = currentSchema();
      state.columns = state.columns.filter((c) => c.table_name !== table);
      expect(checkReleaseSchema(state, expected).join(" ")).toContain(
        `public.${table}.`,
      );
    },
  );
  it("detects missing/changed migrations, invalid indexes and obsolete restrictions", () => {
    const state = currentSchema();
    state.migrations[4].hash = "wrong";
    state.migrations.pop();
    state.indexes.find(
      (i) => i.name === "payment_source_command_unique",
    )!.is_unique = false;
    state.indexes.push({
      table_name: "payments",
      name: "one_active_payment_per_split",
      columns: ["split_id"],
      is_unique: true,
      valid: true,
      partial: true,
    });
    state.constraints.find((c) => c.name === "member_household_user")!.columns =
      ["user_id"];
    const errors = checkReleaseSchema(state, expected).join(" ");
    for (const fragment of [
      "0004",
      "0006",
      "payment_source_command_unique",
      "member_household_user",
      "Obsolete",
    ])
      expect(errors).toContain(fragment);
  });
  it("detects disabled triggers and old exact-share function bodies", () => {
    const state = currentSchema();
    state.triggers[4].enabled = "D";
    state.functions.find((f) => f.name === "check_payment_amount")!.body =
      "old exact-share trigger";
    expect(checkReleaseSchema(state, expected).join(" ")).toContain(
      "payment_amount_check",
    );
    expect(checkReleaseSchema(state, expected).join(" ")).toContain(
      "check_payment_amount",
    );
  });
  it.each([
    { SEED_ALLOWED: "true" },
    { HOMESHARE_ENV: "development" },
    { APP_URL: "http://localhost:3000" },
    { APP_URL: "https://example.com/path" },
    { NEON_AUTH_COOKIE_SECRET: "short" },
    { DATABASE_URL: "postgresql://user:secret@db/test?sslmode=disable" },
    {
      DATABASE_URL: `${production.DATABASE_URL}&options=-c%20default_transaction_read_only=off`,
    },
  ])(
    "rejects unsafe deployment configuration without printing secrets (%j)",
    (overrides) => {
      const errors = checkReleaseEnvironment({ ...production, ...overrides });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join(" ")).not.toContain("user:private");
      expect(errors.join(" ")).not.toContain("user:secret");
    },
  );
  it("uses only catalog reads and a read-only transaction, including absent journals", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const state = await readReleaseSchema({ query });
    expect(state.migrations).toEqual([]);
    const sql = query.mock.calls.map((c) => (c as unknown as [string])[0]);
    expect(sql[0]).toContain("READ ONLY");
    expect(sql.at(-1)).toBe("ROLLBACK");
    for (const statement of sql.slice(1, -1))
      expect(statement).toMatch(/^SELECT /);
    expect(sql.join(" ")).not.toContain("neon_auth");
  });
  it("rolls back even when a catalog read fails", async () => {
    const query = vi
      .fn()
      .mockResolvedValue({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("private driver detail"));
    await expect(readReleaseSchema({ query })).rejects.toThrow();
    expect(query).toHaveBeenLastCalledWith("ROLLBACK");
  });
});
const development = {
  ...production,
  NODE_ENV: "test",
  HOMESHARE_ENV: "test",
  SEED_ALLOWED: "true",
  TEST_DATABASE_HOST: "ep-child-pooler.example.com",
  DATABASE_URL: "postgresql://user:secret@ep-child-pooler.example.com/neondb",
  TEST_AUTH_HOST: "ep-child.neonauth.example.com",
  NEON_AUTH_BASE_URL: "https://ep-child.neonauth.example.com/neondb/auth",
  TEST_APP_ORIGIN: "http://localhost:3000",
  APP_URL: "http://localhost:3000",
};
describe("seed and test production guardrails", () => {
  it("accepts only explicitly designated development targets", () => {
    expect(() => assertDevelopmentWrites(development, true)).not.toThrow();
  });
  it.each([
    { HOMESHARE_ENV: "" },
    { HOMESHARE_ENV: "production" },
    { SEED_ALLOWED: "false" },
    { NODE_ENV: "production" },
    { VERCEL_ENV: "production" },
    { VERCEL_TARGET_ENV: "production" },
    { TEST_DATABASE_HOST: "" },
    { DATABASE_URL: production.DATABASE_URL },
    { TEST_AUTH_HOST: "" },
    { NEON_AUTH_BASE_URL: production.NEON_AUTH_BASE_URL },
    { TEST_APP_ORIGIN: "https://homeshare.example.com" },
    { E2E_BASE_URL: "https://live.example.com" },
  ])("refuses unsafe writes before connecting (%j)", (overrides) => {
    expect(() =>
      assertDevelopmentWrites({ ...development, ...overrides }, true),
    ).toThrow();
  });
  it("never treats a test runner or SEED_ALLOWED alone as proof of database safety", () => {
    expect(() =>
      assertDevelopmentWrites({
        ...production,
        NODE_ENV: "test",
        SEED_ALLOWED: "true",
      }),
    ).toThrow();
  });
});
