# Custom Providers (OpenAI-compatible)

The `custom` provider is an agnostic OpenAI-compatible driver. It is designed to
**add extra providers** (any endpoint that speaks the OpenAI Chat Completions
shape: DeepSeek, Groq, local Ollama/LM Studio gateways, Kilo, vLLM, etc.) without
writing code.

Since v4.355 the driver supports **multiple custom provider instances**, each
with its own full configuration (`baseUrl`, `apiKey`, `model`, `customHeaders`,
`temperature`). Every instance automatically becomes a **system pool failover
candidate** under the id `custom:<name>`.

---

## Configuration

### 1. Single custom provider (legacy, still works)

```toml
[custom]
baseUrl = "https://api.openai.com/v1"
apiKey = "sk-..."
model = "gpt-4o-mini"
customHeaders = "{}"
temperature = 0.7
```

### 2. Multiple custom providers (nested `[custom.<name>]`)

Each nested section is a complete provider config:

```toml
[custom.kilo]
baseUrl = "https://api.kilo.ai/api/gateway"
apiKey = "sk-kilo-..."
model = "kilo-model"
customHeaders = "{}"
temperature = 0.7

[custom.deepseek]
baseUrl = "https://api.deepseek.com/v1"
apiKey = "sk-deepseek-..."
model = "deepseek-chat"

[custom.ollama]
baseUrl = "http://localhost:11434/v1"
apiKey = ""                       # local endpoints usually need no key
model = "llama3.2"
```

**Fields (per instance):**

| Field | Type | Description |
|-------|------|-------------|
| `baseUrl` | string | Base URL of the OpenAI-compatible endpoint (must end in `/v1`) |
| `apiKey` | string | Credential for the endpoint; empty for local/no-auth gateways |
| `model` | string | Model id served by the endpoint |
| `customHeaders` | string | Optional extra headers as JSON, e.g. `{"HTTP-Referer": "..."}` |
| `temperature` | number | Sampling temperature override (default `0.7`) |
| `enabled` | boolean | Set `false` to exclude the instance from the pool |

> The scalar fields above (`baseUrl`, `apiKey`, `model`, `customHeaders`,
> `temperature`, `enabled`, ...) are reserved. Any **other** nested key inside
> `[custom]` is interpreted as a new provider instance name.

---

## How it works

- **System pool failover**: when the active provider fails, the gateway
  (`ProviderGatewayModule`) enumerates every configured provider from the
  registry plus every `[custom.<name>]` instance and tries them in order. Each
  instance is tried with its **own** model id — the active provider's model id
  never leaks into another provider's request.
- **Model resolution**: a provider always prefers its own `config.model`.
  `context.model` / the cortex blueprint model (which belongs to the *active*
  provider) is only used as a last resort when the provider has no configured
  model. This prevents 400s like `gemini-flash-lite-latest is not a valid model ID`.
- **Failure bookkeeping**: a custom instance failure is tracked under its own id
  (`custom:<name>`) in the shared `ApiKeyPool`, so one failing instance does not
  quarantine the others.

---

## Notes

- Custom instances are configured via `config.toml` (`~/.yuihime/data/config.toml`
  by default). They are **not** rendered in the UI settings panel yet — the
  auto-rendered `configSchema` covers the single `[custom]` section.
- Restart the daemon after editing the config:
  `tools/yui-daemon.sh restart`
- Monitor which provider actually served a request via the usage log:
  `~/.yuihime/logs/usage.<YYYY-MM-DD>.log` — each line carries `provider`,
  `model`, and `keyId` (masked `first6...last4` of the API key used) for
  per-account audit.
