import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const DEFAULT_MAX_CONCURRENCY = 5;
export const MAX_CONCURRENCY_CAP = 5;
export const FLEET_ACTIONS = ["start", "status", "scale", "stop"] as const;

export type FleetAction = (typeof FLEET_ACTIONS)[number];

export type WorkerTemplate = {
  runtime: "hermes" | "openclaw";
  role?: string;
  command?: string;
  image?: string;
};

export type FleetManifest = {
  fleet_id: string;
  max_concurrency: number;
  worker_template: WorkerTemplate;
  webhook_callback_url: string;
  secrets_ref: string[];
};

export type FleetValidationIssue = {
  path: string;
  message: string;
};

export type FleetValidationResult = {
  ok: boolean;
  errors: FleetValidationIssue[];
  warnings: FleetValidationIssue[];
  fleet: FleetManifest | null;
};

export type FleetWebhookRequest = {
  action: FleetAction;
  fleet_id: string;
  max_concurrency: number;
};

const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
const FLEET_ID_PATTERN = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
const SECRETISH_TEMPLATE_KEY = /(?:secret|token|password|api[_-]?key|credential)/i;

export function isFleetAction(value: string): value is FleetAction {
  return (FLEET_ACTIONS as readonly string[]).includes(value);
}

function issue(path: string, message: string): FleetValidationIssue {
  return { path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isLocalHttpUrl(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

function looksLikeSecretValue(value: string) {
  return (
    value.includes("=") ||
    value.includes("://") ||
    /^(sk|rk|pk|ghp|gho|glpat|xox[baprs])[-_]/i.test(value)
  );
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
  errors: FleetValidationIssue[],
  path: string,
) {
  if (!(key in record)) return undefined;
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(issue(path, `${key} must be a non-empty string when set.`));
    return undefined;
  }
  if (looksLikeSecretValue(value)) {
    errors.push(issue(path, `${key} must be a name or command, not a secret value.`));
    return undefined;
  }
  return value.trim();
}

function validateSecretsRef(value: unknown, errors: FleetValidationIssue[]) {
  if (value === undefined) {
    errors.push(issue("secrets_ref", "secrets_ref is required and must list secret names only."));
    return [];
  }
  if (!Array.isArray(value)) {
    errors.push(
      issue("secrets_ref", "secrets_ref must be an array of environment variable names."),
    );
    return [];
  }

  const names: string[] = [];
  for (const [index, entry] of value.entries()) {
    const path = `secrets_ref[${index}]`;
    if (typeof entry !== "string" || entry.trim() === "") {
      errors.push(issue(path, "Each secrets_ref entry must be a non-empty name."));
      continue;
    }
    const name = entry.trim();
    if (!SECRET_NAME_PATTERN.test(name) || looksLikeSecretValue(name)) {
      errors.push(
        issue(
          path,
          "secrets_ref may contain environment variable names only, never secret values.",
        ),
      );
      continue;
    }
    names.push(name);
  }
  return names;
}

function validateWorkerTemplate(value: unknown, errors: FleetValidationIssue[]) {
  if (!isRecord(value)) {
    errors.push(issue("worker_template", "worker_template must be a mapping."));
    return null;
  }

  for (const key of Object.keys(value)) {
    if (SECRETISH_TEMPLATE_KEY.test(key) && typeof value[key] === "string") {
      errors.push(
        issue(
          `worker_template.${key}`,
          "Worker templates must reference secret names through secrets_ref, not inline secret fields.",
        ),
      );
    }
  }

  const runtime = value.runtime;
  if (runtime !== "hermes" && runtime !== "openclaw") {
    errors.push(issue("worker_template.runtime", 'runtime must be "hermes" or "openclaw".'));
    return null;
  }

  const role = readOptionalString(value, "role", errors, "worker_template.role");
  const command = readOptionalString(value, "command", errors, "worker_template.command");
  const image = readOptionalString(value, "image", errors, "worker_template.image");

  return {
    runtime,
    ...(role ? { role } : {}),
    ...(command ? { command } : {}),
    ...(image ? { image } : {}),
  } satisfies WorkerTemplate;
}

function validateWebhookCallbackUrl(value: unknown, errors: FleetValidationIssue[]) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(issue("webhook_callback_url", "webhook_callback_url is required."));
    return null;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    errors.push(issue("webhook_callback_url", "webhook_callback_url must be an absolute URL."));
    return null;
  }

  if (url.protocol === "https:") return url.toString();
  if (url.protocol === "http:" && isLocalHttpUrl(url)) return url.toString();
  errors.push(
    issue(
      "webhook_callback_url",
      "webhook_callback_url must be https, or http only for localhost.",
    ),
  );
  return null;
}

function validateMaxConcurrency(value: unknown, errors: FleetValidationIssue[]) {
  if (value === undefined) return DEFAULT_MAX_CONCURRENCY;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push(issue("max_concurrency", "max_concurrency must be an integer."));
    return null;
  }
  if (value < 1 || value > MAX_CONCURRENCY_CAP) {
    errors.push(
      issue(
        "max_concurrency",
        `max_concurrency must be between 1 and ${MAX_CONCURRENCY_CAP}. The default is ${DEFAULT_MAX_CONCURRENCY}.`,
      ),
    );
    return null;
  }
  return value;
}

export function validateFleetDocument(value: unknown): FleetValidationResult {
  const errors: FleetValidationIssue[] = [];
  const warnings: FleetValidationIssue[] = [];

  if (!isRecord(value)) {
    return {
      ok: false,
      errors: [issue("$", "Fleet manifest must be a YAML mapping.")],
      warnings,
      fleet: null,
    };
  }

  if ("secrets" in value) {
    errors.push(issue("secrets", "Do not embed secret values. Use secrets_ref names only."));
  }

  const fleetId = value.fleet_id;
  if (typeof fleetId !== "string" || !FLEET_ID_PATTERN.test(fleetId)) {
    errors.push(
      issue(
        "fleet_id",
        "fleet_id must be a lowercase slug that starts with a letter and uses hyphens only.",
      ),
    );
  }

  const maxConcurrency = validateMaxConcurrency(value.max_concurrency, errors);
  const workerTemplate = validateWorkerTemplate(value.worker_template, errors);
  const webhookCallbackUrl = validateWebhookCallbackUrl(value.webhook_callback_url, errors);
  const secretsRef = validateSecretsRef(value.secrets_ref, errors);

  if (errors.length > 0 || fleetId === undefined || maxConcurrency === null) {
    return { ok: false, errors, warnings, fleet: null };
  }

  if (typeof fleetId !== "string" || !workerTemplate || !webhookCallbackUrl) {
    return { ok: false, errors, warnings, fleet: null };
  }

  return {
    ok: true,
    errors,
    warnings,
    fleet: {
      fleet_id: fleetId,
      max_concurrency: maxConcurrency,
      worker_template: workerTemplate,
      webhook_callback_url: webhookCallbackUrl,
      secrets_ref: secretsRef,
    },
  };
}

export function parseFleetYaml(source: string): FleetValidationResult {
  let parsed: unknown;
  try {
    parsed = parseYaml(source);
  } catch (error) {
    const message = error instanceof Error ? error.message : "YAML parse failed.";
    return {
      ok: false,
      errors: [issue("$", message)],
      warnings: [],
      fleet: null,
    };
  }
  return validateFleetDocument(parsed);
}

export function effectiveMaxConcurrency(manifestMaxConcurrency: number) {
  const raw = process.env.HERMES_FLEET_MAX_CONCURRENCY?.trim();
  if (!raw) return Math.min(manifestMaxConcurrency, MAX_CONCURRENCY_CAP);

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("HERMES_FLEET_MAX_CONCURRENCY must be an integer between 1 and 5.");
  }
  if (parsed > MAX_CONCURRENCY_CAP) {
    throw new Error(
      `HERMES_FLEET_MAX_CONCURRENCY cannot exceed ${MAX_CONCURRENCY_CAP}. ClawHub packages this cap; Hermes enforces it at runtime.`,
    );
  }
  return Math.min(parsed, manifestMaxConcurrency, MAX_CONCURRENCY_CAP);
}

export function buildFleetRequest(
  action: FleetAction,
  fleet: FleetManifest,
  maxConcurrency = fleet.max_concurrency,
): FleetWebhookRequest {
  return {
    action,
    fleet_id: fleet.fleet_id,
    max_concurrency: maxConcurrency,
  };
}

export function defaultExampleFleetPath() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..", "examples", "fleet.yaml");
}

function printIssues(label: string, issues: FleetValidationIssue[]) {
  for (const entry of issues) {
    console.error(`${label} ${entry.path}: ${entry.message}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  let printRequest: FleetAction | undefined;
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--print-request") {
      const action = args[index + 1];
      if (!action || !isFleetAction(action)) {
        throw new Error(`--print-request requires one of: ${FLEET_ACTIONS.join(", ")}.`);
      }
      printRequest = action;
      index += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      console.log(
        [
          "Validate a Hermes fleet.yaml locally. This script never calls a webhook or starts workers.",
          "",
          "Usage:",
          "  bun fixtures/skills/hermes-fleet/scripts/validate-fleet.ts [path]",
          "  bun fixtures/skills/hermes-fleet/scripts/validate-fleet.ts --print-request start [path]",
        ].join("\n"),
      );
      return;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    positional.push(arg);
  }

  const fleetPath = resolve(positional[0] ?? defaultExampleFleetPath());
  const result = parseFleetYaml(await readFile(fleetPath, "utf8"));
  if (!result.ok || !result.fleet) {
    printIssues("error", result.errors);
    process.exitCode = 1;
    return;
  }

  printIssues("warning", result.warnings);
  const maxConcurrency = effectiveMaxConcurrency(result.fleet.max_concurrency);
  if (printRequest) {
    process.stdout.write(
      `${JSON.stringify(buildFleetRequest(printRequest, result.fleet, maxConcurrency), null, 2)}\n`,
    );
    return;
  }

  console.log(
    `ok ${result.fleet.fleet_id} max_concurrency=${maxConcurrency} secrets_ref=${result.fleet.secrets_ref.length}`,
  );
}

if (import.meta.main) {
  await main();
}
