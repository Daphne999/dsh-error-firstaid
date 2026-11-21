/**
 * 烟测：每条规则都要有"真实长相"的报错能被认出来，认不出的必须老实说不知道。
 * 跑法：node test/smoke.mjs
 */
import assert from 'node:assert/strict';
import { diagnose } from '../lib/match.mjs';
import { RULES } from '../lib/rules.mjs';
import { makeTools } from '../lib/index.js';

let pass = 0;
const ok = (name) => {
  pass++;
  console.log(`  ok  ${name}`);
};

// ---------- 1. 规则表自身的结构 ----------
for (const r of RULES) {
  assert.ok(r.id && r.title && r.stage && r.cause, `规则 ${r.id} 缺字段`);
  assert.ok(['tested', 'reported'].includes(r.source), `规则 ${r.id} 的 source 不合法`);
  assert.ok(Array.isArray(r.fixes) && r.fixes.length, `规则 ${r.id} 没有可执行的修复步骤`);
  for (const f of r.fixes) assert.ok(typeof f === 'string' && f.length > 8, `规则 ${r.id} 的某条 fix 太虚`);
  assert.ok(Array.isArray(r.signals) && r.signals.length, `规则 ${r.id} 没有信号`);
  for (const s of r.signals) assert.ok(s.re instanceof RegExp && s.w > 0, `规则 ${r.id} 的信号不合法`);
}
ok(`${RULES.length} 条规则结构完整（每条都有可执行的 fix）`);

// ---------- 2. 真实报错 → 对到正确的条目 ----------
const CASES = [
  ['[exit code: 3221225794] cmd /c echo ok', 'win-sandbox-0xc0000142'],
  ['PTY shell exited during startup', 'pty-shell-exited'],
  ['bundle patch 含配置/表达式,热挂载仅支持纯 insert;重启后由 bundle 层生效', 'patch-needs-insert'],
  ['package.json 带 BOM，装完不加载', 'bom-json'],
  ["ctx.get('tools') is undefined，live: []", 'inject-missing'],
  ['tool "media_read_audio" returned invalid output: "value.audio" must be an object', 'invalid-output-null'],
  ['unknown tool: media_read_video', 'unknown-tool'],
  ['fetch failed ... ECONNREFUSED 127.0.0.1:443', 'hosts-hijack'],
  ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'tls-leaf-signature'],
  ['Runner failure: windows-acl-run: --temp is not an existing directory', 'sandbox-temp-gone'],
  ['workspace changed since the checks ran; the evidence is stale: working tree changed', 'claimcheck-working-tree-changed'],
  ['Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)', 'exit-0-but-crash'],
  ['ffmpeg 解码失败（status=4294967283）', 'ffmpeg-temp-permission'],
  ['Error parsing filterchain', 'ffmpeg-filter-drive-colon'],
  ['ERR_PNPM_GIT_FETCH_FAILED schannel: InitializeSecurityContext failed: CRYPT_E_NO_REVOCATION_CHECK', 'pnpm-git-revocation'],
  ["Cannot find package '@deepseek-ai/dsh-llm'", 'link-missing-dsh-llm'],
  ['Error: Cannot find module D:\\x\\lib\\index.js', 'module-not-found-cwd'],
  ['403 self-restart is disabled for this host', 'self-restart-disabled'],
  ['桌面版按 Ctrl+F 没反应，想在会话里搜以前说过的话', 'no-ctrl-f-search'],
  ['listen EADDRINUSE: address already in use :::61310', 'eaddr-in-use'],
  ['401 Bad credentials', 'github-401-vs-403'],
  ['403 Resource not accessible by personal access token', 'github-401-vs-403'],
  ['官网下的 0.2.2-rc.3，首次启动就弹「应用无法启动或已意外停止」，crash-2026-11-15T05-26-56-820Z-main.log 里有 fetch failed', 'first-launch-fetch-failed'],
  ['覆盖升级后点工作区无反应，新建会话报 TypeError: ctx.agents.roots is not a function', 'upgrade-rc3-agents-roots'],
  ['0.2.2-rc.3 在 Windows 上启动约 14 秒后必崩：fetch failed / ECONNRESET，主进程未捕获', 'startup-crash-rc3-fetch'],
  ['加了外部 bundle 之后起不来：EMFILE too many open files，句柄撞到 8192', 'emfile-external-bundle'],
  ['插件管理器更新提示 applied 成功，但 dsh.profile.bundles 里已经没有这个包，重启后插件消失', 'bundle-vanished-after-update'],
  ['cannot modify "D:\\ds工作区\\x\\package.json": file has not been read — read the file, then retry', 'fs-write-needs-read'],
  ['Error: cannot write "D:\\x\\cordis.patch.yml": file no longer exists — re-read the file, then retry', 'fs-stale-after-change'],
  ['Error: tool "proactive_list" returned invalid output: "value" must match exactly one oneOf branch (matched 0)', 'plugin-invalid-output-oneof'],
  ['/usr/bin/bash: line 1: Select-Object: command not found', 'shell-dialect-mismatch'],
  ['Error: Error: rejected checks — check-1: title is required (what must be true, in one line)', 'claimcheck-check-title-missing'],
  ['Error: Error: version_conflict: stale version 3 (current 4); re-read the task and retry once', 'taskboard-version-conflict'],
];

for (const [text, want] of CASES) {
  const r = diagnose(text);
  assert.equal(r.found, true, `应该能认出：${text}`);
  assert.equal(r.ruleId, want, `认错了：${text}\n  期望 ${want}，实际 ${r.ruleId}`);
}
ok(`${CASES.length} 段真实报错全部对到了正确的条目`);

// ---------- 3. 匹配不到必须说不知道（不猜） ----------
const UNKNOWN = [
  '今天天气不错',
  '我的猫不吃饭怎么办',
  '帮我写个小红书文案',
  '503 Service Unavailable',
  '视频渲染出来颜色不对',
];
for (const text of UNKNOWN) {
  const r = diagnose(text);
  assert.equal(r.found, false, `不该硬猜：${text}（却给了 ${r.ruleId}）`);
  assert.ok(r.report.includes('不猜'), '不知道时的回复要明说"不猜"');
  assert.ok(r.report.includes('官方讨论区'), '不知道时要告诉他去哪问');
}
ok(`${UNKNOWN.length} 段无关文本全部返回"不知道"，没有瞎猜`);

// ---------- 4. 上下文抽取 ----------
{
  const r = diagnose('DSH 0.2.2-rc.3 下 [exit code: 3221225794]，宿主在 127.0.0.1:49749');
  assert.equal(r.context.version, '0.2.2-rc.3');
  assert.equal(r.context.exitCode, '3221225794');
  assert.equal(r.context.port, '49749');
  ok('能从报错里抽出 版本/退出码/端口');
}

// ---------- 5. 工具层：参数与输出形状 ----------
{
  const tools = makeTools();
  assert.equal(tools.length, 2, '应该有两个工具');
  const [firstaidError, firstaidList] = tools;
  assert.equal(firstaidError.name, 'firstaid_error');
  assert.equal(firstaidList.name, 'firstaid_list');

  // 空文本要给出引导而不是崩
  const empty = await firstaidError.execute({ text: '' });
  assert.equal(empty.ok, false);
  assert.ok(empty.report.length > 0);

  // 正常命中：所有字段都在，且没有 null（宿主不接受 null）
  const hit = await firstaidError.execute({ text: '[exit code: 3221225794]' });
  for (const k of ['ok', 'report', 'ruleId', 'confidence', 'others', 'context']) {
    assert.ok(k in hit, `输出缺字段 ${k}`);
    assert.notEqual(hit[k], null, `输出字段 ${k} 不能是 null`);
  }
  assert.equal(hit.ruleId, 'win-sandbox-0xc0000142');

  // 未命中：ok=false，但字段同样齐全
  const miss = await firstaidError.execute({ text: '随便一句话' });
  assert.equal(miss.ok, false);
  for (const k of ['ok', 'report', 'ruleId', 'confidence', 'others', 'context']) {
    assert.ok(k in miss && miss[k] !== null, `未命中时字段 ${k} 不合法`);
  }

  const list = await firstaidList.execute({});
  assert.equal(list.ok, true);
  assert.ok(list.report.includes(`${RULES.length} 类问题`));
  assert.ok(list.report.includes('实测过'));
  assert.ok(list.report.includes('社区报告'));
  ok('两个工具的入参与输出形状都对（无 null、字段齐全）');
}

console.log(`\n全部通过：${pass} 组断言`);
