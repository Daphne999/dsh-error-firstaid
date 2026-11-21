# Changelog

## 0.1.0 — 2026-11-21

首个公开发布版。命名经过两次查重：内部代号 `dsh-why` 在 npm 已被另一件包占用；`dsh-firstaid` 在 npm 空闲但 GitHub 上已有同名急救类仓库，最终改用 `dsh-error-firstaid`（npm 与 GitHub 搜索均无占用）。

- 32 条规则：起动 / 安装 / 插件开发 / 运行 / 网络 / 使用 六个阶段
- 两个工具：`firstaid_error`（贴报错给解法）、`firstaid_list`（列出覆盖范围）
- 匹配不到明确返回"不猜"，并给出该带什么信息去问
- 每条规则标注来源：实测 22 条、社区报告 10 条
- 新增 6 条来自 2026-11-21 全量会话错误统计的规则：
  - `fs-write-needs-read`（先读后写策略拒绝盲写）
  - `fs-stale-after-change`（读到之后文件被改/被移走）
  - `plugin-invalid-output-oneof`（插件工具输出 schema 不匹配）
  - `shell-dialect-mismatch`（PowerShell 语法跑在 bash 里）
  - `claimcheck-check-title-missing`（claim_plan 的 check 缺 title）
  - `taskboard-version-conflict`（任务卡乐观锁冲突）
- 验证：`node --test` 4/4 pass；`node test/smoke.mjs` 5 组断言、33 段真实报错；隔离 profile 真实启动无激活错误
- 新增 locale（en/zh）、icon、SECURITY.md

## 0.0.x — 2026-11-17

内部迭代（未发布）：22 条规则 → 26 条规则；烟测 23 → 27 段真实报错。
