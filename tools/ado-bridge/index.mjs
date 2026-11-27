import { timingSafeEqual } from 'node:crypto';

/**
 * Reference filter between an Azure DevOps service hook and a Cursor
 * Automation webhook. Not installed by `idefactory init`.
 *
 * Azure DevOps posts `workitem.updated` for every edit. This forwards only a
 * transition into the ready state on a tagged story that names an OpenSpec
 * change, so a comment or field edit does not bill a cloud run.
 */

const CHANGE_NAME = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export const DEFAULT_SETTINGS = {
  readyState: 'Ready for Factory',
  tag: 'factory',
  changeField: 'Custom.OpenSpecChange',
};

export function settingsFromEnv(env = {}) {
  return {
    readyState: env.FACTORY_READY_STATE || DEFAULT_SETTINGS.readyState,
    tag: env.FACTORY_TAG || DEFAULT_SETTINGS.tag,
    changeField: env.FACTORY_CHANGE_FIELD || DEFAULT_SETTINGS.changeField,
  };
}

/**
 * @param {object} payload Azure DevOps service hook body
 * @param {{ readyState: string, tag: string, changeField: string }} settings
 * @returns {{ forward: boolean, reason?: string, payload?: object }}
 */
export function decide(payload, settings = DEFAULT_SETTINGS) {
  if (payload?.eventType !== 'workitem.updated') return { forward: false, reason: 'not workitem.updated' };
  const resource = payload.resource || {};
  const stateChange = resource.fields?.['System.State'];
  if (!stateChange || stateChange.newValue !== settings.readyState) {
    return { forward: false, reason: 'no transition into the ready state' };
  }
  const fields = resource.revision?.fields || {};
  const tags = String(fields['System.Tags'] || '')
    .split(';')
    .map((tag) => tag.trim().toLowerCase());
  if (!tags.includes(settings.tag.toLowerCase())) return { forward: false, reason: 'missing factory tag' };
  const change = String(fields[settings.changeField] || '').trim();
  if (!CHANGE_NAME.test(change)) return { forward: false, reason: 'missing or invalid change name' };
  const workItemId = Number(resource.workItemId ?? resource.revision?.id);
  const revision = Number(resource.rev ?? resource.revision?.rev);
  if (!Number.isInteger(workItemId) || !Number.isInteger(revision)) {
    return { forward: false, reason: 'missing work item id or revision' };
  }
  return {
    forward: true,
    payload: {
      source: 'azure-devops',
      workItemId,
      revision,
      change,
      project: fields['System.TeamProject'] || '',
      url: resource.revision?.url || resource.url || '',
    },
  };
}

function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return headers.get(name) || '';
  const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
  return key ? String(headers[key]) : '';
}

function secretMatches(given, expected) {
  const a = Buffer.from(String(given));
  const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Platform-neutral handler. Wrap it in an Azure Function, Cloudflare Worker,
 * or any HTTPS endpoint that Azure DevOps can reach.
 * @param {{ headers: object, body: string }} request
 * @param {NodeJS.ProcessEnv} env ADO_HOOK_SECRET, CURSOR_AUTOMATION_URL, CURSOR_AUTOMATION_TOKEN
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<{ status: number, body: string }>}
 */
export async function handle(request, env = process.env, fetchImpl = fetch) {
  const { ADO_HOOK_SECRET, CURSOR_AUTOMATION_URL, CURSOR_AUTOMATION_TOKEN } = env;
  if (!ADO_HOOK_SECRET || !CURSOR_AUTOMATION_URL || !CURSOR_AUTOMATION_TOKEN) {
    return { status: 500, body: 'bridge is not configured' };
  }
  if (!secretMatches(header(request.headers, 'x-factory-hook-secret'), ADO_HOOK_SECRET)) {
    return { status: 401, body: 'unauthorized' };
  }
  let payload;
  try {
    payload = typeof request.body === 'string' ? JSON.parse(request.body) : request.body;
  } catch {
    return { status: 400, body: 'invalid JSON' };
  }
  const decision = decide(payload, settingsFromEnv(env));
  if (!decision.forward) return { status: 202, body: `ignored: ${decision.reason}` };
  const response = await fetchImpl(CURSOR_AUTOMATION_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CURSOR_AUTOMATION_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(decision.payload),
  });
  if (!response.ok) return { status: 502, body: `automation webhook returned ${response.status}` };
  return { status: 200, body: `forwarded work item ${decision.payload.workItemId} revision ${decision.payload.revision}` };
}
