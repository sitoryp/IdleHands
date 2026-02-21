# Image Tool Usage Guide

The IdleHands image parsing tool provides comprehensive image analysis capabilities across CLI, Discord, and Telegram interfaces.

## Features

- **Multiple input formats**: Local files, base64 data, URLs
- **Metadata extraction**: Dimensions, format, file size, MIME type  
- **Vision model integration**: Automatic image processing for vision-capable models
- **Enhanced syntax**: `@image:path` and `@image-info:path` for flexible workflows
- **Bot support**: Discord attachments and Telegram photos work seamlessly
- **Security validation**: Path safety, size limits, format verification

## CLI Usage

### Basic Image Analysis

```bash
# Analyze local image file
/image read screenshot.png

# Get metadata only
/image info photo.jpg  

# Process base64 data
/image base64 iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB...

# Get help
/image help
```

### Enhanced Prompt Syntax

```bash
# Include image in vision model prompt + extract metadata
"Analyze this screenshot: @image:bug-report.png"

# Get metadata text only (no image sent to model)
"The resolution is @image-info:screenshot.png - what do you think?"

# Traditional markdown (still works)
"Look at this: ![Screenshot](image.png)"
```

## Bot Usage

### Discord

Users can upload image attachments directly to Discord. The bot will:
- Automatically detect image attachments
- Process them with vision models
- Extract and log metadata
- Include images in the conversation context

```
User: [uploads screenshot.png] What's wrong with this UI?
Bot: [analyzes image with vision model + metadata]
```

### Telegram

Users can send photos with captions. The bot will:
- Process photos via Telegram Bot API
- Handle captions as prompts
- Support multiple photos per message
- Extract metadata automatically

```
User: [sends photo with caption "Fix this bug"]
Bot: [analyzes photo with vision model + metadata]
```

## Syntax Reference

| Syntax | Purpose | Image Included | Metadata |
|--------|---------|----------------|----------|
| `@image:path` | Include image + metadata | ✅ Yes | ✅ Yes |
| `@image-info:path` | Metadata text only | ❌ No | ✅ Yes |
| `![alt](path)` | Traditional markdown | ✅ Yes | ✅ Yes |
| File attachment | Bot platforms | ✅ Yes | ✅ Yes |

## Supported Formats

- **PNG**: `.png` 
- **JPEG**: `.jpg`, `.jpeg`
- **GIF**: `.gif`
- **WebP**: `.webp` 
- **BMP**: `.bmp`
- **TIFF**: `.tiff`, `.tif`

## Technical Details

### Security & Limits

- **File size limit**: 10MB maximum
- **Dimension limit**: 16,384 pixels (width/height)
- **Path validation**: Relative paths only, no traversal
- **Format validation**: Magic number verification

### Vision Model Integration

- **Automatic detection**: Checks if model supports vision
- **Graceful fallback**: Non-vision models receive warnings
- **Metadata context**: Enhanced prompts with image information
- **Performance optimization**: Metadata extracted once, cached

### API Structure

```typescript
// Tool result format
{
  success: true,
  summary: "PNG image (1920x1080, 2.4MB)",
  result: {
    format: "png",
    width: 1920, 
    height: 1080,
    size_bytes: 2453120,
    mime_type: "image/png",
    base64: "iVBORw0KGgoAAAA..." 
  }
}
```

## Examples

### Code Review Workflow
```
"Review this code screenshot: @image:code.png

Look for:
- Syntax errors
- Code style issues  
- Security vulnerabilities"
```

### UI/UX Analysis
```
"Analyze this mockup: @image:design.png

The target resolution is @image-info:final.png
What improvements do you suggest?"
```

### Bug Reports
```
"Bug report: @image-info:error.png shows the dimensions.

Here's the actual error: @image:screenshot.png"
```

## Troubleshooting

### Common Issues

**"Image path not found"**
- Check file path is relative to working directory
- Ensure file exists and is readable
- Verify file extension is supported

**"Not a valid image format"**  
- File may be corrupted
- Check file has valid image magic number
- Try re-saving file in supported format

**"Vision model not supported"**
- Current model doesn't advertise vision capabilities  
- Switch to vision-capable model (GPT-4V, Claude 3, etc.)
- Images will be processed but not sent to model

**"Image too large"**
- Reduce file size below 10MB limit
- Resize image dimensions if needed
- Use compression tools to optimize

### Performance Tips

- Use `@image-info:` for metadata-only operations
- Batch multiple images in single prompt when possible
- Consider image compression for large files
- Cache frequently used images as base64 data

## Integration Testing

The image tool includes comprehensive test coverage:

```bash
# Run image tool tests only  
npm test -- tests/image-tool.test.ts

# Run all image-related tests
npm test -- tests/image-*.test.ts

# Full CI test suite
npm test
```

Test categories:
- Unit tests: Core functionality
- Integration tests: File I/O and expansion
- Bot tests: Discord/Telegram workflows  
- Security tests: Input validation
- Performance tests: Resource limits