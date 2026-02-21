import type { IRBlock, IRDoc } from './ir.js';
import { irLine } from './ir.js';

export type ProgressRenderInput = {
  /** Optional: watchdog / compaction banner (short) */
  banner?: string | null;

  /** Something like "⏳ Thinking (15s)" or "🔧 exec: npm test (...)" */
  statusLine?: string | null;

  /** Lines like: "◆ read_file src/agent.ts..." then "✓ exec: ..." */
  toolLines?: string[] | null;

  /** Optional tail (typically from ToolTailBuffer.get(activeToolId)) */
  toolTail?: null | {
    name?: string;
    stream: 'stdout' | 'stderr';
    lines: string[];
  };

  /** Partial assistant output buffer (usually markdown) */
  assistantMarkdown?: string | null;
};

export type ProgressRenderOptions = {
  maxToolLines: number;       // default 6
  maxTailLines: number;       // default 4
  maxAssistantChars: number;  // default 2000
};

function tail<T>(arr: T[], n: number): T[] {
  if (!Array.isArray(arr) || n <= 0) return [];
  return arr.length <= n ? arr : arr.slice(arr.length - n);
}

function clipEnd(s: string, maxChars: number): string {
  const t = String(s ?? '');
  if (maxChars <= 0) return '';
  if (t.length <= maxChars) return t;
  return '…' + t.slice(t.length - (maxChars - 1));
}

export class ProgressMessageRenderer {
  private readonly base: ProgressRenderOptions;

  constructor(opts?: Partial<ProgressRenderOptions>) {
    this.base = {
      maxToolLines: opts?.maxToolLines ?? 6,
      maxTailLines: opts?.maxTailLines ?? 4,
      maxAssistantChars: opts?.maxAssistantChars ?? 2000,
    };
  }

  render(input: ProgressRenderInput, override?: Partial<ProgressRenderOptions>): IRDoc {
    const o = { ...this.base, ...(override ?? {}) };

    const blocks: IRBlock[] = [];

    const banner = (input.banner ?? '').trim();
    const status = (input.statusLine ?? '').trim();
    const top = banner || status || '⏳ Thinking...';

    // Top line (banner wins; otherwise status)
    blocks.push({ type: 'lines', lines: [irLine(top, banner ? 'bold' : 'dim')] });

    // Tool summary lines
    const toolLines = tail((input.toolLines ?? []).filter(Boolean), o.maxToolLines);
    if (toolLines.length) {
      blocks.push({ type: 'code', lines: toolLines });
    }

    // Tool tail
    if (input.toolTail) {
      const name = (input.toolTail.name ?? '').trim();
      const stream = input.toolTail.stream === 'stderr' ? 'stderr' : 'stdout';
      const lines = tail((input.toolTail.lines ?? []).filter(Boolean), o.maxTailLines);

      if (lines.length) {
        const label = `↳ ${stream} tail${name ? ` (${name})` : ''}`;
        blocks.push({ type: 'lines', lines: [irLine(label, 'dim')] });
        blocks.push({ type: 'code', lines, lang: stream });
      }
    }

    // Assistant partial
    const assistantRaw = (input.assistantMarkdown ?? '').trim();
    if (assistantRaw) {
      const assistant = clipEnd(assistantRaw, o.maxAssistantChars);
      if (assistant.trim()) {
        blocks.push({ type: 'markdown', markdown: assistant });
      }
    }

    // Safety: never return empty
    if (!blocks.length) {
      blocks.push({ type: 'lines', lines: [irLine('⏳ Thinking...', 'dim')] });
    }

    return { blocks };
  }
}
