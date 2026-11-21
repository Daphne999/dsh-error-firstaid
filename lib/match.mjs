/**
 * 匹配器：把一段报错文本对到规则表上。
 *
 * 原则：**匹配不到就说匹配不到**。不设"默认最像的那条"，也不给低置信度的条目
 * 披上"可能就是它"的说法——用户照着做错一步，代价比不知道大。
 */
import { RULES } from './rules.mjs';

const norm = (s) =>
  String(s || '')
    .replace(/\r/g, '')
    .replace(/[\u200b-\u200f\uFEFF]/g, '')
    .toLowerCase();

/** 从文本里抠出一些有用的上下文（版本号、退出码、端口），用来回报，不参与打分。 */
export function extractContext(text) {
  const t = String(text || '');
  const ctx = {};
  const ver = t.match(/\b\d+\.\d+\.\d+(?:-rc\.\d+)?\b/);
  if (ver) ctx.version = ver[0];
  const code = t.match(/(?:exit code|退出码)[:：\s]*(-?\d+)/i);
  if (code) ctx.exitCode = code[1];
  const port = t.match(/127\.0\.0\.1:(\d{2,5})/);
  if (port) ctx.port = port[1];
  const ts = t.match(/\d{4}-\d{2}-\d{2}T[\d:.]+Z?/);
  if (ts) ctx.timestamp = ts[0];
  return ctx;
}

export function scoreAll(text) {
  const t = norm(text);
  const out = [];
  for (const rule of RULES) {
    const matched = [];
    let raw = 0;
    let total = 0;
    let maxW = 0;
    for (const s of rule.signals) {
      total += s.w;
      if (s.re.test(t)) {
        matched.push(s.re.source);
        raw += s.w;
        if (s.w > maxW) maxW = s.w;
      }
    }
    if (!matched.length) continue;
    const ratio = total ? raw / total : 0;
    // 门槛分两种活法：
    //  - 命中了"硬信号"（权重≥6，比如 0xC0000142 这种几乎不会出现在别处的字符串）→ 直接收，哪怕它只占该条规则的一小部分
    //  - 否则要求命中的权重占该条规则的 34% 以上，避免几个泛泛的词凑出一条假诊断
    if (raw < 4) continue;
    if (maxW < 6 && ratio < 0.34) continue;
    const confidence = Math.min(99, Math.round(((raw + maxW) / 14) * 100));
    out.push({ rule, raw, maxW, ratio, confidence, matched, rank: raw + maxW });
  }
  out.sort((a, b) => b.rank - a.rank || b.ratio - a.ratio);
  return out;
}

function renderHit(hit, idx) {
  const r = hit.rule;
  const lines = [];
  const label = hit.confidence >= 70 ? '高' : '中';
  lines.push(`${idx === 0 ? '最可能' : '也可能是'}: ${r.title}（置信 ${hit.confidence}% · ${label} · ${r.source === 'tested' ? '我们实测过' : '社区报告'}）`);
  lines.push(`原因：${r.cause}`);
  lines.push('可以试：');
  r.fixes.forEach((f, i) => lines.push(`  ${i + 1}. ${f}`));
  if (r.verify) lines.push(`怎么确认：${r.verify}`);
  if (r.evidence) lines.push(`依据：${r.evidence}`);
  return lines.join('\n');
}

const UNKNOWN_HELP = [
  '这条我匹配不上——**不猜**。',
  '两个办法：',
  '  1. 把报错原文多贴几行（尤其是第一行和最后一行），有 `exit code` / 版本号 / 文件路径的那几行最有用',
  '  2. 还是不行就去官方讨论区问，先把这几样备好：DSH 版本（设置里能看）、出问题的时间点、`%APPDATA%\\@deepseek-ai\\dsh-desktop\\logs\\` 下最新的日志尾部',
].join('\n');

/**
 * @param {string} text 报错文本/症状描述
 * @param {{limit?: number}} opts
 */
export function diagnose(text, opts = {}) {
  const limit = Math.max(1, Math.min(3, opts.limit ?? 2));
  const hits = scoreAll(text).slice(0, limit);
  const ctx = extractContext(text);

  if (!hits.length) {
    return {
      found: false,
      report: UNKNOWN_HELP,
      context: ctx,
      ruleId: '',
      confidence: 0,
      others: '',
    };
  }

  const best = hits[0];
  const parts = [renderHit(best, 0)];
  if (hits.length > 1) {
    parts.push('');
    for (let i = 1; i < hits.length; i++) parts.push(renderHit(hits[i], i));
  }
  parts.push('');
  parts.push(
    best.rule.source === 'tested'
      ? '（这一条是我们自己在这台机器上踩过并验证的）'
      : '（这一条来自社区报告，我们没亲自复现）',
  );

  const others = hits
    .slice(1)
    .map((h) => `${h.rule.title}（${h.confidence}%）`)
    .join(' / ');

  return {
    found: true,
    report: parts.join('\n'),
    context: ctx,
    ruleId: best.rule.id,
    confidence: best.confidence,
    others,
  };
}
