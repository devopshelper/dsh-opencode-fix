# Handoff: OpenCode Go on DeepSeek Harness

Agent-facing procedure. Goal: a fresh session answers on `opencode-go/deepseek-v4.1-flash`
with no `400 MissingSessionID` and no `404`.

## Two independent bugs

1. **No session header.** DSH's `llm-pi-ai` route can send no `x-opencode-session`, so OpenCode Go
   rejects with `400 MissingSessionID`. Fixed by this plugin (`@local/dsh-opencode-session`), which
   stamps the header through the official `llm-pi-ai/request-headers` waterfall.
2. **Doubled endpoint.** `pi-ai` appends `/chat/completions` itself. A profile whose `baseURL` is
   the full endpoint (`.../v1/chat/completions`) sends `/chat/completions/chat/completions` and
   gets `404`. Fixed by omitting `baseURL`, or using the API root only.

## Steps (PowerShell)

1. Install the plugin. The repository is private, so authenticate first (`gh auth login`).

   ```powershell
   git clone https://github.com/devopshelper/dsh-opencode-fix "$env:USERPROFILE\dsh-opencode-fix"
   dsh plugin --profile desktop add "link:$env:USERPROFILE\dsh-opencode-fix"
   ```

   Use the absolute path that actually exists; `link:` needs the real directory.

2. Confirm the bundle is mounted. `~/.dsh/profiles/desktop/package.json` should list
   `@local/dsh-opencode-session` in `dsh.profile.bundles`. The `add` command inserts it; if not,
   add it manually.

3. Add the provider route. In `~/.dsh/profiles/desktop/cordis.patch.yml`, inside the
   `- id: llm-pi-ai` entry, add (or replace an existing `opencode-go:` block):

   ```yaml
         opencode-go:
           apiKeyEnv: OPENCODE_GO_API_KEY
           models:
             - id: deepseek-v4.1-flash
               name: DS_OPC
   ```

   No `api`, no `baseURL`: the shipped `opencode-go` catalog supplies each model's protocol and
   endpoint. If an endpoint must be pinned, use the root `https://opencode.ai/inference/go/openai/v1`
   and set `api: openai-completions` — never the full `/chat/completions` path.

4. Store the key. Either the Models settings page, or the `refs:` map in
   `~/.dsh/.credentials.yaml` as `OPENCODE_GO_API_KEY: oc_sk_...`.

5. Restart the app once. Plugins load at boot; profile patches reconcile live afterwards.

## Verify

Open a new chat, select `DS_OPC`, send `hi`. It must answer.

| Error | Meaning |
|---|---|
| `400 MissingSessionID` | plugin not loaded: check `dsh plugin --profile desktop why @local/dsh-opencode-session`, then restart |
| `404` | `baseURL` includes the endpoint path |
| `403 permission_error ... Model access is disabled` | enable that model at `https://opencode.ai/console/<workspace>/models` |
| `MISSING_CREDENTIAL` | no key for `OPENCODE_GO_API_KEY` |
| `UNKNOWN_MODEL` | model id absent from the installed pi-ai catalog |

Unit tests for the plugin, independent of any harness: `npm test` in this directory.

## Optional: fewer first-message tokens

The REA MCP server contributes 229 of 267 tool schemas, about 39k of a session's first-message
prompt. Disable it in `~/.dsh/cordis.patch.yml` by adding `disabled: true` to its `rea-mcp` entry
(the entry usually lives there, not in the profile patch).

## Gotchas

- The Settings/Models UI rewrites `cordis.patch.yml` from its own state. Edits made outside that
  page can be silently reverted when it saves; re-check the file afterwards.
- This repository holds code only. Profile configuration is machine-local and intentionally not
  versioned here.
