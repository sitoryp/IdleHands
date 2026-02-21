import type { HookDispatchContext, HookEventMap, HookEventName, HookHandler, HookLog, HookPlugin } from './types.js';

const defaultLogger: HookLog = (message) => {
  if (!process.env.IDLEHANDS_QUIET_WARNINGS) {
    console.warn(message);
  }
};

type HookManagerOptions = {
  enabled?: boolean;
  strict?: boolean;
  warnMs?: number;
  logger?: HookLog;
  context: () => HookDispatchContext;
};

export class HookManager {
  private readonly handlers = new Map<HookEventName, Array<{ source: string; fn: HookHandler<any> }>>();
  private readonly enabled: boolean;
  private readonly strict: boolean;
  private readonly warnMs: number;
  private readonly logger: HookLog;
  private readonly getContext: () => HookDispatchContext;

  constructor(opts: HookManagerOptions) {
    this.enabled = opts.enabled !== false;
    this.strict = opts.strict === true;
    this.warnMs = Math.max(0, Math.floor(opts.warnMs ?? 250));
    this.logger = opts.logger ?? defaultLogger;
    this.getContext = opts.context;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  on<E extends HookEventName>(event: E, handler: HookHandler<E>, source = 'runtime'): void {
    if (!this.enabled) return;
    const list = this.handlers.get(event) ?? [];
    list.push({ source, fn: handler as HookHandler<any> });
    this.handlers.set(event, list);
  }

  async registerPlugin(plugin: HookPlugin, source: string): Promise<void> {
    if (!this.enabled) return;

    if (plugin.hooks && typeof plugin.hooks === 'object') {
      for (const [event, value] of Object.entries(plugin.hooks) as Array<[HookEventName, HookHandler<any> | HookHandler<any>[]]>) {
        const list = Array.isArray(value) ? value : [value];
        for (const fn of list) {
          if (typeof fn === 'function') {
            this.on(event, fn as any, source);
          }
        }
      }
    }

    if (typeof plugin.setup === 'function') {
      await plugin.setup({
        on: (event, handler) => this.on(event, handler, source),
        context: this.getContext(),
      });
    }
  }

  async emit<E extends HookEventName>(event: E, payload: HookEventMap[E]): Promise<void> {
    if (!this.enabled) return;

    const list = this.handlers.get(event);
    if (!list || list.length === 0) return;

    const ctx = this.getContext();

    for (const handler of list) {
      const started = Date.now();
      try {
        await handler.fn(payload, ctx);
      } catch (error: any) {
        const msg = `[hooks] ${event} handler failed (${handler.source}): ${error?.message ?? String(error)}`;
        if (this.strict) throw new Error(msg);
        this.logger(msg);
      } finally {
        const elapsed = Date.now() - started;
        if (this.warnMs > 0 && elapsed >= this.warnMs) {
          this.logger(`[hooks] ${event} handler slow (${handler.source}): ${elapsed}ms`);
        }
      }
    }
  }
}
