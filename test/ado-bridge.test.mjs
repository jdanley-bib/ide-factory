import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decide, handle } from '../tools/ado-bridge/index.mjs';

const SETTINGS = { readyState: 'Ready for Factory', tag: 'factory', changeField: 'Custom.OpenSpecChange' };

function event(overrides = {}) {
  return {
    eventType: 'workitem.updated',
    resource: {
      workItemId: 512,
      rev: 9,
      fields: { 'System.State': { oldValue: 'New', newValue: 'Ready for Factory' } },
      revision: {
        id: 512,
        rev: 9,
        url: 'https://dev.azure.com/contoso/_apis/wit/workItems/512/revisions/9',
        fields: {
          'System.TeamProject': 'Shop',
          'System.State': 'Ready for Factory',
          'System.Tags': 'checkout; Factory',
          'Custom.OpenSpecChange': 'one-click-checkout',
        },
      },
      ...overrides.resource,
    },
    ...overrides.event,
  };
}

const ENV = {
  ADO_HOOK_SECRET: 'hook-secret-value',
  CURSOR_AUTOMATION_URL: 'https://api2.cursor.sh/automations/webhook/abc',
  CURSOR_AUTOMATION_TOKEN: 'crsr_automation_token',
};

function request(body, secret = ENV.ADO_HOOK_SECRET) {
  return {
    headers: { 'x-factory-hook-secret': secret, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function recordingFetch() {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => '' };
  };
  return { calls, fetchImpl };
}

test('decide forwards only a transition into the ready state with the tag and change field', () => {
  const forwarded = decide(event(), SETTINGS);
  assert.deepEqual(forwarded, {
    forward: true,
    payload: {
      source: 'azure-devops',
      workItemId: 512,
      revision: 9,
      change: 'one-click-checkout',
      project: 'Shop',
      url: 'https://dev.azure.com/contoso/_apis/wit/workItems/512/revisions/9',
    },
  });

  const commentOnly = event({ resource: { fields: { 'System.History': { newValue: 'nice' } } } });
  assert.equal(decide(commentOnly, SETTINGS).forward, false);

  const other = event({ event: { eventType: 'workitem.commented' } });
  assert.equal(decide(other, SETTINGS).forward, false);

  const untagged = event();
  untagged.resource.revision.fields['System.Tags'] = 'checkout';
  assert.equal(decide(untagged, SETTINGS).forward, false);

  const badName = event();
  badName.resource.revision.fields['Custom.OpenSpecChange'] = '../escape';
  assert.equal(decide(badName, SETTINGS).forward, false);

  const elsewhere = event({ resource: { fields: { 'System.State': { oldValue: 'New', newValue: 'Active' } } } });
  assert.equal(decide(elsewhere, SETTINGS).forward, false);
});

test('handle rejects a wrong secret and drops non-ready events without calling the webhook', async () => {
  const { calls, fetchImpl } = recordingFetch();
  const denied = await handle(request(event(), 'wrong'), ENV, fetchImpl);
  assert.equal(denied.status, 401);
  const missing = await handle({ headers: {}, body: JSON.stringify(event()) }, ENV, fetchImpl);
  assert.equal(missing.status, 401);
  const dropped = await handle(request(event({ resource: { fields: {} } })), ENV, fetchImpl);
  assert.equal(dropped.status, 202);
  const invalid = await handle({ headers: request({}).headers, body: '{not json' }, ENV, fetchImpl);
  assert.equal(invalid.status, 400);
  assert.equal(calls.length, 0);
});

test('handle forwards a ready transition with a bearer header', async () => {
  const { calls, fetchImpl } = recordingFetch();
  const result = await handle(request(event()), ENV, fetchImpl);
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, ENV.CURSOR_AUTOMATION_URL);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${ENV.CURSOR_AUTOMATION_TOKEN}`);
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.change, 'one-click-checkout');
  assert.equal(body.workItemId, 512);
  assert.equal(body.revision, 9);
  assert.doesNotMatch(calls[0].init.body, /hook-secret-value/);
});

test('handle refuses to run without its configuration', async () => {
  const { calls, fetchImpl } = recordingFetch();
  const result = await handle(request(event()), { ADO_HOOK_SECRET: ENV.ADO_HOOK_SECRET }, fetchImpl);
  assert.equal(result.status, 500);
  assert.equal(calls.length, 0);
});
