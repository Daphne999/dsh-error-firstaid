# Security

`dsh-error-firstaid` is a read-only knowledge plugin. The only input is the text you
paste into `firstaid_error` / `firstaid_list`.

## What the plugin touches

- No files on disk, no environment variables, no network sockets.
- No `$DSH_HOME`, no session logs, no `~/.dsh/.env`, no credential stores.
- The tools return strings computed from the in-process rule table.

## What it never does

- No model or LLM calls.
- No shell command execution.
- No writes, no telemetry, no outbound requests.

## Risk surface

The tool output is a plain string shown to the agent. Rules are static data in
`lib/rules.mjs`; there is no code path that evaluates pasted text, so a hostile
error string can at most fail to match. Regexes are anchored to literal
fragments, not user-controlled constructs.

## Reporting

Open an issue at https://github.com/Daphne999/dsh-error-firstaid/issues with the rule
id and the text you pasted (redact secrets first).
