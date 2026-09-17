/* @vitest-environment node */
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_CONCURRENCY,
  MAX_CONCURRENCY_CAP,
  buildFleetRequest,
  defaultExampleFleetPath,
  effectiveMaxConcurrency,
  parseFleetYaml,
} from "./validate-fleet";

const EXAMPLE_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "examples",
  "fleet.yaml",
);

const previousConcurrency = process.env.HERMES_FLEET_MAX_CONCURRENCY;

afterEach(() => {
  if (previousConcurrency === undefined) {
    delete process.env.HERMES_FLEET_MAX_CONCURRENCY;
  } else {
    process.env.HERMES_FLEET_MAX_CONCURRENCY = previousConcurrency;
  }
});

describe("hermes fleet.yaml validation", () => {
  it("accepts the packaged example manifest and defaults the cap to 5", async () => {
    const result = parseFleetYaml(await readFile(EXAMPLE_PATH, "utf8"));

    expect(result.ok).toBe(true);
    expect(result.fleet).toEqual({
      fleet_id: "example-local-fleet",
      max_concurrency: DEFAULT_MAX_CONCURRENCY,
      worker_template: {
        runtime: "hermes",
        role: "openclaw-worker",
        command: "hermes worker run",
      },
      webhook_callback_url: "https://operator.example.invalid/hooks/hermes-fleet",
      secrets_ref: ["HERMES_API_KEY", "OPERATOR_WEBHOOK_SECRET"],
    });
    expect(defaultExampleFleetPath()).toBe(EXAMPLE_PATH);
  });

  it("defaults omitted max_concurrency to 5", () => {
    const result = parseFleetYaml(`
fleet_id: omitted-cap-fleet
worker_template:
  runtime: openclaw
webhook_callback_url: https://operator.example.invalid/hooks/hermes-fleet
secrets_ref:
  - HERMES_API_KEY
`);

    expect(result.ok).toBe(true);
    expect(result.fleet?.max_concurrency).toBe(DEFAULT_MAX_CONCURRENCY);
  });

  it("rejects a cap above 5 and secret values in secrets_ref", () => {
    const result = parseFleetYaml(`
fleet_id: too-wide-fleet
max_concurrency: 6
worker_template:
  runtime: hermes
webhook_callback_url: https://operator.example.invalid/hooks/hermes-fleet
secrets_ref:
  - sk-live-not-a-name
`);

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(["max_concurrency", "secrets_ref[0]"]),
    );
  });

  it("rejects inline secrets and non-local http callbacks", () => {
    const result = parseFleetYaml(`
fleet_id: leaky-fleet
worker_template:
  runtime: hermes
  api_key: super-secret
webhook_callback_url: http://operator.example.invalid/hooks/hermes-fleet
secrets:
  HERMES_API_KEY: actual-secret
secrets_ref:
  - HERMES_API_KEY
`);

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining(["secrets", "worker_template.api_key", "webhook_callback_url"]),
    );
  });

  it("prints a local-only fleet request and honors a lower env cap", () => {
    delete process.env.HERMES_FLEET_MAX_CONCURRENCY;
    const parsed = parseFleetYaml(`
fleet_id: request-fleet
max_concurrency: 4
worker_template:
  runtime: hermes
webhook_callback_url: http://127.0.0.1:8644/hooks/hermes-fleet
secrets_ref:
  - OPERATOR_WEBHOOK_SECRET
`);
    expect(parsed.ok).toBe(true);
    const fleet = parsed.fleet;
    expect(fleet).not.toBeNull();
    if (!fleet) throw new Error("expected a valid fleet");

    expect(buildFleetRequest("stop", fleet)).toEqual({
      action: "stop",
      fleet_id: "request-fleet",
      max_concurrency: 4,
    });

    process.env.HERMES_FLEET_MAX_CONCURRENCY = "2";
    expect(effectiveMaxConcurrency(fleet.max_concurrency)).toBe(2);
    expect(() => {
      process.env.HERMES_FLEET_MAX_CONCURRENCY = "9";
      effectiveMaxConcurrency(fleet.max_concurrency);
    }).toThrow(/cannot exceed 5/);
    expect(MAX_CONCURRENCY_CAP).toBe(5);
  });
});
