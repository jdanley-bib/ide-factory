import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getAttempt } from './attempt.mjs';
import { describeException, listAttemptExceptions } from './red-exceptions.mjs';
import { describeReopens } from './attempt-reopen.mjs';
import { describeAttemptMethod, describeCoverage, describeMethod } from './red-method.mjs';
import {
  assertSafeForgeArgv,
  azurePullRequestUrl,
  buildAzureCreatePullRequestArgv,
  buildAzureThreadsArgv,
  buildAzureUpdatePullRequestArgv,
  buildCommentPullRequestArgv,
  buildCreatePullRequestArgv,
  buildListCommentsArgv,
  buildUpdatePullRequestArgv,
  runForge,
} from './forge.mjs';
import { forgeConfigErrors, readForgeConfig } from './integration-config.mjs';
import { createPlan, mcpOrgName } from './mcp-plan.mjs';
import { halted, writeText } from './layout.mjs';

const CHANGE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

/**
 * Open or update the single pull request for an OpenSpec change.
 * @param {string} project
 * @param {string} change
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ record: object, created: boolean }}
 */
export function openPullRequest(project, change, env = process.env) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const name = String(change || '').trim();
  if (!CHANGE_NAME.test(name)) {
    throw new Error('Usage: idefactory pr open <change>');
  }

  const branch = `factory/${name}`;
  const existing = readPullRequestRecord(project, name);
  const body = buildPullRequestBody(project, name);
  const bodyDigest = digestBody(body);
  const forge = forgePort(project);

  if (forge.transport === 'mcp') {
    return planOpenPullRequest(project, { name, branch, existing, body, bodyDigest, forge });
  }

  if (!existing) {
    ensureBranch(project, branch);
    const { number, url } = forge.create(project, { branch, title: name, body }, env);
    const record = {
      change: name,
      provider: forge.provider,
      branch,
      pullRequest: {
        number,
        url,
      },
      bodyDigest,
      postedVerdicts: [],
      capturedComments: [],
    };
    writePullRequestRecord(project, record);
    return { record, created: true, applied: true, plan: null };
  }

  forge.update(project, { number: existing.pullRequest.number, body }, env);
  const record = {
    ...existing,
    change: name,
    branch: existing.branch || branch,
    bodyDigest,
    postedVerdicts: Array.isArray(existing.postedVerdicts) ? existing.postedVerdicts : [],
    capturedComments: Array.isArray(existing.capturedComments) ? existing.capturedComments : [],
  };
  writePullRequestRecord(project, record);
  return { record, created: false, applied: true, plan: null };
}

/**
 * Post the verdict already stored on an attempt. Does not create a verdict.
 * @param {string} project
 * @param {string} attemptId
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ record: object }}
 */
export function commentOnPullRequest(project, attemptId, env = process.env) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const id = String(attemptId || '').trim();
  if (!id) throw new Error('Usage: idefactory pr comment <attemptId>');
  const attempt = getAttempt(project, id);
  if (!attempt) throw new Error(`Attempt not found: ${id}`);

  const review = attempt.evidence?.review;
  const verdict = typeof review?.verdict === 'string' ? review.verdict.trim() : '';
  const role = typeof review?.role === 'string' ? review.role.trim() : '';
  if (!verdict || !role) {
    throw new Error('pr comment requires a verdict and role already stored on the attempt');
  }

  const reviewerId = review.reviewerId || attempt.reviewerId;
  return postVerdictComment(project, {
    attemptId: attempt.id,
    verdict,
    role,
    reviewerId: typeof reviewerId === 'string' ? reviewerId : null,
  }, env);
}

/**
 * Post one already-stored verdict through the forge port.
 * Does not read or write evidence.review.
 * @param {string} project
 * @param {{ attemptId: string, verdict: string, role: string, reviewerId?: string|null }} stored
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ record: object }}
 */
export function postVerdictComment(project, stored, env = process.env) {
  const attempt = getAttempt(project, stored.attemptId);
  if (!attempt) throw new Error(`Attempt not found: ${stored.attemptId}`);
  const record = readPullRequestRecord(project, attempt.change);
  if (!record) {
    throw new Error(`No pull request record for ${attempt.change}`);
  }

  const postedVerdicts = Array.isArray(record.postedVerdicts) ? record.postedVerdicts : [];
  const reopenCount = Array.isArray(attempt.evidence?.reopens) ? attempt.evidence.reopens.length : 0;
  const alreadyPosted = postedVerdicts.some(
    (item) => item?.attemptId === attempt.id
      && item?.role === stored.role
      && (item?.reopenCount ?? 0) === reopenCount,
  );
  if (alreadyPosted) return { record, applied: true, plan: null };

  const lines = [
    `Role: ${stored.role}`,
    `Verdict: ${stored.verdict}`,
    `Attempt: ${attempt.id}`,
  ];
  if (typeof stored.reviewerId === 'string' && stored.reviewerId.length > 0) {
    lines.push(`Reviewer: ${stored.reviewerId}`);
  }
  const exceptions = listAttemptExceptions(project, attempt);
  const port = forgePort(project);
  const method = describeAttemptMethod(project, attempt);
  const posted = {
    attemptId: attempt.id,
    verdict: stored.verdict,
    role: stored.role,
    reviewerId: stored.reviewerId || null,
    ...(reopenCount > 0 ? { reopenCount } : {}),
  };
  const build = (withReason) => `${[
    ...lines,
    ...describeReopens(attempt, { withReason }),
    ...(method ? [describeMethod(method, { withText: withReason }), ...describeCoverage(method)] : []),
    ...exceptions.map((row) => describeException(row, { withReason })),
  ].join('\n')}\n`;
  let body = build(true);
  const hasDetail = exceptions.length > 0 || Boolean(method) || describeReopens(attempt).length > 0;
  if (hasDetail && !port.acceptsCommentBody(record.pullRequest.number, body)) {
    body = build(false);
  }
  if (port.transport === 'mcp') {
    const next = {
      ...record,
      postedVerdicts: [...postedVerdicts, posted],
      capturedComments: Array.isArray(record.capturedComments) ? record.capturedComments : [],
    };
    const plan = createPlan(project, {
      kind: 'pr-comment',
      change: attempt.change,
      operations: [{
        tool: 'repo_pull_request_thread_write',
        arguments: {
          action: 'create',
          ...mcpScope(port.forge),
          pullRequestId: record.pullRequest.number,
          content: body,
        },
      }],
      effects: { writes: [{ path: pullRequestRecordRelative(attempt.change), json: next }] },
    });
    return { record: next, applied: false, plan };
  }
  port.comment(project, { number: record.pullRequest.number, body }, env);

  const next = {
    ...record,
    postedVerdicts: [...postedVerdicts, posted],
    capturedComments: Array.isArray(record.capturedComments) ? record.capturedComments : [],
  };
  writePullRequestRecord(project, next);
  return { record: next, applied: true, plan: null };
}

/**
 * Store human pull request comments once, keyed by forge comment id.
 * Does not authorize accept or complete.
 * @param {string} project
 * @param {string} change
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ record: object }}
 */
export function capturePullRequestComments(project, change, env = process.env, { threadsFile } = {}) {
  if (halted(project)) {
    throw new Error('HALT file present. Factory commands are stopped. Remove it with idefactory resume.');
  }
  const name = String(change || '').trim();
  if (!CHANGE_NAME.test(name)) {
    throw new Error('Usage: idefactory pr capture <change>');
  }
  const record = readPullRequestRecord(project, name);
  if (!record) {
    throw new Error(`No pull request record for ${name}`);
  }

  const port = forgePort(project);
  const incoming = port.transport === 'mcp'
    ? port.commentsFromThreads(readThreadsFile(port.forge, threadsFile, record.pullRequest.number), record.pullRequest.url)
    : port.listComments(project, {
      number: record.pullRequest.number,
      url: record.pullRequest.url,
    }, env);
  const captured = Array.isArray(record.capturedComments) ? [...record.capturedComments] : [];
  const seen = new Set(captured.map((item) => String(item.id)));
  for (const raw of incoming) {
    const comment = normalizeCapturedComment(raw);
    if (!comment || seen.has(comment.id)) continue;
    captured.push(comment);
    seen.add(comment.id);
  }
  const next = {
    ...record,
    postedVerdicts: Array.isArray(record.postedVerdicts) ? record.postedVerdicts : [],
    capturedComments: captured,
  };
  writePullRequestRecord(project, next);
  return { record: next };
}

function normalizeCapturedComment(raw) {
  if (!raw || raw.id === undefined || raw.id === null) return null;
  const id = String(raw.id).trim();
  if (!id) return null;
  let author = '';
  if (typeof raw.author === 'string') author = raw.author;
  else if (raw.author && typeof raw.author.login === 'string') author = raw.author.login;
  const url = typeof raw.url === 'string' ? raw.url : '';
  const time = typeof raw.createdAt === 'string'
    ? raw.createdAt
    : (typeof raw.time === 'string' ? raw.time : '');
  const body = typeof raw.body === 'string' ? raw.body : '';
  return { id, author, url, time, body };
}

/**
 * @param {string} project
 * @param {string} change
 * @returns {string}
 */
export function pullRequestRecordPath(project, change) {
  return path.join(project, '.factory', 'pull-requests', `${change}.json`);
}

/**
 * @param {string} project
 * @param {string} change
 * @returns {object|null}
 */
export function readPullRequestRecord(project, change) {
  const file = pullRequestRecordPath(project, change);
  if (!fs.existsSync(file)) return null;
  try {
    const record = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!record || record.change !== change) return null;
    if (!record.pullRequest || !Number.isInteger(record.pullRequest.number)) return null;
    return record;
  } catch {
    return null;
  }
}

/**
 * A change is deliverable only when pr open wrote a factory-branch record
 * that names a positive pull request number and a non-empty URL.
 * @param {string} project
 * @param {string} change
 * @returns {boolean}
 */
export function isDeliverableChange(project, change) {
  const record = readPullRequestRecord(project, change);
  if (!record) return false;
  if (record.branch !== `factory/${change}`) return false;
  const number = record.pullRequest?.number;
  const url = record.pullRequest?.url;
  if (!Number.isInteger(number) || number <= 0) return false;
  if (typeof url !== 'string' || url.length === 0) return false;
  return true;
}

/**
 * Stage 1 exit record check. The result follows isDeliverableChange.
 * @param {string} project
 * @param {string} change
 * @returns {{ change: string, result: 'pass' | 'fail' }}
 */
export function stage1ExitRecordCheck(project, change) {
  return {
    change,
    result: isDeliverableChange(project, change) ? 'pass' : 'fail',
  };
}

function writePullRequestRecord(project, record) {
  writeText(pullRequestRecordPath(project, record.change), `${JSON.stringify(record, null, 2)}\n`);
}

/**
 * Build a pull request body that links factory evidence without copying logs
 * or environment values.
 * @param {string} project
 * @param {string} change
 * @returns {string}
 */
export function buildPullRequestBody(project, change) {
  const sourceRevision = resolveSourceRevision(project, change);
  const attempts = listAttemptsForChange(project, change);
  const lines = [
    `# ${change}`,
    '',
    `Change: ${change}`,
    `Source revision: ${sourceRevision || '(unknown)'}`,
    '',
    'Attempts:',
  ];
  if (attempts.length === 0) {
    lines.push('- (none recorded)');
  } else {
    for (const attempt of attempts) {
      const rel = `.factory/attempts/${attempt.id}.json`;
      lines.push(`- \`${attempt.id}\` (\`${rel}\`)`);
    }
  }

  const approvalPaths = listExistingApprovalPaths(project);
  lines.push('', 'Approvals:');
  if (approvalPaths.length === 0) {
    lines.push('- (none)');
  } else {
    for (const rel of approvalPaths) {
      lines.push(`- \`${rel}\``);
    }
  }

  const checkRecordPaths = attempts.map((attempt) => `.factory/attempts/${attempt.id}.json`);
  lines.push('', 'Check records:');
  if (checkRecordPaths.length === 0) {
    lines.push('- (none)');
  } else {
    for (const rel of checkRecordPaths) {
      lines.push(`- \`${rel}\``);
    }
  }

  return `${lines.join('\n')}\n`;
}

function resolveSourceRevision(project, change) {
  const fromGit = gitHead(project);
  if (fromGit) return fromGit;
  const attempts = listAttemptsForChange(project, change);
  for (const attempt of attempts) {
    for (const record of attempt.evidence?.verification || []) {
      if (typeof record?.sourceRevision === 'string' && record.sourceRevision.length > 0) {
        return record.sourceRevision;
      }
    }
    if (typeof attempt.evidence?.red?.sourceRevision === 'string'
      && attempt.evidence.red.sourceRevision.length > 0) {
      return attempt.evidence.red.sourceRevision;
    }
    const reds = attempt.evidence?.reds;
    if (reds && typeof reds === 'object') {
      for (const record of Object.values(reds)) {
        if (typeof record?.sourceRevision === 'string' && record.sourceRevision.length > 0) {
          return record.sourceRevision;
        }
      }
    }
  }
  return '';
}

function listAttemptsForChange(project, change) {
  const root = path.join(project, '.factory', 'attempts');
  if (!fs.existsSync(root)) return [];
  const attempts = [];
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(root, name);
    try {
      const attempt = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (attempt?.change === change && typeof attempt.id === 'string') {
        attempts.push(attempt);
      }
    } catch {
      // Skip unreadable attempt files.
    }
  }
  attempts.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return attempts;
}

function listExistingApprovalPaths(project) {
  const root = path.join(project, '.factory', 'approvals');
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => `.factory/approvals/${name}`);
}

function gitHead(project) {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], {
    cwd: project,
    encoding: 'utf8',
    shell: false,
  });
  if (result.status !== 0) return '';
  return (result.stdout || '').trim();
}

function digestBody(body) {
  return `sha256:${createHash('sha256').update(body).digest('hex')}`;
}

function ensureBranch(project, branch) {
  const existing = spawnSync('git', ['rev-parse', '--verify', branch], {
    cwd: project,
    encoding: 'utf8',
    shell: false,
  });
  if (existing.status === 0) return;
  const created = spawnSync('git', ['branch', branch, 'HEAD'], {
    cwd: project,
    encoding: 'utf8',
    shell: false,
  });
  if (created.status !== 0) {
    throw new Error(created.stderr.trim() || `failed to create branch ${branch}`);
  }
}

function parseCreatedPullRequestUrl(stdout) {
  const url = String(stdout || '').trim();
  if (!/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/pull\/[1-9]\d*$/.test(url)) {
    throw new Error('forge create did not return a pull request URL');
  }
  return url;
}

function runChecked(project, argv, env) {
  const result = runForge(project, argv, env);
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `forge exited ${result.status}`);
  }
  return result.stdout;
}

function parseForgeJson(stdout, what) {
  try {
    return JSON.parse(stdout);
  } catch {
    throw new Error(`forge ${what} returned invalid JSON`);
  }
}

const githubPort = {
  provider: 'github',
  create(project, { branch, title, body }, env) {
    const url = parseCreatedPullRequestUrl(runChecked(project, buildCreatePullRequestArgv({ branch, title, body }), env));
    const number = Number(url.split('/').at(-1));
    if (!Number.isInteger(number) || number <= 0) {
      throw new Error('forge create returned an invalid pull request URL');
    }
    return { number, url };
  },
  update(project, { number, body }, env) {
    runChecked(project, buildUpdatePullRequestArgv({ number, body }), env);
  },
  comment(project, { number, body }, env) {
    runChecked(project, buildCommentPullRequestArgv({ number, body }), env);
  },
  acceptsCommentBody(number, body) {
    try {
      assertSafeForgeArgv(buildCommentPullRequestArgv({ number, body }));
      return true;
    } catch {
      return false;
    }
  },
  listComments(project, { number }, env) {
    const parsed = parseForgeJson(runChecked(project, buildListCommentsArgv({ number }), env), 'comment list');
    return Array.isArray(parsed?.comments) ? parsed.comments : [];
  },
};

function azurePort(forge) {
  return {
    provider: 'azure-devops',
    create(project, { branch, title, body }, env) {
      const parsed = parseForgeJson(runChecked(project, buildAzureCreatePullRequestArgv({
        ...forge,
        branch,
        title,
        body,
      }), env), 'create');
      const number = Number(parsed?.pullRequestId);
      if (!Number.isInteger(number) || number <= 0) {
        throw new Error('forge create did not return a pull request id');
      }
      return { number, url: azurePullRequestUrl(forge, number) };
    },
    update(project, { number, body }, env) {
      runChecked(project, buildAzureUpdatePullRequestArgv({
        organization: forge.organization,
        number,
        body,
      }), env);
    },
    acceptsCommentBody() {
      return true;
    },
    comment(project, { number, body }, env) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'idefactory-thread-'));
      const file = path.join(dir, 'thread.json');
      try {
        fs.writeFileSync(file, JSON.stringify({
          comments: [{ parentCommentId: 0, content: body, commentType: 1 }],
          status: 1,
        }));
        runChecked(project, buildAzureThreadsArgv({ ...forge, number, file }), env);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    },
    listComments(project, { number, url }, env) {
      const parsed = parseForgeJson(runChecked(project, buildAzureThreadsArgv({ ...forge, number }), env), 'comment list');
      return azureCommentsFromThreads(Array.isArray(parsed?.value) ? parsed.value : [], url);
    },
  };
}

function azureCommentsFromThreads(threads, url) {
  const comments = [];
  for (const thread of threads) {
    for (const comment of Array.isArray(thread?.comments) ? thread.comments : []) {
      if (comment?.commentType === 'system' || comment?.commentType === 3) continue;
      if (thread.id === undefined || comment.id === undefined) continue;
      comments.push({
        id: `${thread.id}:${comment.id}`,
        author: comment.author?.uniqueName || comment.author?.displayName || '',
        url: url ? `${url}?discussionId=${thread.id}` : '',
        createdAt: comment.publishedDate || '',
        body: typeof comment.content === 'string' ? comment.content : '',
      });
    }
  }
  return comments;
}

function azureMcpPort(forge) {
  return {
    provider: 'azure-devops',
    transport: 'mcp',
    forge,
    acceptsCommentBody() {
      return true;
    },
    commentsFromThreads(threads, url) {
      return azureCommentsFromThreads(threads, url);
    },
  };
}

function mcpScope(forge) {
  return {
    orgName: mcpOrgName(forge.organization),
    project: forge.project,
    repositoryId: forge.repository,
  };
}

const AZURE_DESCRIPTION_LIMIT = 4000;

function truncateDescription(body) {
  if (body.length <= AZURE_DESCRIPTION_LIMIT) return body;
  const note = '\n\n(Truncated for Azure DevOps. Full evidence list: .factory/attempts/ in the repository.)';
  return `${body.slice(0, AZURE_DESCRIPTION_LIMIT - note.length)}${note}`;
}

function pullRequestRecordRelative(change) {
  return `.factory/pull-requests/${change}.json`;
}

function linkedWorkItemId(project, change) {
  try {
    const id = JSON.parse(fs.readFileSync(path.join(project, '.factory', 'boards', `${change}.json`), 'utf8'))?.workItem?.id;
    return Number.isInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function planOpenPullRequest(project, { name, branch, existing, body, bodyDigest, forge: port }) {
  const forge = port.forge;
  const scope = mcpScope(forge);
  const description = truncateDescription(body);
  if (!existing) {
    ensureBranch(project, branch);
    const record = {
      change: name,
      provider: port.provider,
      branch,
      pullRequest: { number: null, url: null },
      bodyDigest,
      postedVerdicts: [],
      capturedComments: [],
    };
    const workItemId = linkedWorkItemId(project, name);
    const plan = createPlan(project, {
      kind: 'pr-open',
      change: name,
      operations: [{
        tool: 'repo_pull_request_write',
        arguments: {
          action: 'create',
          ...scope,
          sourceRefName: `refs/heads/${branch}`,
          targetRefName: `refs/heads/${forge.targetBranch}`,
          title: name,
          description,
          ...(workItemId ? { workItems: String(workItemId) } : {}),
        },
      }],
      effects: {
        writes: [{ path: pullRequestRecordRelative(name), json: record }],
        bind: [{
          result: 'pullRequestId',
          write: 0,
          pointer: ['pullRequest', 'number'],
          urlPointer: ['pullRequest', 'url'],
          urlTemplate: `${azurePullRequestUrl(forge, 1).replace(/\/1$/, '/{id}')}`,
        }],
      },
    });
    return { record, created: true, applied: false, plan };
  }
  const record = {
    ...existing,
    change: name,
    branch: existing.branch || branch,
    bodyDigest,
    postedVerdicts: Array.isArray(existing.postedVerdicts) ? existing.postedVerdicts : [],
    capturedComments: Array.isArray(existing.capturedComments) ? existing.capturedComments : [],
  };
  const plan = createPlan(project, {
    kind: 'pr-open',
    change: name,
    operations: [{
      tool: 'repo_pull_request_write',
      arguments: {
        action: 'update',
        ...scope,
        pullRequestId: existing.pullRequest.number,
        description,
      },
    }],
    effects: { writes: [{ path: pullRequestRecordRelative(name), json: record }] },
  });
  return { record, created: false, applied: false, plan };
}

function readThreadsFile(forge, file, number) {
  if (!file) {
    throw new Error(
      `pr capture needs --threads-file <file>. Run repo_pull_request_thread with action list, orgName ${mcpOrgName(forge.organization)}, project ${forge.project}, repositoryId ${forge.repository}, pullRequestId ${number}, and save the result to a file.`,
    );
  }
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`cannot read threads file ${file}: ${error.message}`);
  }
  const threads = Array.isArray(raw) ? raw : (raw?.value ?? raw?.threads);
  if (!Array.isArray(threads)) {
    throw new Error(`threads file ${file} has no thread list. Save the repo_pull_request_thread list result unchanged.`);
  }
  return threads;
}

/**
 * True when Azure DevOps writes go through MCP plans, so an attempt transition
 * must not try to post a verdict on its own.
 * @param {string} project
 */
export function forgeDefersWrites(project) {
  const forge = readForgeConfig(project);
  return forge.provider === 'azure-devops' && forge.transport === 'mcp';
}

function forgePort(project) {
  const forge = readForgeConfig(project);
  const errors = forgeConfigErrors(forge);
  if (errors.length) throw new Error(errors.join('\n'));
  if (forge.provider !== 'azure-devops') return githubPort;
  return forge.transport === 'az' ? azurePort(forge) : azureMcpPort(forge);
}
