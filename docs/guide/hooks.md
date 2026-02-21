# Hooks & Plugins

Idle Hands includes a modular hook system so you can extend behavior without editing core files.

## What hooks exist

Current lifecycle hooks:

- `session_start`
- `model_changed`
- `ask_start`
- `turn_start`
- `tool_call`
- `tool_result`
- `turn_end`
- `ask_end`
- `ask_error`

All hook handlers receive:

- event payload
- context `{ sessionId, cwd, model, harness, endpoint }`

## Configure hooks

```json
{
  "hooks": {
    "enabled": true,
    "strict": false,
    "warn_ms": 250,
    "plugin_paths": [
      "./dist/hooks/plugins/example-console.js",
      "./plugins/my-hook.js"
    ]
  }
}
```

### Environment variables

- `IDLEHANDS_HOOKS_ENABLED`
- `IDLEHANDS_HOOKS_STRICT`
- `IDLEHANDS_HOOK_PLUGIN_PATHS` (comma-separated)
- `IDLEHANDS_HOOK_WARN_MS`

## Plugin format

A plugin can export one of:

- `default` plugin object
- `plugin` plugin object
- `createPlugin()` returning a plugin object

Example:

```js
/** @type {import('../dist/hooks/index.js').HookPlugin} */
const plugin = {
  name: 'my-plugin',
  hooks: {
    ask_start: ({ askId, instruction }, ctx) => {
      console.error(`[my-plugin] ask_start ${askId} ${ctx.model}: ${instruction}`)
    },
    tool_result: ({ result }) => {
      if (!result.success) {
        console.error(`[my-plugin] tool failed: ${result.name} => ${result.summary}`)
      }
    }
  }
}

export default plugin
```

## Safety model

- Non-strict mode (`strict: false`) isolates plugin failures and logs warnings.
- Strict mode (`strict: true`) treats plugin failure as fatal for that operation.
- Slow hook handlers emit warnings when runtime exceeds `warn_ms`.

## Recommended usage

- Keep hooks fast and side-effect-light.
- Use hooks for telemetry, policy checks, audit trails, and custom integrations.
- Avoid mutating shared state unless you explicitly control ordering.
