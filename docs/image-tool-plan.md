# Image Parsing Tool Plan for IdleHands

## Overview
Build a robust image parsing and analysis tool that integrates with IdleHands' tool system, allowing agents to read, analyze, and extract information from images.

## Current State
- Image references are already partially supported (vision models can process base64-encoded images)
- `expandPromptImages()` in `src/cli/input.ts` handles image expansion for prompts
- MIME type detection exists in `src/tools.ts`
- No dedicated tool for image analysis yet

## Goals
1. Add a `read_image` tool to `src/tools.ts`
2. Support both local file paths and base64-encoded images
3. Extract metadata (dimensions, format, size)
4. Optional OCR integration (tesseract.js or similar)
5. Support for image analysis with vision-capable models

## Implementation Plan

### Phase 1: Core `read_image` Tool
**File:** `src/tools.ts`

Add new tool:
```typescript
export async function read_image(
  ctx: ToolContext,
  args: { path?: string; data?: string; detail?: 'auto' | 'low' | 'high' }
): Promise<ToolResult>
```

Features:
- Accept local file path OR base64 data
- Extract image metadata (format, dimensions, size)
- Return structured result with:
  - MIME type
  - Dimensions (width/height)
  - File size
  - Base64-encoded image (for model consumption)
  - Optional metadata extraction

### Phase 2: Tool Registration
**File:** `src/tools.ts` (tool registration section)

Add to `toolSchemas` and tool dispatch map:
- Tool name: `read_image`
- Parameters: `path`, `data`, `detail`
- Returns: structured metadata + base64 image

### Phase 3: CLI Integration
**File:** `src/cli/commands/tools.ts`

Add command:
```bash
/image <path>          # Read and analyze image
/image base64 <data>   # Analyze base64-encoded image
/image info <path>     # Show metadata only
```

### Phase 4: Enhanced Prompt Expansion
**File:** `src/cli/input.ts`

Enhance `expandPromptImages()`:
- Add optional `analysis` parameter to request metadata extraction
- Support `@image:path` syntax for image reference with metadata
- Return both image data and metadata for context

### Phase 5: Vision Model Integration
**File:** `src/agent.ts`, `src/index.ts`

- Detect when model supports vision
- Automatically include image metadata in context
- Support multimodal prompts with image references

### Phase 6: Optional OCR (Stretch)
**File:** `src/tools.ts` (optional)

Add `ocr_image` tool using `tesseract.js`:
- Extract text from images
- Return structured text output
- Support language selection

## Technical Considerations

### Dependencies
- `sharp` or `image-size` for metadata extraction (lightweight)
- `tesseract.js` for OCR (optional, larger dependency)

### Security
- Validate image paths against `checkPathSafety()`
- Limit file size to prevent OOM
- Sanitize base64 input

### Performance
- Stream large images? (probably overkill)
- Cache metadata for repeated reads
- Limit max image dimensions

### API Compatibility
- Follow existing tool pattern in `tools.ts`
- Return consistent `ToolResult` type
- Support dry-run mode

## Example Usage

### In Agent Context
```json
{
  "tool": "read_image",
  "args": {
    "path": "screenshots/login-error.png"
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

### In Prompt
```
Analyze this error screenshot: ![Error](screenshots/login-error.png)
```

Agent automatically:
1. Reads the image
2. Extracts metadata
3. Sends to vision-capable model
4. Includes metadata in context

## Testing Strategy
1. Unit tests for `read_image()` with various image formats
2. Integration test with agent session
3. Test with vision-capable and non-vision models
4. Edge cases: corrupted images, unsupported formats, large files

## Documentation Updates
- Add to `docs/tools.md`
- Update CLI help text
- Add example in `docs/examples/` for image analysis workflows