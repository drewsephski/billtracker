type Environment = Record<string, string | undefined>;

// Explicit operator designation, independent of NODE_ENV=test (which test
// runners set automatically). Never infer safety from branch names or data.
export function assertDevelopmentWrites(env: Environment, auth = false) {
  if (
    !["development", "test"].includes(env.HOMESHARE_ENV || "") ||
    env.SEED_ALLOWED !== "true" ||
    env.NODE_ENV === "production" ||
    env.VERCEL_ENV === "production" ||
    env.VERCEL_TARGET_ENV === "production"
  )
    throw new Error(
      "Writes require HOMESHARE_ENV=development or test, SEED_ALLOWED=true, and a non-production process/deployment.",
    );
  const checkHost = (
    url: string | undefined,
    expected: string | undefined,
    label: string,
  ) => {
    let hostname: string;
    try {
      hostname = new URL(url || "").hostname;
    } catch {
      throw new Error(`${label} is missing or invalid.`);
    }
    if (!expected || hostname !== expected || !expected.startsWith("ep-"))
      throw new Error(
        `${label} must match the explicitly designated child-branch test hostname.`,
      );
  };
  checkHost(
    env.DATABASE_URL,
    env.TEST_DATABASE_HOST,
    "DATABASE_URL / TEST_DATABASE_HOST",
  );
  if (auth) {
    checkHost(
      env.NEON_AUTH_BASE_URL,
      env.TEST_AUTH_HOST,
      "NEON_AUTH_BASE_URL / TEST_AUTH_HOST",
    );
    let actual: URL;
    let expected: URL;
    try {
      actual = new URL(
        env.E2E_BASE_URL || env.APP_URL || "http://localhost:3000",
      );
      expected = new URL(env.TEST_APP_ORIGIN || "");
    } catch {
      throw new Error(
        "TEST_APP_ORIGIN must explicitly designate the development application.",
      );
    }
    if (
      actual.origin !== expected.origin ||
      expected.pathname !== "/" ||
      expected.search ||
      expected.hash ||
      expected.username ||
      expected.password
    )
      throw new Error("Application URL does not match TEST_APP_ORIGIN.");
  }
}
