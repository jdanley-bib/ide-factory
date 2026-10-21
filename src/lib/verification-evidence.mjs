import { spawn, spawnSync } from 'node:child_process';
import { createHash, createPublicKey, verify } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { attemptPath, getAttempt } from './attempt.mjs';
import { halted, writeText } from './layout.mjs';

const SUPPORTED_SCHEMA_VERSION = 1;
const ALLOWED_CWD_POLICY = 'project';
const RUNNER_NAME = 'idefactory';

const PACKAGE_VERSION = JSON.parse(
  fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '../../package.json'),
    'utf8',
  ),
).version;

/**
 * Hash of canonical argv JSON: lowercase sha256: hex.
 */
export function commandDigest(argv) {
  const canonical = JSON.stringify(argv);
  const hex = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return `sha256:${hex}`;
}

/**
 * Canonical JSON for attestation signatures: UTF-8, recursively sorted object
 * keys, no insignificant whitespace. Arrays keep order. Strings and numbers
 * use JSON.stringify. The signature field must be omitted by the caller.
 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

function digestBytes(bytes) {
  const hex = createHash('sha256').update(bytes).digest('hex');
  return `sha256:${hex}`;
}

/**
 * Validate a stored check evidence record. Rejects a record with no exitCode.
 *
 * @param {object} record
 */
export function validateCheckRecord(record) {
  if (!record || typeof record !== 'object' || Array.isArray(record)) {
    throw new Error('check record must be an object');
  }
  if (record.exitCode === undefined || record.exitCode === null) {
    throw new Error('check record requires exitCode');
  }
}

/**
 * Validate a versioned check registry. Rejects unsupported schema versions,
 * shell command strings, empty argv, non-project cwd policy, non-positive
 * timeouts, and artifact paths that escape the project root.
 *
 * @param {object} registry
 * @param {{ projectRoot: string }} options
 * @returns {{ schemaVersion: number, checks: Record<string, object> }}
 */
export function validateCheckRegistry(registry, options = {}) {
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)) {
    throw new Error('check registry must be an object');
  }
  if (registry.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new Error(`unsupported check registry schema version: ${registry.schemaVersion}`);
  }

  const projectRoot = options.projectRoot;
  if (!projectRoot || typeof projectRoot !== 'string') {
    throw new Error('projectRoot is required to validate check registry paths');
  }
  const resolvedRoot = path.resolve(projectRoot);

  const checksIn = registry.checks;
  if (!checksIn || typeof checksIn !== 'object' || Array.isArray(checksIn)) {
    throw new Error('check registry must include a checks object');
  }

  const checks = {};
  for (const [kind, entry] of Object.entries(checksIn)) {
    checks[kind] = validateCheckEntry(kind, entry, resolvedRoot);
  }

  return { schemaVersion: SUPPORTED_SCHEMA_VERSION, checks };
}

function validateCheckEntry(kind, entry, projectRoot) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`check "${kind}" must be an object`);
  }

  if (typeof entry.command === 'string') {
    throw new Error(`check "${kind}" rejects shell command string; use argv array`);
  }

  const { argv } = entry;
  if (typeof argv === 'string') {
    throw new Error(`check "${kind}" rejects shell command string; argv must be a string array`);
  }
  if (!Array.isArray(argv)) {
    throw new Error(`check "${kind}" requires a non-empty argv string array`);
  }
  if (argv.length === 0) {
    throw new Error(`check "${kind}" rejects empty argv`);
  }
  if (!argv.every((part) => typeof part === 'string' && part.length > 0)) {
    throw new Error(`check "${kind}" argv entries must be non-empty strings`);
  }

  if (entry.cwdPolicy !== ALLOWED_CWD_POLICY) {
    throw new Error(`check "${kind}" cwdPolicy must be "${ALLOWED_CWD_POLICY}"`);
  }

  const timeoutMs = entry.timeoutMs;
  if (!Number.isInteger(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`check "${kind}" timeoutMs must be a positive integer`);
  }

  if (!Array.isArray(entry.artifacts)) {
    throw new Error(`check "${kind}" artifacts must be an array`);
  }
  const artifacts = entry.artifacts.map((artifact) =>
    validateArtifactPath(kind, artifact, projectRoot));

  return {
    argv: [...argv],
    cwdPolicy: ALLOWED_CWD_POLICY,
    timeoutMs,
    artifacts,
    commandDigest: commandDigest(argv),
  };
}

/**
 * Run a registered check and store derived evidence on the attempt.
 * `passed` is always derived from exitCode, timedOut, and artifact presence.
 * Caller-supplied `red` objects are ignored; only `asRed: true` with a
 * non-zero exit stores evidence.red.
 *
 * @param {string} project
 * @param {string} attemptId
 * @param {{ check: string, asRed?: boolean, red?: unknown }} options
 */
export async function verifyRun(project, attemptId, options = {}) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const kind = options.check;
  if (!kind || typeof kind !== 'string') {
    throw new Error('verify run requires --check <kind>');
  }
  const asRed = Boolean(options.asRed);
  // Caller-supplied red payloads are intentionally ignored.

  const attempt = getAttempt(project, attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);

  const registryPath = path.join(project, '.factory', 'checks.json');
  if (!fs.existsSync(registryPath)) {
    throw new Error('missing check registry: .factory/checks.json');
  }
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const validated = validateCheckRegistry(registry, { projectRoot: project });
  const entry = validated.checks[kind];
  if (!entry) throw new Error(`Unknown check kind: ${kind}`);

  const startedAt = new Date().toISOString();
  const { exitCode, timedOut, stdout, stderr } = await spawnCheck(entry.argv, {
    cwd: project,
    timeoutMs: entry.timeoutMs,
  });
  const finishedAt = new Date().toISOString();

  const logDigest = digestBytes(Buffer.concat([stdout, stderr]));
  const { artifactDigests, allPresent } = hashArtifacts(project, entry.artifacts);
  const { sourceRevision, worktreeClean } = resolveGitBinding(project);

  const passed = exitCode === 0
    && !timedOut
    && allPresent
    && worktreeClean
    && sourceRevision !== undefined;
  const record = {
    schemaVersion: SUPPORTED_SCHEMA_VERSION,
    kind,
    runner: { name: RUNNER_NAME, version: PACKAGE_VERSION },
    argv: [...entry.argv],
    commandDigest: entry.commandDigest,
    exitCode,
    startedAt,
    finishedAt,
    logDigest,
    artifactDigests,
    attemptId,
    passed,
    issuer: 'cli',
    timedOut,
    worktreeClean,
  };
  if (sourceRevision !== undefined) {
    record.sourceRevision = sourceRevision;
  }

  validateCheckRecord(record);

  if (asRed) {
    if (exitCode !== 0) {
      attempt.evidence.red = record;
    }
  } else {
    attempt.evidence.verification = [...(attempt.evidence.verification || []), record];
  }

  attempt.updatedAt = new Date().toISOString();
  writeText(attemptPath(project, attemptId), JSON.stringify(attempt, null, 2));
  return { attempt, record };
}

/**
 * Import a signature-valid attestation onto an attempt. Fail closed when
 * importKeys are missing, the key id is unknown, the signature is invalid,
 * attemptId/commandDigest/sourceRevision do not bind, or the worktree is dirty.
 * Never writes evidence.red. `passed` is derived from exitCode === 0.
 *
 * @param {string} project
 * @param {string} attemptId
 * @param {{ file: string }} options
 */
export async function verifyImport(project, attemptId, options = {}) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const filePath = options.file;
  if (!filePath || typeof filePath !== 'string' || filePath === true) {
    throw new Error('verify import requires --file <path>');
  }

  const attempt = getAttempt(project, attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${attemptId}`);

  const registryPath = path.join(project, '.factory', 'checks.json');
  if (!fs.existsSync(registryPath)) {
    throw new Error('missing check registry: .factory/checks.json');
  }
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const validated = validateCheckRegistry(registry, { projectRoot: project });

  const importKeys = registry.importKeys;
  if (!Array.isArray(importKeys) || importKeys.length === 0) {
    throw new Error('importKeys missing from check registry');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`attestation file not found: ${filePath}`);
  }
  const attestation = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!attestation || typeof attestation !== 'object' || Array.isArray(attestation)) {
    throw new Error('attestation must be an object');
  }

  const keyId = attestation.keyId;
  if (!keyId || typeof keyId !== 'string') {
    throw new Error('attestation requires keyId');
  }
  const keyEntry = importKeys.find((entry) => entry && entry.id === keyId);
  if (!keyEntry || typeof keyEntry.publicKeyPem !== 'string') {
    throw new Error(`unknown import key id: ${keyId}`);
  }

  const signature = attestation.signature;
  if (!signature || typeof signature !== 'string') {
    throw new Error('attestation requires base64 signature');
  }

  const signedPayload = { ...attestation };
  delete signedPayload.signature;
  const data = Buffer.from(canonicalJson(signedPayload), 'utf8');
  const signatureBytes = Buffer.from(signature, 'base64');
  let publicKey;
  try {
    publicKey = createPublicKey(keyEntry.publicKeyPem);
  } catch {
    throw new Error(`invalid import public key for id: ${keyId}`);
  }
  const signatureValid = verify(null, data, publicKey, signatureBytes);
  if (!signatureValid) {
    throw new Error('invalid attestation signature');
  }

  if (attestation.attemptId !== attemptId) {
    throw new Error(`attestation attemptId does not match target attempt: ${attemptId}`);
  }

  const kind = attestation.kind;
  if (!kind || typeof kind !== 'string') {
    throw new Error('attestation requires kind');
  }
  const entry = validated.checks[kind];
  if (!entry) throw new Error(`Unknown check kind: ${kind}`);
  if (attestation.commandDigest !== entry.commandDigest) {
    throw new Error('attestation commandDigest does not match registry argv');
  }

  const { sourceRevision, worktreeClean } = resolveGitBinding(project);
  if (!worktreeClean) {
    throw new Error('import rejected: worktree is dirty');
  }
  if (sourceRevision === undefined) {
    throw new Error('import rejected: git HEAD is unresolvable');
  }
  if (attestation.sourceRevision !== sourceRevision) {
    throw new Error('attestation sourceRevision does not match current clean HEAD');
  }

  if (attestation.exitCode === undefined || attestation.exitCode === null) {
    throw new Error('attestation requires exitCode');
  }

  const passed = attestation.exitCode === 0;
  const record = {
    schemaVersion: attestation.schemaVersion ?? SUPPORTED_SCHEMA_VERSION,
    kind,
    runner: attestation.runner,
    argv: Array.isArray(attestation.argv) ? [...attestation.argv] : [...entry.argv],
    commandDigest: entry.commandDigest,
    cwdPolicy: attestation.cwdPolicy ?? 'project',
    exitCode: attestation.exitCode,
    timedOut: Boolean(attestation.timedOut),
    startedAt: attestation.startedAt,
    finishedAt: attestation.finishedAt,
    sourceRevision,
    worktreeClean: true,
    logDigest: attestation.logDigest,
    artifactDigests: Array.isArray(attestation.artifactDigests)
      ? attestation.artifactDigests
      : [],
    attemptId,
    passed,
    issuer: 'import',
  };
  if (attestation.id !== undefined) {
    record.id = attestation.id;
  }

  validateCheckRecord(record);

  attempt.evidence.verification = [...(attempt.evidence.verification || []), record];
  // Import never writes evidence.red.

  attempt.updatedAt = new Date().toISOString();
  writeText(attemptPath(project, attemptId), JSON.stringify(attempt, null, 2));
  return { attempt, record };
}

function spawnCheck(argv, { cwd, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const stdoutChunks = [];
    const stderrChunks = [];
    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(chunk);
    });

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        exitCode: typeof code === 'number' ? code : 1,
        timedOut,
        stdout: Buffer.concat(stdoutChunks),
        stderr: Buffer.concat(stderrChunks),
      });
    });
  });
}

function hashArtifacts(projectRoot, artifacts) {
  const artifactDigests = [];
  let allPresent = true;
  for (const artifact of artifacts) {
    const fullPath = path.resolve(projectRoot, artifact);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
      allPresent = false;
      continue;
    }
    const bytes = fs.readFileSync(fullPath);
    artifactDigests.push({ path: artifact, digest: digestBytes(bytes) });
  }
  return { artifactDigests, allPresent };
}

/**
 * Resolve HEAD and worktree cleanliness for source-revision binding.
 * A pass requires a resolvable HEAD and an empty `git status --porcelain`.
 */
function resolveGitBinding(cwd) {
  const headResult = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
    shell: false,
  });
  if (headResult.status !== 0) {
    return { sourceRevision: undefined, worktreeClean: false };
  }
  const sha = (headResult.stdout || '').trim();
  if (!sha) {
    return { sourceRevision: undefined, worktreeClean: false };
  }

  const statusResult = spawnSync('git', ['status', '--porcelain'], {
    cwd,
    encoding: 'utf8',
    shell: false,
  });
  if (statusResult.status !== 0) {
    return { sourceRevision: sha, worktreeClean: false };
  }
  const worktreeClean = (statusResult.stdout || '').trim() === '';
  return { sourceRevision: sha, worktreeClean };
}

function validateArtifactPath(kind, artifact, projectRoot) {
  if (typeof artifact !== 'string' || artifact.length === 0) {
    throw new Error(`check "${kind}" artifact paths must be non-empty strings`);
  }
  if (artifact.includes('\0')) {
    throw new Error(`check "${kind}" artifact path is invalid`);
  }

  const segments = artifact.split(/[/\\]/).filter((part) => part.length > 0);
  if (segments.some((part) => part === '..')) {
    throw new Error(`check "${kind}" artifact path rejects parent-directory segments: ${artifact}`);
  }

  const resolved = path.isAbsolute(artifact)
    ? path.resolve(artifact)
    : path.resolve(projectRoot, artifact);
  const relative = path.relative(projectRoot, resolved);
  if (
    relative === ''
    || relative.startsWith(`..${path.sep}`)
    || relative === '..'
    || path.isAbsolute(relative)
  ) {
    throw new Error(`check "${kind}" artifact path is outside the project: ${artifact}`);
  }

  return artifact;
}
