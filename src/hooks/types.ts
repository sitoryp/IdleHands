import type { ToolCallEvent, ToolResultEvent, TurnEndEvent } from '../types.js';

export type HookEventMap = {
  session_start: {
    model: string;
    harness: string;
    endpoint: string;
    cwd: string;
  };
  model_changed: {
    previousModel: string;
    nextModel: string;
    harness: string;
  };
  ask_start: {
    askId: string;
    instruction: string;
  };
  ask_end: {
    askId: string;
    text: string;
    turns: number;
    toolCalls: number;
  };
  ask_error: {
    askId: string;
    error: string;
    turns: number;
    toolCalls: number;
  };
  turn_start: {
    askId: string;
    turn: number;
  };
  turn_end: {
    askId: string;
    stats: TurnEndEvent;
  };
  tool_call: {
    askId: string;
    turn: number;
    call: ToolCallEvent;
  };
  tool_result: {
    askId: string;
    turn: number;
    result: ToolResultEvent;
  };
};

export type HookEventName = keyof HookEventMap;

export type HookDispatchContext = {
  sessionId: string;
  cwd: string;
  model: string;
  harness: string;
  endpoint: string;
};

export type HookHandler<E extends HookEventName = HookEventName> = (
  payload: HookEventMap[E],
  context: HookDispatchContext,
) => void | Promise<void>;

export type HookPlugin = {
  name?: string;
  hooks?: Partial<{ [K in HookEventName]: HookHandler<K> | HookHandler<K>[] }>;
  setup?: (api: HookRegistrationApi) => void | Promise<void>;
};

export type HookRegistrationApi = {
  on: <E extends HookEventName>(event: E, handler: HookHandler<E>) => void;
  context: HookDispatchContext;
};

export type HookSystemConfig = {
  enabled?: boolean;
  strict?: boolean;
  plugin_paths?: string[];
  warn_ms?: number;
};

export type HookLog = (message: string) => void;
