# dsh-opencode-fix

Private fix for OpenCode Go on a `llm-pi-ai` provider profile in DeepSeek Harness 0.2.x. It packages two changes that must go together:

1. **`@local/dsh-opencode-session`** (this directory) adds OpenCode's required `x-opencode-session` header through the adapter's own `llm-pi-ai/request-headers` waterfall. No global `fetch` patching, no dependencies, no effect on any other provider.
2. **Provider `baseURL` correction**: `llm-pi-ai` appends `/chat/completions` for an `openai-completions` route, so the profile's `baseURL` must stop at the API root. A profile that writes the full endpoint gets a doubled path, which returns `400 MissingSessionID` without a header and `404` with one.

## The problem it solves

On a `llm-pi-ai` provider profile (for example a hand-written `opencode-go` route), OpenCode Go rejects every request:

```
400: {"type":"error","error":{"type":"MissingSessionID","message":"Request is missing x-opencode-session ..."}}
```

The header is required for routing and prompt-cache keys. This plugin supplies it per conversation: the waterfall context carries the Session's `sessionId`, which becomes the header value. When no Session id is in context (model discovery, for example), a constant fallback is used.

## How it works

`dsh-llm-pi-ai` dispatches every request through:

```js
ctx.waterfall('llm-pi-ai/request-headers', request, headers, () => headers)
```

`request` is `{ provider, model, baseURL, sessionId?, purpose? }` and `headers` is a fresh, mutable `Headers` copy. The listener sets `x-opencode-session` when `request.baseURL` is `opencode.ai` or a subdomain, never overwrites an existing value, and always calls `next()`.

## Install

Step-by-step for another machine or another Harness instance: [HANDOFF.md](./HANDOFF.md).

```powershell
dsh plugin --profile desktop add "link:C:/Users/Administrator/OneDrive/Desktop/DSH/dsh-opencode-fix"
```

The profile command adds `@local/dsh-opencode-session` to `dsh.profile.bundles`; its `cordis.patch.yml` mounts the plugin under `dsh-opencode-session`. The running host reconciles profile changes, so a restart is only needed if the entry does not appear.

## Provider config

```yaml
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      opencode-go:
        apiKeyEnv: OPENCODE_GO_API_KEY
        baseURL: https://opencode.ai/inference/go/openai/v1   # API root, not the endpoint
        models:
          - id: deepseek-v4.1-flash
            name: ds-opc-go
```

`baseURL: https://opencode.ai/inference/go/openai/v1/chat/completions` doubles the path and returns 404.

## Config

```yaml
- id: dsh-opencode-session
  name: '@local/dsh-opencode-session'
  config:
    hosts: ['opencode.ai']      # exact host or subdomain
    fallback: 'dsh-opencode'    # used when no Session id is in context
```

## Test

```powershell
npm test
```

## Verified

End to end on DSH 0.2.2-rc.1, headless profile, `opencode-go` / `deepseek-v4.1-flash`:

- with the header and the correct base URL: `OK` from the model;
- header missing: `400 MissingSessionID`; doubled path: `404`.

## Notes

- Only the pi-ai request path is covered. That is where every `opencode` and `opencode-go` route lives in DSH 0.2.x.
- If a future DSH build passes a `sessionId` into `streamSimple`, the shipped pi-ai wrapper also stamps the header; this plugin leaves that value alone (`headers.has` check first).
- `headers` values must be valid HTTP header values; a Session id is.
