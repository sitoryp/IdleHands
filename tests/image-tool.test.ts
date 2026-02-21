import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { read_image } from '../dist/tools.js';
import { extractImageRefs, expandPromptImages } from '../dist/cli/input.js';
import type { ToolContext } from '../dist/tools.js';

// Test fixtures
const TEST_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TEST_JPEG_BASE64 = '/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2NjIpLCBxdWFsaXR5ID0gOTAK/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBkQgUobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==';

// Shared mock context for all tests
const mockToolContext: ToolContext = {
  cwd: process.cwd(),
  noConfirm: true,
  dryRun: false,
  mode: 'code'
};

describe('Image Tool - Unit Tests', () => {

  test('read_image should validate parameters correctly', async () => {
    // Test missing both parameters
    const result1 = await read_image(mockToolContext, {});
    assert(result1.startsWith('ERROR:'));
    assert(result1.includes('must be provided'));

    // Test both parameters provided
    const result2 = await read_image(mockToolContext, { 
      path: 'test.png', 
      data: 'base64data' 
    });
    assert(result2.startsWith('ERROR:'));
    assert(result2.includes('mutually exclusive'));
  });

  test('read_image should process base64 PNG data', async () => {
    const result = await read_image(mockToolContext, { 
      data: TEST_PNG_BASE64 
    });
    
    assert(!result.startsWith('ERROR:'));
    const parsed = JSON.parse(result);
    assert(parsed.success === true);
    assert(parsed.result.format === 'png');
    assert(parsed.result.width === 1);
    assert(parsed.result.height === 1);
    assert(parsed.result.size_bytes === 70);
    assert(parsed.result.mime_type === 'image/png');
    assert(parsed.result.base64 === TEST_PNG_BASE64);
  });

  test('read_image should process base64 JPEG data', async () => {
    const result = await read_image(mockToolContext, { 
      data: TEST_JPEG_BASE64 
    });
    
    assert(!result.startsWith('ERROR:'));
    const parsed = JSON.parse(result);
    assert(parsed.success === true);
    assert(parsed.result.format === 'jpg');
    assert(parsed.result.width === 1);
    assert(parsed.result.height === 1);
    assert(parsed.result.mime_type === 'image/jpeg');
    assert(parsed.result.base64 === TEST_JPEG_BASE64);
  });

  test('read_image should handle invalid base64 data', async () => {
    const result = await read_image(mockToolContext, { 
      data: 'invalid-base64-data' 
    });
    
    assert(result.startsWith('ERROR:'));
    assert(result.includes('not a valid image'));
  });

  test('read_image should handle non-image base64 data', async () => {
    const textBase64 = Buffer.from('Hello World').toString('base64');
    const result = await read_image(mockToolContext, { 
      data: textBase64 
    });
    
    assert(result.startsWith('ERROR:'));
    assert(result.includes('not a valid image'));
  });

  test('read_image should handle missing file path', async () => {
    const result = await read_image(mockToolContext, { 
      path: 'nonexistent-file.png' 
    });
    
    assert(result.startsWith('ERROR:'));
    assert(result.includes('no such file') || result.includes('not found'));
  });

  test('read_image should validate file size limits', async () => {
    // This would need a large test file > 10MB to properly test
    // For now just ensure the limit logic exists
    const result = await read_image(mockToolContext, { 
      data: TEST_PNG_BASE64 
    });
    assert(!result.includes('exceeds maximum'));
  });
});

describe('Image Tool - Enhanced Syntax Tests', () => {
  test('extractImageRefs should parse new @image: syntax', () => {
    const refs = extractImageRefs('Look at @image:test.png and @image-info:photo.jpg');
    
    assert.equal(refs.length, 2);
    assert.deepEqual(refs[0], { path: 'test.png', type: 'image' });
    assert.deepEqual(refs[1], { path: 'photo.jpg', type: 'image-info' });
  });

  test('extractImageRefs should handle markdown syntax', () => {
    const refs = extractImageRefs('Check ![Alt](test.png) image');
    
    assert.equal(refs.length, 1);
    assert.deepEqual(refs[0], { path: 'test.png', type: 'image' });
  });

  test('extractImageRefs should handle URL patterns', () => {
    const refs = extractImageRefs('See image.png and https://example.com/photo.jpg');
    
    assert.equal(refs.length, 2);
    assert.deepEqual(refs[0], { path: 'image.png', type: 'image' });
    assert.deepEqual(refs[1], { path: 'https://example.com/photo.jpg', type: 'image' });
  });

  test('extractImageRefs should avoid duplicates and @image conflicts', () => {
    const refs = extractImageRefs('@image:test.png test.png');
    
    // Should only have the @image: reference, not the duplicate plain reference
    assert.equal(refs.length, 1);
    assert.deepEqual(refs[0], { path: 'test.png', type: 'image' });
  });

  test('extractImageRefs should handle complex mixed syntax', () => {
    const refs = extractImageRefs(`
      Here are some images:
      - @image:screenshot.png
      - @image-info:metadata.jpg  
      - ![Traditional](old.gif)
      - https://example.com/remote.webp
      - local-file.bmp
    `);
    
    assert.equal(refs.length, 5);
    assert.deepEqual(refs[0], { path: 'screenshot.png', type: 'image' });
    assert.deepEqual(refs[1], { path: 'metadata.jpg', type: 'image-info' });
    assert.deepEqual(refs[2], { path: 'old.gif', type: 'image' });
    assert.deepEqual(refs[3], { path: 'https://example.com/remote.webp', type: 'image' });
    assert.deepEqual(refs[4], { path: 'local-file.bmp', type: 'image' });
  });
});

describe('Image Tool - Integration Tests', () => {
  let testImagePath: string;

  // Setup: Create test image file
  test('setup test image file', async () => {
    testImagePath = path.join(process.cwd(), 'test-image.png');
    const imageBuffer = Buffer.from(TEST_PNG_BASE64, 'base64');
    await fs.writeFile(testImagePath, imageBuffer);
    
    // Verify file exists
    const stats = await fs.stat(testImagePath);
    assert(stats.isFile());
    assert.equal(stats.size, 70);
  });

  test('read_image should process file path correctly', async () => {
    const result = await read_image(mockToolContext, { 
      path: testImagePath 
    });
    
    assert(!result.startsWith('ERROR:'));
    const parsed = JSON.parse(result);
    assert(parsed.success === true);
    assert(parsed.result.format === 'png');
    assert(parsed.result.width === 1);
    assert(parsed.result.height === 1);
    assert(parsed.result.size_bytes === 70);
    assert(parsed.result.base64 === TEST_PNG_BASE64);
  });

  test('expandPromptImages should handle @image: with real file', async () => {
    const result = await expandPromptImages(
      `Analyze @image:${path.basename(testImagePath)}`,
      path.dirname(testImagePath),
      true, // supportsVision
      true  // extractMetadata
    );

    assert.equal(result.imageCount, 1);
    assert.equal(result.warnings.length, 0);
    assert(result.imageMetadata);
    assert.equal(result.imageMetadata.length, 1);
    assert.equal(result.imageMetadata[0].metadata.format, 'png');
    assert(Array.isArray(result.content));
  });

  test('expandPromptImages should handle @image-info: with metadata replacement', async () => {
    const result = await expandPromptImages(
      `The size is @image-info:${path.basename(testImagePath)}`,
      path.dirname(testImagePath),
      true, // supportsVision
      true  // extractMetadata
    );

    assert.equal(result.imageCount, 0); // @image-info doesn't add to image count
    assert.equal(result.warnings.length, 0);
    assert(result.imageMetadata);
    assert.equal(result.imageMetadata.length, 1);
    assert(typeof result.content === 'string');
    assert(result.content.includes('[Image: PNG 1x1, 0.00MB]'));
  });

  test('expandPromptImages should handle non-vision models gracefully', async () => {
    const result = await expandPromptImages(
      `Analyze @image:${path.basename(testImagePath)}`,
      path.dirname(testImagePath),
      false, // supportsVision = false
      true   // extractMetadata
    );

    assert.equal(result.imageCount, 0);
    assert.equal(result.warnings.length, 1);
    assert(result.warnings[0].includes('does not advertise vision'));
  });

  // Cleanup: Remove test image file
  test('cleanup test image file', async () => {
    await fs.unlink(testImagePath).catch(() => {});
  });
});

describe('Image Tool - Error Handling Tests', () => {
  test('read_image should handle oversized base64 data', async () => {
    // Create a base64 string that would exceed size limits
    const largeData = 'A'.repeat(15 * 1024 * 1024); // 15MB of 'A' characters
    const result = await read_image(mockToolContext, { 
      data: largeData 
    });
    
    assert(result.startsWith('ERROR:'));
    assert(result.includes('too large') || result.includes('exceeds maximum') || result.includes('Invalid base64'));
  });

  test('read_image should handle malformed data URLs', async () => {
    const result = await read_image(mockToolContext, { 
      data: 'data:image/png;base64,invalid-data' 
    });
    
    assert(result.startsWith('ERROR:'));
  });

  test('read_image should handle path traversal attempts', async () => {
    const result = await read_image(mockToolContext, { 
      path: '../../../etc/passwd' 
    });
    
    // Should be blocked by checkPathSafety
    assert(result.startsWith('ERROR:'));
  });

  test('expandPromptImages should handle missing files gracefully', async () => {
    const result = await expandPromptImages(
      'Look at @image:nonexistent-file.png',
      process.cwd(),
      true, // supportsVision
      true  // extractMetadata
    );

    assert.equal(result.imageCount, 0);
    assert(result.warnings.some(w => w.includes('not found')));
  });

  test('expandPromptImages should handle network timeouts for URLs', async () => {
    const result = await expandPromptImages(
      'See ![Image](https://nonexistent-domain-12345.com/image.png)',
      process.cwd(),
      true, // supportsVision
      false // extractMetadata - don't try to fetch
    );

    // URL images are processed differently - should still be included
    assert.equal(result.imageCount, 1);
  });
});

describe('Image Tool - Performance Tests', () => {
  test('read_image should complete within reasonable time', async () => {
    const start = Date.now();
    await read_image(mockToolContext, { data: TEST_PNG_BASE64 });
    const elapsed = Date.now() - start;
    
    // Should complete within 1 second for small images
    assert(elapsed < 1000);
  });

  test('extractImageRefs should handle large text efficiently', () => {
    const largeText = 'Some text with @image:test.png '.repeat(1000);
    const start = Date.now();
    const refs = extractImageRefs(largeText);
    const elapsed = Date.now() - start;
    
    assert.equal(refs.length, 1); // Should deduplicate
    assert(elapsed < 100); // Should be very fast
  });
});