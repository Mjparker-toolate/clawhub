/* @vitest-environment node */
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_CONCURRENCY_CAP,
  SAFETY_RULES,
  SKILL_SET_NAMES,
  buildPrintRequest,
  packageRoot,
  parseCreateFleetExample,
  parseCreateRunExample,
  parseHermesStartExample,
  validateSkillSet,
} from "./validate-skill-set";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const validFleet = {
  name: "example-local-fleet",
  coordinatorAgentId: "coord-1",
  members: [
    {
      agentId: "coord-1",
      role: "coordinator",
      specialization: "Split and join work",
      tools: [],
      memoryScope: "none",
      lifecycle: "active",
    },
    {
      agentId: "spec-1",
      role: "specialist",
      specialization: "Search tickets",
      tools: ["clawhub:clawhub-search"],
      memoryScope: "observational",
      lifecycle: "active",
    },
  ],
};

describe("hermes-clawhub skill set", () => {
  it("accepts the packaged skills, safety rules, and examples", async () => {
    const result = await validateSkillSet(ROOT);

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.skills.map((skill) => skill.name)).toEqual([
      "hermes-clawhub",
      ...SKILL_SET_NAMES,
    ]);
    for (const skill of result.skills) {
      for (const rule of SAFETY_RULES) {
        expect(skill.body).toContain(rule);
      }
    }
    expect(result.createFleet?.coordinatorAgentId).toBe("coord-1");
    expect(result.createRun?.nodes.map((node) => node.kind)).toEqual(["fan-out", "task", "fan-in"]);
    expect(result.hermesStart).toMatchObject({
      fleet_id: "example-local-fleet",
      max_concurrency: MAX_CONCURRENCY_CAP,
      secrets_ref: ["OPENROUTER_API_KEY", "FLEET_HTTP_TOKEN"],
    });
    expect(packageRoot()).toBe(ROOT);
  });

  it("prints env-expanded curl and never embeds token values", () => {
    const fleet = buildPrintRequest("n8n-create-fleet", ROOT);
    const run = buildPrintRequest("n8n-create-run", ROOT);
    const hermes = buildPrintRequest("hermes-start", ROOT);

    expect(fleet).toContain("${N8N_API_KEY}");
    expect(fleet).toContain("/rest/projects/${N8N_PROJECT_ID}/agent-fleets");
    expect(run).toContain("${N8N_AGENT_FLEET_ID}/runs");
    expect(hermes).toContain("${FLEET_HTTP_TOKEN}");
    expect(hermes).toContain("${HERMES_FLEET_WEBHOOK_URL}/fleet/start");
    expect(`${fleet}\n${run}\n${hermes}`).not.toMatch(/sk-|clh_|Bearer [A-Za-z0-9]/);
  });

  it("rejects two coordinators and secret-like example values", () => {
    const twoCoordinators = parseCreateFleetExample({
      ...validFleet,
      members: [validFleet.members[0], { ...validFleet.members[0], agentId: "coord-2" }],
    });
    expect(twoCoordinators.fleet).toBeNull();
    expect(twoCoordinators.errors.map((error) => error.path)).toContain("create-fleet.members");

    const leaked = parseCreateFleetExample({
      ...validFleet,
      description: "sk-live-not-a-name",
    });
    expect(leaked.fleet).toBeNull();
    expect(leaked.errors.map((error) => error.path)).toContain("create-fleet.description");
  });

  it("rejects a Hermes cap above 5, inline secrets, and non-loopback callbacks", () => {
    const result = parseHermesStartExample({
      fleet_id: "too-wide-fleet",
      max_concurrency: 6,
      replicas: 1,
      kill_switch: false,
      worker_template: { runtime: "hermes", api_key: "super-secret" },
      webhook_callback_url: "https://operator.example.invalid/hooks/hermes-fleet",
      secrets: { OPENROUTER_API_KEY: "actual-secret" },
      secrets_ref: ["sk-live-not-a-name"],
    });

    expect(result.fleet).toBeNull();
    expect(result.errors.map((error) => error.path)).toEqual(
      expect.arrayContaining([
        "hermes-start.secrets",
        "hermes-start.max_concurrency",
        "hermes-start.worker_template.api_key",
        "hermes-start.webhook_callback_url",
        "hermes-start.secrets_ref[0]",
      ]),
    );
  });

  it("rejects an empty run graph", () => {
    const result = parseCreateRunExample({ nodes: [] });
    expect(result.run).toBeNull();
    expect(result.errors[0]?.path).toBe("create-run.nodes");
  });
});
