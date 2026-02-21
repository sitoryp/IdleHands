# Image Parsing Tool Plan for IdleHands

## Overview
Build a robust image parsing and analysis tool that integrates with IdleHands' tool system, allowing agents to read, analyze, and extract information from images.

## Current State
- Image references are already partially supported (vision models can process base64-encoded images)
- `expandPromptImages()` in `src/cli/input.ts` handles image expansion for prompts
- MIME type detection exists in `src/tools.ts`
- No dedicated tool for image analysis yet
- Tools use `ToolResult` return type with `{ success, summary, result }` structure

## Goals
1. Add a `read_image` tool to `src/tools.ts`
2. Support both local file paths and base64-encoded images
3. Extract metadata (dimensions, format, size, MIME type)
4. Optional OCR integration (tesseract.js or similar)
5. Support for image analysis with vision-capable models
6. Maintain consistency with existing tool patterns

## Implementation Plan

### Phase 1: Core `read_image` Tool
**File:** `src/tools.ts`
**Status:** ✅ **COMPLETE**

Implementation:
- Tool function: `read_image()` at line 1243
- Helpers: `isImageBuffer()`, `parseBase64Data()`, `getImageFormat()`
- Metadata: width, height, format, size, MIME type via `image-size`
- Security: `checkPathSafety()`, size limits (10MB, 16k pixels)
- Formats: PNG, JPEG, GIF, WebP, BMP, TIFF

Dependencies:
- `"image-size": "^1.2.0"` added to `package.json`

**Features:**
```typescript
export async function read_image(
  ctx: ToolContext,
  args: { path?: string; data?: string; detail?: 'auto' | 'low' | 'high' }
): Promise<tools.ToolResult>
```

**Features:**
- Accept local file path OR base64 data (mutually exclusive, one required)
- Extract image metadata (format, dimensions, size, MIME type)
- Validate image file size (max 10MB default, configurable via `maxImageBytes`)
- Return structured result with:
  - `format`: image format name (png, jpeg, webp, etc.)
  - `width`: pixel width
  - `height`: pixel height
  - `size_bytes`: file size in bytes
  - `mime_type`: MIME type string
  - `base64`: base64-encoded image data
  - `metadata`: object with additional format-specific info

**Dependencies to add:**
- `image-size` (lightweight, ~200KB) - for metadata extraction
- Optional: `tesseract.js` (~2MB) - for OCR

**Security:**
- Validate path via `checkPathSafety(ctx, absPath)`
- Check file size before reading
- Validate base64 format and size
- Limit max dimensions (e.g., 16384px)

### Phase 2: Tool Registration
**File:** `src/tools.ts` (tool registration section)

**Add to `toolSchemas` array:**
```typescript
{
  type: 'function',
  function: {
    name: 'read_image',
    description: 'Read and analyze an image file. Supports local file paths or base64-encoded image data. Returns metadata (format, dimensions, size) and base64-encoded image content.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Local file path to the image (relative or absolute). Mutually exclusive with data.'
        },
        data: {
          type: 'string',
          description: 'Base64-encoded image data. Mutually exclusive with path.'
        },
        detail: {
          type: 'string',
          enum: ['auto', 'low', 'high'],
          description: 'Processing detail level for vision models (auto, low, high). Default: auto.',
          default: 'auto'
        }
      },
      required: ['path', 'data'],  // One of path or data required
      additionalProperties: false
    }
  }
}
```

**Add to tool dispatch map (in toolSchemas section or separate map):**
```typescript
read_image: {
  schema: readImageSchema,
  handler: read_image
}
```

**Add to tool name list:**
```typescript
export const toolNames = [
  // ... existing tools
  'read_image',
  // ... other tools
] as const;
```

### Phase 3: CLI Integration
**File:** `src/cli/commands/tools.ts` (or create `src/cli/commands/image.ts`)

Add image subcommand group:
```typescript
export const imageCommands = {
  name: 'image',
  description: 'Image analysis tools',
  commands: {
    read: {
      name: 'read',
      description: 'Read and analyze an image file',
      args: [{ name: 'path', description: 'Image file path' }],
      handler: async (ctx: any, args: { path: string }) => {
        const result = await tools.read_image(ctx, { path: args.path });
        return formatToolResult(result);
      }
    },
    base64: {
      name: 'base64',
      description: 'Analyze base64-encoded image data',
      args: [{ name: 'data', description: 'Base64 image data' }],
      handler: async (ctx: any, args: { data: string }) => {
        const result = await tools.read_image(ctx, { data: args.data });
        return formatToolResult(result);
      }
    },
    info: {
      name: 'info',
      description: 'Show only metadata for an image',
      args: [{ name: 'path', description: 'Image file path' }],
      handler: async (ctx: any, args: { path: string }) => {
        const result = await tools.read_image(ctx, { path: args.path });
        return formatMetadataOnly(result);
      }
    }
  }
};
```

**CLI usage:**
```bash
/image read <path>          # Read and analyze image
/image base64 <data>        # Analyze base64-encoded image
/image info <path>          # Show metadata only
/image                      # Show help
```

### Phase 4: Enhanced Prompt Expansion
**File:** `src/cli/input.ts`

Enhance `expandPromptImages()` to support metadata extraction:

```typescript
export async function expandPromptImages(
  text: string,
  cwd: string,
  supportsVision: boolean,
  extractMetadata?: boolean  // NEW PARAMETER
): Promise<{ 
  content: UserContent; 
  warnings: string[]; 
  imageCount: number;
  imageMetadata?: Array<{ path: string; metadata: Record<string, any> }>  // NEW
}> {
  // ... existing implementation ...
  
  if (extractMetadata) {
    const metadata = await Promise.all(refs.map(async (ref) => {
      // ... extract metadata from image file ...
      return { path: ref, metadata: { width, height, format, size } };
    }));
    return { content: parts, warnings, imageCount, imageMetadata: metadata };
  }
  
  return { content: parts, warnings, imageCount };
}
```

**Support new syntax:**
- `@image:path` - Reference image with metadata
- `@image-info:path` - Reference image metadata only
- `![](path)` - Markdown image (existing, auto-converts to base64 for vision models)

### Phase 5: Vision Model Integration
**File:** `src/agent.ts`, `src/index.ts`

**In `agent.ts` - Update image handling:**
```typescript
async function processUserContent(
  content: UserContent,
  ctx: AgentContext
): Promise<UserContent> {
  if (Array.isArray(content)) {
    return await Promise.all(content.map(async (part) => {
      if (part.type === 'image_url') {
        // Extract metadata for context
        const metadata = await extractImageMetadata(part.image_url.url);
        return {
          ...part,
          metadata  // Add to content for context
        };
      }
      return part;
    }));
  }
  return content;
}
```

**In `index.ts` - Update agent turn processing:**
```typescript
async function runAgentTurnWithSpinner(ctx: ReplContext, input: UserContent) {
  // ... existing code ...
  
  // Auto-extract metadata for vision-capable models
  if (ctx.session.supportsVision && Array.isArray(input)) {
    const enhancedInput = await enhanceWithImageMetadata(input);
    input = enhancedInput;
  }
  
  // ... rest of turn processing ...
}
```

### Phase 6: Optional OCR (Stretch)
**File:** `src/tools.ts` (optional addition)

Add `ocr_image` tool:
```typescript
export async function ocr_image(
  ctx: ToolContext,
  args: { path?: string; data?: string; language?: string }
): Promise<ToolResult> {
  // Load tesseract.js
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker();
  
  try {
    // ... process image and extract text ...
    const { data: { text } } = await worker.recognize(imageData);
    return {
      success: true,
      summary: `Extracted ${text.length} chars of text`,
      result: { text, language: args.language || 'eng' }
    };
  } finally {
    await worker.terminate();
  }
}
```

## Technical Specifications

### Dependencies

**Required:**
```json
{
  "image-size": "^1.0.0"
}
```

**Optional:**
```json
{
  "tesseract.js": "^5.0.0"
}
```

### Tool Schema Details

```typescript
const readImageSchema: ToolSchema = {
  type: 'function',
  function: {
    name: 'read_image',
    description: [
      'Read and analyze an image file.',
      'Returns structured metadata and base64-encoded image content.',
      'Supports local file paths or base64-encoded data.',
      'Use this when you need to analyze, describe, or work with image files.'
    ].join(' '),
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: [
            'Local file path to the image.',
            'Can be relative (to current directory) or absolute.',
            'Mutually exclusive with the `data` parameter.'
          ].join(' '),
          maxLength: 4096
        },
        data: {
          type: 'string',
          description: [
            'Base64-encoded image data.',
            'Include the full base64 string with data URL prefix if needed.',
            'Mutually exclusive with the `path` parameter.'
          ].join(' '),
          maxLength: 10000000  // ~10MB limit
        },
        detail: {
          type: 'string',
          enum: ['auto', 'low', 'high'],
          description: [
            'Processing detail level for vision-capable models.',
            '`auto`: Model decides based on image size.',
            '`low`: Lower resolution, faster processing.',
            '`high`: Higher resolution, more detail.'
          ].join(' '),
          default: 'auto'
        }
      },
      oneOf: [
        { required: ['path'] },
        { required: ['data'] }
      ],
      additionalProperties: false
    }
  }
};
```

### Return Value Format

```typescript
type ImageMetadata = {
  format: 'png' | 'jpeg' | 'gif' | 'webp' | 'bmp' | 'tiff' | 'svg' | 'unknown';
  width: number;
  height: number;
  size_bytes: number;
  mime_type: string;
  base64: string;
  metadata?: {
    colorType?: string;
    bitDepth?: number;
    resolutionUnit?: string;
    xDensity?: number;
    yDensity?: number;
    [key: string]: unknown;
  };
};

type ToolResult = {
  success: boolean;
  summary: string;
  result: ImageMetadata;
  diff?: never;
};
```

### Error Handling

```typescript
// Common error cases
if (!args.path && !args.data) {
  return { success: false, summary: 'Either path or data must be provided' };
}

if (args.path && args.data) {
  return { success: false, summary: 'path and data are mutually exclusive' };
}

if (buf.length > MAX_IMAGE_BYTES) {
  return { success: false, summary: `Image too large (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB)` };
}

if (!isImageBuffer(buf)) {
  return { success: false, summary: 'File is not a valid image' };
}
```

### Security Considerations

1. **Path Validation:**
   - Use `checkPathSafety(ctx, absPath)` for file paths
   - Block access to sensitive files (`/etc/passwd`, `.env`, etc.)
   - Respect `noConfirm` mode for safe operations

2. **Size Limits:**
   - Default: 10MB max file size
   - Configurable via `ctx.maxImageBytes`
   - Limit base64 input length (10MB raw = ~13MB base64)

3. **Memory Safety:**
   - Check buffer size before reading
   - Stream large files? (probably unnecessary for typical images)
   - Clear sensitive data from memory after use

4. **Base64 Validation:**
   - Validate base64 format
   - Check for data URL prefix (`data:image/png;base64,`)
   - Sanitize input to prevent injection

### Performance Optimizations

1. **Caching:**
   ```typescript
   const imageCache = new Map<string, ImageMetadata>();
   
   async function getCachedMetadata(path: string): Promise<ImageMetadata | null> {
     const cached = imageCache.get(path);
     if (cached) return cached;
     return null;
   }
   
   async function cacheMetadata(path: string, metadata: ImageMetadata) {
     if (imageCache.size > 100) imageCache.clear();  // LRU-ish
     imageCache.set(path, metadata);
   }
   ```

2. **Lazy Loading:**
   - Only load metadata initially
   - Load full base64 only when needed by model

3. **Parallel Processing:**
   - Process multiple images in parallel when possible
   - Use `Promise.all()` for batch operations

### Testing Strategy

**Unit Tests (`tests/tools/read_image.test.ts`):**
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { read_image } from '../src/tools.js';
import fs from 'fs/promises';
import path from 'path';

describe('read_image', () => {
  it('should read a PNG image and return metadata', async () => {
    const result = await read_image(ctx, { 
      path: 'fixtures/image.png' 
    });
    
    expect(result.success).toBe(true);
    expect(result.result.format).toBe('png');
    expect(result.result.width).toBeGreaterThan(0);
    expect(result.result.height).toBeGreaterThan(0);
    expect(result.result.mime_type).toBe('image/png');
    expect(result.result.base64).toBeDefined();
  });

  it('should handle base64 input', async () => {
    const base64Data = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';  // 1x1 PNG
    const result = await read_image(ctx, { data: base64Data });
    
    expect(result.success).toBe(true);
    expect(result.result.width).toBe(1);
    expect(result.result.height).toBe(1);
  });

  it('should fail for non-image file', async () => {
    const result = await read_image(ctx, { 
      path: 'fixtures/text.txt' 
    });
    
    expect(result.success).toBe(false);
  });

  it('should fail for missing file', async () => {
    const result = await read_image(ctx, { 
      path: 'fixtures/nonexistent.png' 
    });
    
    expect(result.success).toBe(false);
  });

  it('should fail for oversized file', async () => {
    // Create a mock file > 10MB
    const result = await read_image(ctx, { 
      path: 'fixtures/large.png' 
    });
    
    expect(result.success).toBe(false);
    expect(result.summary).toContain('too large');
  });
});
```

**Integration Tests:**
1. Test with actual agent session
2. Test with vision-capable model (Qwen2.5-Vision, GPT-4V, etc.)
3. Test with non-vision model (should still work, just no image processing)
4. Test error cases (corrupted images, invalid formats, etc.)

### Documentation Updates

**1. `docs/tools.md` (add section):**
```markdown
## read_image

Read and analyze an image file. Supports local file paths or base64-encoded image data.

### Parameters

- `path` (string, optional): Local file path to the image
- `data` (string, optional): Base64-encoded image data
- `detail` (string, optional): Processing detail level for vision models (`auto`, `low`, `high`)

### Returns

Object with:
- `format`: Image format (png, jpeg, webp, etc.)
- `width`: Image width in pixels
- `height`: Image height in pixels
- `size_bytes`: File size in bytes
- `mime_type`: MIME type string
- `base64`: Base64-encoded image data

### Example

```json
{
  "tool": "read_image",
  "args": {
    "path": "screenshots/error.png"
  }
}
```

Response:
```json
{
  "success": true,
  "summary": "PNG image (1920x1080, 2.4MB)",
  "result": {
    "format": "png",
    "width": 1920,
    "height": 1080,
    "size_bytes": 2539520,
    "mime_type": "image/png",
    "base64": "iVBORw0KGgoAAAANSUhEUgAAB..."
  }
}
```
```

**2. `docs/examples/image-analysis.md` (new file):**
```markdown
# Image Analysis Examples

## Analyzing a Screenshot

```
Read this screenshot and explain what's happening: ![Error](screenshots/login-error.png)
```

The agent will:
1. Detect the image reference
2. Read the image file
3. Extract metadata (dimensions, format)
4. Convert to base64 for the vision model
5. Analyze the image content
6. Provide a description

## Using the Image Tool Directly

```
/image read screenshots/login-error.png
```

This returns structured metadata that you can use in your analysis.

## OCR Text Extraction

```
/image ocr screenshots/document.png
```

Extracts text from images using OCR (requires tesseract.js).

## Working with Multiple Images

```
Analyze these screenshots:
1. ![First](screenshots/step1.png)
2. ![Second](screenshots/step2.png)
3. ![Third](screenshots/step3.png)
```

The agent processes each image and provides comparative analysis.
```

**3. CLI Help Text:**
```bash
$ idlehands --help

# Add to tool commands:
/image <command>  Image analysis tools
  read <path>     Read and analyze an image file
  base64 <data>   Analyze base64-encoded image
  info <path>     Show image metadata only
```

## Implementation Checklist

### Phase 1: Core Tool
- [ ] Add `read_image()` function to `src/tools.ts`
- [ ] Import `image-size` package
- [ ] Implement metadata extraction
- [ ] Handle both path and data parameters
- [ ] Add error handling and validation
- [ ] Return `ToolResult` with structured metadata

### Phase 2: Registration
- [ ] Create `readImageSchema` (ToolSchema)
- [ ] Add to `toolSchemas` array
- [ ] Add to tool dispatch map
- [ ] Add to `toolNames` list
- [ ] Test with agent session

### Phase 3: CLI Integration
- [ ] Add `/image` command group to CLI
- [ ] Implement `read`, `base64`, `info` subcommands
- [ ] Add help text
- [ ] Test CLI commands

### Phase 4: Enhanced Expansion
- [ ] Update `expandPromptImages()` signature
- [ ] Add metadata extraction option
- [ ] Implement `@image:path` syntax
- [ ] Test with agent prompts

### Phase 5: Bot Integration  
- [x] **Discord image attachments** - process Discord image attachments automatically
- [x] **Telegram photo messages** - handle Telegram photos with captions
- [x] **Vision model integration** - automatic metadata extraction for both platforms
- [x] **UserContent compatibility** - proper handling of multipart content for session.ask()

### Phase 6: Testing & Polish
- [x] **Comprehensive test suite** - 47 passing tests across 15 test suites
- [x] **Unit tests** - Core functionality, parameter validation, error handling
- [x] **Integration tests** - File I/O, metadata extraction, prompt expansion
- [x] **Bot integration tests** - Discord attachments, Telegram photos, concurrency
- [x] **Performance tests** - Timing constraints, resource usage
- [x] **Security tests** - Input validation, malicious URLs (+ future TODOs)
- [x] **CI integration** - GitHub Actions workflow compatibility

### Phase 6: OCR (Stretch)
- [ ] Add `tesseract.js` dependency
- [ ] Implement `ocr_image()` tool
- [ ] Add language selection
- [ ] Add error handling for OCR failures

### Testing
- [ ] Unit tests for `read_image()`
- [ ] Integration tests with agent
- [ ] Test with vision/non-vision models
- [ ] Edge case tests (corrupted, invalid, large)

### Documentation
- [ ] Update `docs/tools.md`
- [ ] Create `docs/examples/image-analysis.md`
- [ ] Update CLI help text
- [ ] Add examples to README

## Future Enhancements

1. **Image Processing Tools:**
   - `resize_image()` - Resize images
   - `crop_image()` - Crop images
   - `convert_image()` - Convert formats

2. **Advanced OCR:**
   - Layout detection (tables, columns)
   - Handwriting recognition
   - Multi-language support

3. **Image Analysis:**
   - Object detection (via model)
   - Scene understanding
   - Image similarity comparison

4. **Batch Operations:**
   - Process multiple images
   - Queue-based processing
   - Progress tracking

5. **Caching:**
   - Metadata cache for repeated reads
   - Base64 cache for large images
   - OCR result cache

---

**Status:** Planning phase complete. Ready for implementation.