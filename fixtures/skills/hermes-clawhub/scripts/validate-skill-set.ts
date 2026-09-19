import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

export const SKILL_SET_NAMES = [
  "clawhub-search",
  "clawhub-install",
  "clawhub-run",
  "hermes-learn",
  "fleet-delegate",
] as const;

export const SAFETY_RULES = [
  "Search and inspect before install.",
  "Never auto-run a newly installed skill.",
  "Never put secrets on CLI argv.",
] as const;

export const PRINTABLE_REQUESTS = ["n8n-create-fleet", "n8n-create-run", "hermes-start"] as const;

export const MAX_CONCURRENCY_CAP = 5;
export const SECRET_NAME_PATTERN = /^[A-Z][A-Z0-9_]{0,127}$/;
export const FLEET_ID_PATTERN = /^[a-z][a-z0-9-]{0,61}[a-z0-9]$/;
export const NODE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;
export const FLEET_ROLES = ["coordinator", "specialist"] as const;
export const FLEET_LIFECYCLES = ["draft", "active", "retired"] as const;
export const FLEET_MEMORY_SCOPES = ["none", "observational", "episodic"] as const;
export const FLEET_NODE_KINDS = ["coordinator", "task", "fan-out", "fan-in"] as const;

export type SkillSetName = (typeof SKILL_SET_NAMES)[number];
export type PrintableRequest = (typeof PRINTABLE_REQUESTS)[number];

export type ValidationIssue = {
  path: string;
  message: string;
};

export type SkillFrontmatter = {
  name: string;
  description: string;
};

export type SkillDocument = {
  name: SkillSetName | "hermes-clawhub";
  relativePath: string;
  body: string;
  frontmatter: SkillFrontmatter;
};

export type FleetMember = {
  agentId: string;
  role: (typeof FLEET_ROLES)[number];
  specialization: string;
  tools: string[];
  memoryScope: (typeof FLEET_MEMORY_SCOPES)[number];
  lifecycle: (typeof FLEET_LIFECYCLES)[number];
};

export type CreateFleetExample = {
  name: string;
  description?: string;
  coordinatorAgentId: string;
  members: FleetMember[];
};

export type CreateRunNode = {
  id: string;
  agentId: string;
  kind: (typeof FLEET_NODE_KINDS)[number];
  instruction: string;
  dependsOn: string[];
};

export type CreateRunExample = {
  nodes: CreateRunNode[];
};

export type HermesStartExample = {
  fleet_id: string;
  max_concurrency: number;
  replicas: number;
  kill_switch: boolean;
  worker_template: Record<string, unknown>;
  webhook_callback_url: string;
  secrets_ref: string[];
};

export type SkillSetValidationResult = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  skills: SkillDocument[];
  createFleet: CreateFleetExample | null;
  createRun: CreateRunExample | null;
  hermesStart: HermesStartExample | null;
};

const SECRETISH_KEY = /(?:secret|token|password|api[_-]?key|credential)/i;

export function packageRoot(from = fileURLToPath(import.meta.url)) {
  return resolve(dirname(from), "..");
}

export function isPrintableRequest(value: string): value is PrintableRequest {
  return (PRINTABLE_REQUESTS as readonly string[]).includes(value);
}

function issue(path: string, message: string): ValidationIssue {
  return { path, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeSecretValue(value: string) {
  try {
    const url = new URL(value);
    if (url.protocol === "http:" || url.protocol === "https:") return false;
  } catch {
    // Non-URLs still go through the secret heuristics below.
  }
  return (
    value.includes("=") ||
    /^(sk|rk|pk|ghp|gho|glpat|xox[baprs]|clh)[-_]/i.test(value) ||
    (value.length >= 24 && /[A-Za-z0-9+/_-]{24,}/.test(value) && /[0-9]/.test(value))
  );
}

function collectStrings(
  value: unknown,
  path: string,
  found: Array<{ path: string; value: string }>,
) {
  if (typeof value === "string") {
    found.push({ path, value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectStrings(entry, `${path}[${index}]`, found));
    return;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      collectStrings(entry, `${path}.${key}`, found);
    }
  }
}

function rejectSecretLiterals(value: unknown, rootPath: string, errors: ValidationIssue[]) {
  const strings: Array<{ path: string; value: string }> = [];
  collectStrings(value, rootPath, strings);
  for (const entry of strings) {
    if (looksLikeSecretValue(entry.value)) {
      errors.push(issue(entry.path, "Secret-like values are not allowed in packaged examples"));
    }
  }
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  errors: ValidationIssue[],
  path: string,
) {
  const value = record[key];
  if (typeof value !== "string" || !value.trim()) {
    errors.push(issue(path, `Expected a non-empty string ${key}`));
    return "";
  }
  return value.trim();
}

function parseSkillMarkdown(
  source: string,
  relativePath: string,
  expectedName: string,
): SkillDocument | ValidationIssue[] {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) return [issue(relativePath, "SKILL.md must start with YAML frontmatter")];

  const parsed: unknown = parseYaml(match[1]);
  if (!isRecord(parsed)) return [issue(relativePath, "Frontmatter must be a YAML object")];

  const errors: ValidationIssue[] = [];
  const name = readRequiredString(parsed, "name", errors, `${relativePath}#name`);
  const description = readRequiredString(
    parsed,
    "description",
    errors,
    `${relativePath}#description`,
  );
  if (name && name !== expectedName) {
    errors.push(issue(`${relativePath}#name`, `Expected name ${expectedName}`));
  }

  const body = match[2] ?? "";
  for (const rule of SAFETY_RULES) {
    if (!body.includes(rule)) {
      errors.push(issue(relativePath, `Missing safety rule: ${rule}`));
    }
  }

  if (errors.length > 0) return errors;
  return {
    name: expectedName as SkillDocument["name"],
    relativePath,
    body,
    frontmatter: { name, description },
  };
}

function parseMember(value: unknown, path: string, errors: ValidationIssue[]): FleetMember | null {
  if (!isRecord(value)) {
    errors.push(issue(path, "Member must be an object"));
    return null;
  }
  const agentId = readRequiredString(value, "agentId", errors, `${path}.agentId`);
  const role = readRequiredString(value, "role", errors, `${path}.role`);
  const specialization = readRequiredString(
    value,
    "specialization",
    errors,
    `${path}.specialization`,
  );
  const memoryScope = readRequiredString(value, "memoryScope", errors, `${path}.memoryScope`);
  const lifecycle = readRequiredString(value, "lifecycle", errors, `${path}.lifecycle`);
  const toolsValue = value.tools;
  if (!Array.isArray(toolsValue) || toolsValue.some((tool) => typeof tool !== "string")) {
    errors.push(issue(`${path}.tools`, "tools must be a string array"));
    return null;
  }
  if (!(FLEET_ROLES as readonly string[]).includes(role)) {
    errors.push(issue(`${path}.role`, `role must be ${FLEET_ROLES.join(" or ")}`));
  }
  if (!(FLEET_MEMORY_SCOPES as readonly string[]).includes(memoryScope)) {
    errors.push(issue(`${path}.memoryScope`, "Invalid memoryScope"));
  }
  if (!(FLEET_LIFECYCLES as readonly string[]).includes(lifecycle)) {
    errors.push(issue(`${path}.lifecycle`, "Invalid lifecycle"));
  }
  if (errors.some((entry) => entry.path.startsWith(path))) return null;
  return {
    agentId,
    role: role as FleetMember["role"],
    specialization,
    tools: toolsValue,
    memoryScope: memoryScope as FleetMember["memoryScope"],
    lifecycle: lifecycle as FleetMember["lifecycle"],
  };
}

export function parseCreateFleetExample(value: unknown): {
  errors: ValidationIssue[];
  fleet: CreateFleetExample | null;
} {
  const errors: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { errors: [issue("create-fleet", "Example must be a JSON object")], fleet: null };
  }
  rejectSecretLiterals(value, "create-fleet", errors);
  const name = readRequiredString(value, "name", errors, "create-fleet.name");
  const coordinatorAgentId = readRequiredString(
    value,
    "coordinatorAgentId",
    errors,
    "create-fleet.coordinatorAgentId",
  );
  const description = typeof value.description === "string" ? value.description : undefined;
  if (!Array.isArray(value.members) || value.members.length === 0) {
    errors.push(issue("create-fleet.members", "members must be a non-empty array"));
    return { errors, fleet: null };
  }
  const members = value.members
    .map((member, index) => parseMember(member, `create-fleet.members[${index}]`, errors))
    .filter((member): member is FleetMember => member !== null);
  const coordinators = members.filter((member) => member.role === "coordinator");
  if (coordinators.length !== 1) {
    errors.push(issue("create-fleet.members", "A fleet must have exactly one coordinator"));
  }
  if (coordinatorAgentId && !members.some((member) => member.agentId === coordinatorAgentId)) {
    errors.push(issue("create-fleet.coordinatorAgentId", "coordinatorAgentId must match a member"));
  }
  if (errors.length > 0) return { errors, fleet: null };
  return { errors, fleet: { name, description, coordinatorAgentId, members } };
}

export function parseCreateRunExample(value: unknown): {
  errors: ValidationIssue[];
  run: CreateRunExample | null;
} {
  const errors: ValidationIssue[] = [];
  if (!isRecord(value) || !Array.isArray(value.nodes) || value.nodes.length === 0) {
    return { errors: [issue("create-run.nodes", "nodes must be a non-empty array")], run: null };
  }
  rejectSecretLiterals(value, "create-run", errors);
  const nodes: CreateRunNode[] = [];
  for (const [index, raw] of value.nodes.entries()) {
    const path = `create-run.nodes[${index}]`;
    if (!isRecord(raw)) {
      errors.push(issue(path, "Node must be an object"));
      continue;
    }
    const id = readRequiredString(raw, "id", errors, `${path}.id`);
    const agentId = readRequiredString(raw, "agentId", errors, `${path}.agentId`);
    const kind = readRequiredString(raw, "kind", errors, `${path}.kind`);
    const instruction = readRequiredString(raw, "instruction", errors, `${path}.instruction`);
    const dependsOn = Array.isArray(raw.dependsOn) ? raw.dependsOn : [];
    if (id && !NODE_ID_PATTERN.test(id)) {
      errors.push(
        issue(`${path}.id`, "Node id may contain letters, numbers, hyphens, and underscores"),
      );
    }
    if (!(FLEET_NODE_KINDS as readonly string[]).includes(kind)) {
      errors.push(issue(`${path}.kind`, `kind must be one of ${FLEET_NODE_KINDS.join(", ")}`));
    }
    if (dependsOn.some((entry) => typeof entry !== "string")) {
      errors.push(issue(`${path}.dependsOn`, "dependsOn must be a string array"));
      continue;
    }
    nodes.push({
      id,
      agentId,
      kind: kind as CreateRunNode["kind"],
      instruction,
      dependsOn,
    });
  }
  if (errors.length > 0) return { errors, run: null };
  return { errors, run: { nodes } };
}

function isLocalHttpUrl(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
}

export function parseHermesStartExample(value: unknown): {
  errors: ValidationIssue[];
  fleet: HermesStartExample | null;
} {
  const errors: ValidationIssue[] = [];
  if (!isRecord(value)) {
    return { errors: [issue("hermes-start", "Example must be a JSON object")], fleet: null };
  }
  if ("secrets" in value) {
    errors.push(issue("hermes-start.secrets", "Inline secrets maps are rejected"));
  }
  rejectSecretLiterals(
    Object.fromEntries(Object.entries(value).filter(([key]) => key !== "secrets_ref")),
    "hermes-start",
    errors,
  );
  const fleetId = readRequiredString(value, "fleet_id", errors, "hermes-start.fleet_id");
  if (fleetId && !FLEET_ID_PATTERN.test(fleetId)) {
    errors.push(issue("hermes-start.fleet_id", "fleet_id must be a lowercase slug"));
  }
  const maxConcurrency = value.max_concurrency;
  if (
    typeof maxConcurrency !== "number" ||
    !Number.isInteger(maxConcurrency) ||
    maxConcurrency < 1
  ) {
    errors.push(
      issue("hermes-start.max_concurrency", "max_concurrency must be an integer from 1 to 5"),
    );
  } else if (maxConcurrency > MAX_CONCURRENCY_CAP) {
    errors.push(
      issue("hermes-start.max_concurrency", `max_concurrency cannot exceed ${MAX_CONCURRENCY_CAP}`),
    );
  }
  const replicas = value.replicas;
  if (typeof replicas !== "number" || !Number.isInteger(replicas) || replicas < 1) {
    errors.push(issue("hermes-start.replicas", "replicas must be a positive integer"));
  } else if (typeof maxConcurrency === "number" && replicas > maxConcurrency) {
    errors.push(issue("hermes-start.replicas", "replicas cannot exceed max_concurrency"));
  }
  if (typeof value.kill_switch !== "boolean") {
    errors.push(issue("hermes-start.kill_switch", "kill_switch must be a boolean"));
  }
  if (!isRecord(value.worker_template)) {
    errors.push(issue("hermes-start.worker_template", "worker_template must be an object"));
  } else {
    for (const [key, entry] of Object.entries(value.worker_template)) {
      if (SECRETISH_KEY.test(key) && typeof entry === "string" && entry.length > 0) {
        errors.push(
          issue(
            `hermes-start.worker_template.${key}`,
            "Credential fields must stay empty; use secrets_ref",
          ),
        );
      }
    }
  }
  const callback = readRequiredString(
    value,
    "webhook_callback_url",
    errors,
    "hermes-start.webhook_callback_url",
  );
  if (callback) {
    try {
      const url = new URL(callback);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        errors.push(issue("hermes-start.webhook_callback_url", "Callback must be http(s)"));
      } else if (!isLocalHttpUrl(url)) {
        errors.push(
          issue("hermes-start.webhook_callback_url", "Optional Hermes callback must be loopback"),
        );
      }
    } catch {
      errors.push(issue("hermes-start.webhook_callback_url", "Callback must be a valid URL"));
    }
  }
  if (
    !Array.isArray(value.secrets_ref) ||
    value.secrets_ref.some((entry) => typeof entry !== "string")
  ) {
    errors.push(
      issue("hermes-start.secrets_ref", "secrets_ref must be a string array of env names"),
    );
  } else {
    value.secrets_ref.forEach((name, index) => {
      if (!SECRET_NAME_PATTERN.test(name) || looksLikeSecretValue(name)) {
        errors.push(
          issue(`hermes-start.secrets_ref[${index}]`, "secrets_ref entries must be env-var names"),
        );
      }
    });
  }
  if (errors.length > 0) return { errors, fleet: null };
  return {
    errors,
    fleet: {
      fleet_id: fleetId,
      max_concurrency: maxConcurrency as number,
      replicas: replicas as number,
      kill_switch: value.kill_switch as boolean,
      worker_template: value.worker_template as Record<string, unknown>,
      webhook_callback_url: callback,
      secrets_ref: value.secrets_ref as string[],
    },
  };
}

async function readJson(path: string) {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

export async function validateSkillSet(root = packageRoot()): Promise<SkillSetValidationResult> {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const skills: SkillDocument[] = [];

  const indexSource = await readFile(join(root, "SKILL.md"), "utf8");
  const index = parseSkillMarkdown(indexSource, "SKILL.md", "hermes-clawhub");
  if (Array.isArray(index)) errors.push(...index);
  else skills.push(index);

  for (const name of SKILL_SET_NAMES) {
    const relativePath = `${name}/SKILL.md`;
    const source = await readFile(join(root, relativePath), "utf8");
    const parsed = parseSkillMarkdown(source, relativePath, name);
    if (Array.isArray(parsed)) errors.push(...parsed);
    else skills.push(parsed);
  }

  const entries = await readdir(root, { withFileTypes: true });
  const extraSkills = entries
    .filter((entry) => entry.isDirectory() && !SKILL_SET_NAMES.includes(entry.name as SkillSetName))
    .filter((entry) => entry.name !== "scripts" && entry.name !== "examples");
  for (const extra of extraSkills) {
    warnings.push(issue(extra.name, "Unexpected directory in the hermes-clawhub skill set"));
  }

  const createFleetParsed = parseCreateFleetExample(
    await readJson(join(root, "fleet-delegate/examples/create-fleet.json")),
  );
  const createRunParsed = parseCreateRunExample(
    await readJson(join(root, "fleet-delegate/examples/create-run.json")),
  );
  const hermesStartParsed = parseHermesStartExample(
    await readJson(join(root, "fleet-delegate/examples/hermes-start.json")),
  );
  errors.push(...createFleetParsed.errors, ...createRunParsed.errors, ...hermesStartParsed.errors);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    skills,
    createFleet: createFleetParsed.fleet,
    createRun: createRunParsed.run,
    hermesStart: hermesStartParsed.fleet,
  };
}

export function buildPrintRequest(kind: PrintableRequest, root = packageRoot()) {
  const exampleDir = join(root, "fleet-delegate/examples");
  if (kind === "n8n-create-fleet") {
    return [
      'curl -X POST "${N8N_BASE_URL}/rest/projects/${N8N_PROJECT_ID}/agent-fleets" \\',
      '  -H "Content-Type: application/json" \\',
      '  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \\',
      `  --data @${join(exampleDir, "create-fleet.json")}`,
    ].join("\n");
  }
  if (kind === "n8n-create-run") {
    return [
      'curl -X POST "${N8N_BASE_URL}/rest/projects/${N8N_PROJECT_ID}/agent-fleets/${N8N_AGENT_FLEET_ID}/runs" \\',
      '  -H "Content-Type: application/json" \\',
      '  -H "X-N8N-API-KEY: ${N8N_API_KEY}" \\',
      `  --data @${join(exampleDir, "create-run.json")}`,
    ].join("\n");
  }
  return [
    'curl -X POST "${HERMES_FLEET_WEBHOOK_URL}/fleet/start" \\',
    '  -H "Content-Type: application/json" \\',
    '  -H "Authorization: Bearer ${FLEET_HTTP_TOKEN}" \\',
    `  --data @${join(exampleDir, "hermes-start.json")}`,
  ].join("\n");
}

async function main(argv: string[]) {
  const printIndex = argv.indexOf("--print-request");
  const printKind = printIndex >= 0 ? argv[printIndex + 1] : undefined;
  if (printIndex >= 0 && (!printKind || !isPrintableRequest(printKind))) {
    console.error(`--print-request needs one of: ${PRINTABLE_REQUESTS.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const result = await validateSkillSet();
  if (!result.ok) {
    for (const error of result.errors) {
      console.error(`${error.path}: ${error.message}`);
    }
    process.exitCode = 1;
    return;
  }

  if (printKind) {
    // Local print only. This script must never fetch or POST.
    console.log(buildPrintRequest(printKind));
    return;
  }

  console.log(`ok: ${result.skills.length} skill documents, examples valid, no network`);
}

if (import.meta.main) {
  await main(process.argv.slice(2));
}
