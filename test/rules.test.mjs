/**
 * node:test suite — runs under `node --test`.
 *
 * The scenario smoke (`test/smoke.mjs`) covers the full 33-case table end to end;
 * this suite pins the contract that must not regress: rule-table shape, the new
 * evidence-based rules, the honest-unknown path, and the tool output envelope.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { RULES } from '../lib/rules.mjs';
import { diagnose } from '../lib/match.mjs';
import { makeTools } from '../lib/index.js';

test('rule table is structurally complete', () => {
  assert.ok(RULES.length >= 30, `expected at least 30 rules, got ${RULES.length}`);
  const ids = new Set();
  for (const r of RULES) {
    assert.ok(r.id && r.title && r.stage && r.cause, `rule ${r.id} misses a field`);
    assert.ok(['tested', 'reported'].includes(r.source), `rule ${r.id} has a bad source`);
    assert.ok(Array.isArray(r.fixes) && r.fixes.length > 0, `rule ${r.id} has no fix`);
    assert.ok(Array.isArray(r.signals) && r.signals.length > 0, `rule ${r.id} has no signal`);
    for (const s of r.signals) assert.ok(s.re instanceof RegExp && s.w > 0, `rule ${r.id} bad signal`);
    assert.ok(!ids.has(r.id), `duplicate rule id ${r.id}`);
    ids.add(r.id);
  }
});

test('new evidence-based rules match real error strings', () => {
  const cases = [
    ['cannot modify "D:\\w\\package.json": file has not been read — read the file, then retry', 'fs-write-needs-read'],
    ['Error: cannot write "D:\\w\\cordis.patch.yml": file no longer exists — re-read the file, then retry', 'fs-stale-after-change'],
    ['Error: tool "proactive_list" returned invalid output: "value" must match exactly one oneOf branch (matched 0)', 'plugin-invalid-output-oneof'],
    ['/usr/bin/bash: line 1: Select-Object: command not found', 'shell-dialect-mismatch'],
    ['Error: Error: rejected checks — check-1: title is required (what must be true, in one line)', 'claimcheck-check-title-missing'],
    ['Error: Error: version_conflict: stale version 3 (current 4); re-read the task and retry once', 'taskboard-version-conflict'],
    ['Error: cannot read "D:\\x\\a.jpg": the .jpg extension declares image/jpeg, but the bytes use a different image format; rename the file to match its actual format', 'image-extension-mismatch'],
    ['Error: old_string was not found in "D:\\x\\a.txt"', 'edit-old-string-missing'],
  ];
  for (const [text, want] of cases) {
    const r = diagnose(text);
    assert.equal(r.found, true, `should match: ${text}`);
    assert.equal(r.ruleId, want, `wrong rule for: ${text}`);
  }
});

test('unknown text yields an honest "I do not know"', () => {
  for (const text of ['今天天气不错', '503 Service Unavailable', '视频渲染出来颜色不对']) {
    const r = diagnose(text);
    assert.equal(r.found, false, `should not guess: ${text}`);
    assert.match(r.report, /不猜/);
  }
});

test('apply() registers both tools through the tools service', async () => {
  const { apply } = await import('../lib/index.js');
  const registered = [];
  const ctx = { get: (name) => (name === 'tools' ? { register: (tool) => registered.push(tool.name) } : undefined) };
  await apply(ctx);
  assert.deepEqual(registered, ['firstaid_error', 'firstaid_list']);
});

test('tool envelope has no nulls and exposes list/inspect', async () => {
  const tools = makeTools();
  assert.equal(tools.length, 2);
  assert.deepEqual(tools.map((t) => t.name), ['firstaid_error', 'firstaid_list']);
  const hit = await tools[0].execute({ text: '[exit code: 3221225794]' });
  for (const key of ['ok', 'report', 'ruleId', 'confidence', 'others', 'context']) {
    assert.ok(key in hit, `missing ${key}`);
    assert.notEqual(hit[key], null, `${key} must not be null`);
  }
  const list = await tools[1].execute({});
  assert.equal(list.ok, true);
  assert.match(list.report, new RegExp(`${RULES.length} 类问题`));
});
