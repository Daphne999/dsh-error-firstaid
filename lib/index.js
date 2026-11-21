/**
 * dsh-error-firstaid —— 报错急救：贴一段报错，给出最可能的原因和一步能做的事。
 *
 * 不是体检面板：不扫你的机器，只读你贴进来的那段报错，对到已知的症状上，
 * 给出最可能的原因和一步能做的事。匹配不到就说不知道。
 */
import { diagnose } from './match.mjs';
import { RULES } from './rules.mjs';

export const name = 'dsh-error-firstaid';
export const inject = ['tools'];

const ctxLine = (ctx) => {
  const p = [];
  if (ctx.version) p.push(`版本 ${ctx.version}`);
  if (ctx.exitCode) p.push(`退出码 ${ctx.exitCode}`);
  if (ctx.port) p.push(`端口 ${ctx.port}`);
  return p.join(' · ');
};

export function makeTools() {
  return [
    {
      name: 'firstaid_error',
      description:
        'First aid for a DSH error message: paste the error text and get the most likely cause plus one concrete step to try. Deterministic rule table, no model call, no machine scanning. Returns an explicit "I do not know" instead of guessing when nothing matches. | 报错急救：粘贴报错原文，给出最可能的原因和可执行的修复步骤；规则表纯本地匹配，不调模型、不扫机器，匹配不到会明说不知道，不瞎猜。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'The error message / symptom, as complete as possible.' },
          limit: { type: 'number', description: 'How many candidate causes to show (1-3, default 2).' },
        },
        required: ['text'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            ok: { type: 'boolean' },
            report: { type: 'string' },
            ruleId: { type: 'string' },
            confidence: { type: 'number' },
            others: { type: 'string' },
            context: { type: 'string' },
          },
          required: ['ok', 'report', 'ruleId', 'confidence', 'others', 'context'],
          additionalProperties: false,
        },
        render: (_a, v) => [{ type: 'text', text: v?.report ?? '' }],
      },
      async execute(args) {
        const text = String(args?.text ?? '').trim();
        if (!text) {
          return {
            ok: false,
            report: '给我一段报错文字我才好判断——症状描述也行，比如"装完插件工具列表里什么都没有"。',
            ruleId: '',
            confidence: 0,
            others: '',
            context: '',
          };
        }
        const r = diagnose(text, { limit: args?.limit });
        return {
          ok: r.found,
          report: r.report,
          ruleId: r.ruleId,
          confidence: r.confidence,
          others: r.others,
          context: ctxLine(r.context),
        };
      },
    },
    {
      name: 'firstaid_list',
      description:
        'List every error pattern this plugin can recognise, so you can tell whether your case is covered before trusting an answer. | 列出这个插件能认出的所有报错类型，用来判断你的问题是否在覆盖范围内。',
      parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
      output: {
        schema: {
          type: 'object',
          properties: { ok: { type: 'boolean' }, report: { type: 'string' } },
          required: ['ok', 'report'],
          additionalProperties: false,
        },
        render: (_a, v) => [{ type: 'text', text: v?.report ?? '' }],
      },
      async execute() {
        const byStage = new Map();
        for (const r of RULES) {
          if (!byStage.has(r.stage)) byStage.set(r.stage, []);
          byStage.get(r.stage).push(r);
        }
        const label = {
          startup: '起动阶段',
          install: '安装/加载',
          plugin: '插件开发',
          runtime: '运行中',
          network: '网络',
          usage: '使用中',
        };
        const lines = [`能认出 ${RULES.length} 类问题：`];
        for (const [stage, rules] of byStage) {
          lines.push('');
          lines.push(`【${label[stage] ?? stage}】`);
          for (const r of rules) {
            lines.push(`- ${r.title}${r.source === 'tested' ? '（实测过）' : '（社区报告）'}`);
          }
        }
        lines.push('');
        lines.push('不在这个范围内的，我会直接说不知道，并告诉你去哪问、要带什么。');
        return { ok: true, report: lines.join('\n') };
      },
    },
  ];
}

export async function apply(ctx) {
  const tools = ctx.get('tools');
  if (!tools?.register) {
    throw new Error('[dsh-error-firstaid] tools 服务不可用：请在 inject 里声明 tools');
  }
  for (const t of makeTools()) tools.register(t);
}
