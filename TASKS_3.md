````diff
diff --git a/src/progress/ir.ts b/src/progress/ir.ts
new file mode 100644
index 0000000..8b918a2
--- /dev/null
+++ b/src/progress/ir.ts
@@ -0,0 +1,43 @@
+export type IRDoc = {
+  blocks: IRBlock[];
+};
+
+export type IRBlock =
+  | { type: 'lines'; lines: IRLine[]; monospace?: boolean }
+  | { type: 'code'; lines: string[]; lang?: string }
+  | { type: 'markdown'; markdown: string }
+  | { type: 'divider' }
+  | { type: 'spacer'; lines?: number };
+
+export type IRLine = {
+  spans: IRSpan[];
+};
+
+export type IRSpan = {
+  text: string;
+  style?: 'plain' | 'bold' | 'dim' | 'code';
+};
+
+export function irLine(text: string, style: IRSpan['style'] = 'plain'): IRLine {
+  return { spans: [{ text: String(text ?? ''), style }] };
+}
+
+export function irJoinLines(lines: string[], style: IRSpan['style'] = 'plain'): IRLine[] {
+  return (lines ?? []).map((l) => irLine(l, style));
+}
diff --git a/src/progress/progress-message-renderer.ts b/src/progress/progress-message-renderer.ts
new file mode 100644
index 0000000..4c5d9f4
--- /dev/null
+++ b/src/progress/progress-message-renderer.ts
@@ -0,0 +1,140 @@
+import type { IRBlock, IRDoc } from './ir.js';
+import { irLine } from './ir.js';
+
+export type ProgressRenderInput = {
+  /** Optional: watchdog / compaction banner (short) */
+  banner?: string | null;
+
+  /** Something like "⏳ Thinking (15s)" or "🔧 exec: npm test (...)" */
+  statusLine?: string | null;
+
+  /** Lines like: "◆ read_file src/agent.ts..." then "✓ exec: ..." */
+  toolLines?: string[] | null;
+
+  /** Optional tail (typically from ToolTailBuffer.get(activeToolId)) */
+  toolTail?: null | {
+    name?: string;
+    stream: 'stdout' | 'stderr';
+    lines: string[];
+  };
+
+  /** Partial assistant output buffer (usually markdown) */
+  assistantMarkdown?: string | null;
+};
+
+export type ProgressRenderOptions = {
+  maxToolLines: number;       // default 6
+  maxTailLines: number;       // default 4
+  maxAssistantChars: number;  // default 2000
+};
+
+function tail<T>(arr: T[], n: number): T[] {
+  if (!Array.isArray(arr) || n <= 0) return [];
+  return arr.length <= n ? arr : arr.slice(arr.length - n);
+}
+
+function clipEnd(s: string, maxChars: number): string {
+  const t = String(s ?? '');
+  if (maxChars <= 0) return '';
+  if (t.length <= maxChars) return t;
+  return '…' + t.slice(t.length - (maxChars - 1));
+}
+
+export class ProgressMessageRenderer {
+  private readonly base: ProgressRenderOptions;
+
+  constructor(opts?: Partial<ProgressRenderOptions>) {
+    this.base = {
+      maxToolLines: opts?.maxToolLines ?? 6,
+      maxTailLines: opts?.maxTailLines ?? 4,
+      maxAssistantChars: opts?.maxAssistantChars ?? 2000,
+    };
+  }
+
+  render(input: ProgressRenderInput, override?: Partial<ProgressRenderOptions>): IRDoc {
+    const o = { ...this.base, ...(override ?? {}) };
+
+    const blocks: IRBlock[] = [];
+
+    const banner = (input.banner ?? '').trim();
+    const status = (input.statusLine ?? '').trim();
+    const top = banner || status || '⏳ Thinking...';
+
+    // Top line (banner wins; otherwise status)
+    blocks.push({ type: 'lines', lines: [irLine(top, banner ? 'bold' : 'dim')] });
+
+    // Tool summary lines
+    const toolLines = tail((input.toolLines ?? []).filter(Boolean), o.maxToolLines);
+    if (toolLines.length) {
+      blocks.push({ type: 'code', lines: toolLines });
+    }
+
+    // Tool tail
+    if (input.toolTail) {
+      const name = (input.toolTail.name ?? '').trim();
+      const stream = input.toolTail.stream === 'stderr' ? 'stderr' : 'stdout';
+      const lines = tail((input.toolTail.lines ?? []).filter(Boolean), o.maxTailLines);
+
+      if (lines.length) {
+        const label = `↳ ${stream} tail${name ? ` (${name})` : ''}`;
+        blocks.push({ type: 'lines', lines: [irLine(label, 'dim')] });
+        blocks.push({ type: 'code', lines, lang: stream });
+      }
+    }
+
+    // Assistant partial
+    const assistantRaw = (input.assistantMarkdown ?? '').trim();
+    if (assistantRaw) {
+      const assistant = clipEnd(assistantRaw, o.maxAssistantChars);
+      if (assistant.trim()) {
+        blocks.push({ type: 'markdown', markdown: assistant });
+      }
+    }
+
+    // Safety: never return empty
+    if (!blocks.length) {
+      blocks.push({ type: 'lines', lines: [irLine('⏳ Thinking...', 'dim')] });
+    }
+
+    return { blocks };
+  }
+}
diff --git a/src/progress/serialize-telegram.ts b/src/progress/serialize-telegram.ts
new file mode 100644
index 0000000..c2c5ad3
--- /dev/null
+++ b/src/progress/serialize-telegram.ts
@@ -0,0 +1,102 @@
+import type { IRDoc, IRBlock, IRSpan } from './ir.js';
+import { markdownToTelegramHtml, escapeHtml } from '../bot/format.js';
+
+export type TelegramRenderOptions = {
+  maxLen?: number; // Telegram hard limit: 4096
+};
+
+function spanToHtml(s: IRSpan): string {
+  const t = escapeHtml(s.text ?? '');
+  switch (s.style) {
+    case 'bold':
+      return `<b>${t}</b>`;
+    case 'code':
+      return `<code>${t}</code>`;
+    case 'dim':
+      // Telegram HTML doesn’t have dim; italic is a good soft cue.
+      return `<i>${t}</i>`;
+    default:
+      return t;
+  }
+}
+
+function blockToHtml(b: IRBlock): string {
+  switch (b.type) {
+    case 'spacer':
+      return '\n'.repeat(Math.max(1, b.lines ?? 1));
+    case 'divider':
+      return '────────';
+    case 'lines':
+      return (b.lines ?? []).map((ln) => ln.spans.map(spanToHtml).join('')).join('\n');
+    case 'code': {
+      const body = escapeHtml((b.lines ?? []).join('\n'));
+      return `<pre>${body}</pre>`;
+    }
+    case 'markdown':
+      return markdownToTelegramHtml(b.markdown ?? '');
+  }
+}
+
+export function renderTelegramHtml(doc: IRDoc, opts?: TelegramRenderOptions): string {
+  const maxLen = Math.max(256, Math.floor(opts?.maxLen ?? 4096));
+
+  const parts: string[] = [];
+  let used = 0;
+  let truncated = false;
+
+  for (const block of doc.blocks ?? []) {
+    const piece = blockToHtml(block);
+    const sep = parts.length ? '\n\n' : '';
+    const add = sep + piece;
+
+    if (used + add.length > maxLen) {
+      truncated = true;
+      break;
+    }
+
+    parts.push(add);
+    used += add.length;
+  }
+
+  let out = parts.join('');
+  if (truncated && out.length + 2 <= maxLen) out += '\n…';
+  if (!out.trim()) out = '⏳ Thinking...';
+  return out;
+}
diff --git a/src/progress/serialize-discord.ts b/src/progress/serialize-discord.ts
new file mode 100644
index 0000000..8d5c280
--- /dev/null
+++ b/src/progress/serialize-discord.ts
@@ -0,0 +1,106 @@
+import type { IRDoc, IRBlock, IRSpan } from './ir.js';
+
+export type DiscordRenderOptions = {
+  maxLen?: number; // keep under 2000; recommended 1900
+};
+
+function escapeCodeFence(s: string): string {
+  // Avoid closing the fence prematurely.
+  return String(s ?? '').replace(/```/g, '``\u200b`');
+}
+
+function spanToMd(s: IRSpan): string {
+  const t = String(s.text ?? '');
+  switch (s.style) {
+    case 'bold':
+      return `**${t}**`;
+    case 'code': {
+      const safe = t.replace(/`/g, 'ˋ');
+      return `\`${safe}\``;
+    }
+    case 'dim':
+      return `*${t}*`;
+    default:
+      return t;
+  }
+}
+
+function blockToMd(b: IRBlock): string {
+  switch (b.type) {
+    case 'spacer':
+      return '\n'.repeat(Math.max(1, b.lines ?? 1));
+    case 'divider':
+      return '---';
+    case 'lines':
+      return (b.lines ?? []).map((ln) => ln.spans.map(spanToMd).join('')).join('\n');
+    case 'code': {
+      const lang = b.lang ? String(b.lang).trim() : '';
+      const body = escapeCodeFence((b.lines ?? []).join('\n'));
+      return `\`\`\`${lang}\n${body}\n\`\`\``;
+    }
+    case 'markdown':
+      return String(b.markdown ?? '');
+  }
+}
+
+export function renderDiscordMarkdown(doc: IRDoc, opts?: DiscordRenderOptions): string {
+  const maxLen = Math.max(256, Math.floor(opts?.maxLen ?? 1900));
+
+  const parts: string[] = [];
+  let used = 0;
+  let truncated = false;
+
+  for (const block of doc.blocks ?? []) {
+    const piece = blockToMd(block);
+    const sep = parts.length ? '\n\n' : '';
+    const add = sep + piece;
+
+    if (used + add.length > maxLen) {
+      truncated = true;
+      break;
+    }
+
+    parts.push(add);
+    used += add.length;
+  }
+
+  let out = parts.join('');
+  if (truncated && out.length + 2 <= maxLen) out += '\n…';
+  if (!out.trim()) out = '⏳ Thinking...';
+  return out;
+}
diff --git a/src/bot/telegram.ts b/src/bot/telegram.ts
index 88c2f6a..b20d4e8 100644
--- a/src/bot/telegram.ts
+++ b/src/bot/telegram.ts
@@ -16,6 +16,8 @@ import {
 } from './commands.js';
 import { TelegramConfirmProvider } from './confirm-telegram.js';
 import { formatWatchdogCancelMessage, resolveWatchdogSettings } from '../watchdog.js';
 import { TurnProgressController } from '../progress/turn-progress.js';
 import { ToolTailBuffer } from '../progress/tool-tail.js';
+import { ProgressMessageRenderer } from '../progress/progress-message-renderer.js';
+import { renderTelegramHtml } from '../progress/serialize-telegram.js';
 
 // ---------------------------------------------------------------------------
 // Escalation helpers (mirrored from discord.ts)
 // ---------------------------------------------------------------------------
@@ -156,6 +158,12 @@ class StreamingMessage {
   private progress: TurnProgressController;
   private tails = new ToolTailBuffer({ maxChars: 4096, maxLines: 4 });
   private activeToolId: string | null = null;
+  private renderer = new ProgressMessageRenderer({
+    maxToolLines: 8,
+    maxTailLines: 4,
+    maxAssistantChars: 2400,
+  });
 
   constructor(
     private bot: Bot,
@@ -282,29 +290,19 @@ class StreamingMessage {
     }
   }
 
   private render(): string {
-    let out = `<i>${escapeHtml(this.statusLine)}</i>`;
-
-    if (this.toolLines.length) {
-      out += `\n\n<pre>${escapeHtml(this.toolLines.join('\n'))}</pre>`;
-    }
-
-    if (this.activeToolId) {
-      const tail = this.tails.get(this.activeToolId);
-      if (tail?.lines?.length) {
-        const label = tail.stream === 'stderr' ? 'stderr' : 'stdout';
-        out += `\n\n<b>↳ ${escapeHtml(label)} tail</b>\n<pre>${escapeHtml(tail.lines.join('\n'))}</pre>`;
-      }
-    }
-
-    if (this.buffer) {
-      out += `\n\n${markdownToTelegramHtml(this.buffer)}`;
-    }
-
-    return out.slice(0, 4096);
+    const tail = this.activeToolId ? this.tails.get(this.activeToolId) : null;
+
+    const doc = this.renderer.render({
+      statusLine: this.statusLine,
+      toolLines: this.toolLines,
+      toolTail: tail ? { name: tail.name, stream: tail.stream, lines: tail.lines } : null,
+      assistantMarkdown: this.buffer,
+    });
+
+    return renderTelegramHtml(doc, { maxLen: 4096 });
   }
 
   /** Finalize: stop the edit loop and send the final response. */
   async finalize(text: string): Promise<void> {
diff --git a/src/bot/discord-streaming.ts b/src/bot/discord-streaming.ts
index 5ce9f0f..b8ce21e 100644
--- a/src/bot/discord-streaming.ts
+++ b/src/bot/discord-streaming.ts
@@ -4,6 +4,8 @@ import type { ToolCallEvent, ToolResultEvent, ToolStreamEvent, TurnEndEvent } fro
 import { splitDiscord, safeContent } from './discord-routing.js';
 import { formatToolCallSummary } from '../progress/tool-summary.js';
 import { TurnProgressController } from '../progress/turn-progress.js';
 import { ToolTailBuffer } from '../progress/tool-tail.js';
+import { ProgressMessageRenderer } from '../progress/progress-message-renderer.js';
+import { renderDiscordMarkdown } from '../progress/serialize-discord.js';
 
 export class DiscordStreamingMessage {
   private buffer = '';
@@ -25,6 +27,12 @@ export class DiscordStreamingMessage {
 
   private progress = new TurnProgressController(
     (snap) => {
       this.statusLine = snap.statusLine;
       this.dirty = true;
@@ -39,6 +47,12 @@ export class DiscordStreamingMessage {
       toolCallSummary: (c) => formatToolCallSummary({ name: c.name, args: c.args as any }),
     },
   );
+  private renderer = new ProgressMessageRenderer({
+    maxToolLines: 6,
+    maxTailLines: 4,
+    maxAssistantChars: 1200,
+  });
 
   constructor(
     private readonly placeholder: any | null,
@@ -117,35 +131,20 @@ export class DiscordStreamingMessage {
   }
 
   private renderProgressText(): string {
-    const parts: string[] = [];
-
-    if (this.banner) parts.push(this.banner);
-    else parts.push(this.statusLine || '⏳ Thinking...');
-
-    if (this.toolLines.length) {
-      parts.push('');
-      parts.push(this.toolLines.slice(-6).join('\n'));
-    }
-
-    if (this.activeToolId) {
-      const tail = this.tails.get(this.activeToolId);
-      if (tail?.lines?.length) {
-        const label = tail.stream === 'stderr' ? 'stderr' : 'stdout';
-        parts.push('');
-        parts.push('```' + label + '\n' + tail.lines.join('\n') + '\n```');
-      }
-    }
-
-    if (this.buffer.trim()) {
-      const snippet = this.buffer.length > 1200 ? this.buffer.slice(-1200) : this.buffer;
-      parts.push('');
-      parts.push(safeContent(snippet));
-    }
-
-    const out = parts.join('\n');
-    return out.length > 1900 ? out.slice(0, 1900) + '…' : out;
+    const tail = this.activeToolId ? this.tails.get(this.activeToolId) : null;
+
+    const doc = this.renderer.render({
+      banner: this.banner,
+      statusLine: this.statusLine || '⏳ Thinking...',
+      toolLines: this.toolLines,
+      toolTail: tail ? { name: tail.name, stream: tail.stream, lines: tail.lines } : null,
+      assistantMarkdown: this.buffer.trim() ? safeContent(this.buffer) : null,
+    });
+
+    return renderDiscordMarkdown(doc, { maxLen: 1900 });
   }
 
   private async flush(): Promise<void> {
     if (this.finalized) return;
     if (!this.dirty) return;
````

