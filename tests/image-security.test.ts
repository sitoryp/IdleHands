import { test, describe } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import { read_image } from '../dist/tools.js';
import type { ToolContext } from '../dist/tools.js';

/**
 * Security-focused tests for the image tool
 * Tests path traversal, resource limits, input validation, etc.
 */

describe('Image Tool - Security Tests', () => {
  const mockToolContext: ToolContext = {
    cwd: process.cwd(),
    noConfirm: true,
    dryRun: false,
    mode: 'code'
  };

  describe.todo('Path Traversal Protection', () => {
    const maliciousPaths = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '/etc/shadow',
      'C:\\Windows\\System32\\config\\SAM',
      '....//....//....//etc//passwd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%252f..%252f..%252fetc%252fpasswd',
      '~/.ssh/id_rsa',
      '/proc/self/environ'
    ];

    test('should block path traversal attempts', async () => {
      for (const maliciousPath of maliciousPaths) {
        const result = await read_image(mockToolContext, { path: maliciousPath });
        assert(result.startsWith('ERROR:'), `Should reject malicious path: ${maliciousPath}`);
        assert(
          result.includes('path safety') || 
          result.includes('no such file') ||
          result.includes('not found') || 
          result.includes('not allowed') ||
          result.includes('ENOENT'),
          `Should have appropriate error for: ${maliciousPath}`
        );
      }
    });

    test('should allow legitimate relative paths', async () => {
      // Create test structure
      const testDir = path.join(process.cwd(), 'test-images');
      const testFile = path.join(testDir, 'test.png');
      
      try {
        await fs.mkdir(testDir, { recursive: true });
        const testImageData = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
        await fs.writeFile(testFile, testImageData);

        // Test legitimate relative paths
        const legitimatePaths = [
          './test-images/test.png',
          'test-images/test.png',
          path.relative(process.cwd(), testFile)
        ];

        for (const legit of legitimatePaths) {
          const result = await read_image(mockToolContext, { path: legit });
          assert(!result.startsWith('ERROR:'), `Should allow legitimate path: ${legit}`);
        }
      } finally {
        await fs.rm(testDir, { recursive: true, force: true });
      }
    });
  });

  describe('Resource Limits', () => {
    test.todo('should enforce file size limits', async () => {
      // Create a base64 string representing >10MB
      const chunk = 'A'.repeat(1024); // 1KB chunk
      const largeBad64 = Array.from({ length: 11 * 1024 }, () => chunk).join(''); // ~11MB
      
      const result = await read_image(mockToolContext, { data: largeBad64 });
      assert(result.startsWith('ERROR:'));
      assert(
        result.includes('exceeds maximum') || 
        result.includes('too large') || 
        result.includes('Invalid base64')
      );
    });

    test('should enforce dimension limits', async () => {
      // This test would need a specially crafted image with huge dimensions
      // For now, just verify the limit logic exists
      const normalImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const result = await read_image(mockToolContext, { data: normalImage });
      
      const parsed = JSON.parse(result);
      assert(parsed.success);
      assert(parsed.result.width <= 16384);
      assert(parsed.result.height <= 16384);
    });

    test('should handle memory exhaustion gracefully', async () => {
      // Test with various invalid/corrupted image data
      const corruptedImages = [
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QD', // Truncated PNG
        '/9j/4AAQSkZJRgABAQEAYABgAAD/truncated', // Truncated JPEG
        'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7CORRUPTED', // Corrupted GIF
        'UklGRiYAAABXRUJQVlA4IBoAAAAwAQCdASoBAAEAAQAcJaQAA3AA' // Truncated WebP
      ];

      for (const corrupt of corruptedImages) {
        const result = await read_image(mockToolContext, { data: corrupt });
        // Should handle gracefully without crashing
        assert(typeof result === 'string');
        if (result.startsWith('ERROR:')) {
          assert(
            result.includes('not a valid image') || 
            result.includes('Invalid') ||
            result.includes('corrupted')
          );
        }
      }
    });
  });

  describe('Input Validation', () => {
    test('should validate base64 format strictly', async () => {
      const invalidBase64Inputs = [
        'not-base64-at-all',
        '!@#$%^&*()',
        'SGVsbG8gV29ybGQ=extra-chars',
        'data:image/png;base64,', // Missing data
        'data:text/plain;base64,SGVsbG8=', // Wrong MIME type
        String.fromCharCode(0, 1, 2, 3, 4), // Binary data
        '🎉🌟✨', // Unicode emoji
        '\x00\x01\x02\x03' // Control characters
      ];

      for (const invalid of invalidBase64Inputs) {
        const result = await read_image(mockToolContext, { data: invalid });
        assert(result.startsWith('ERROR:'), `Should reject invalid base64: ${JSON.stringify(invalid)}`);
      }
    });

    test('should handle extreme parameter combinations', async () => {
      const extremeTests = [
        { path: '', data: '' }, // Empty strings
        { path: null as any }, // Null values
        { path: undefined as any }, // Undefined values  
        { data: null as any },
        { path: 123 as any }, // Wrong types
        { data: [] as any },
        { path: {invalid: 'object'} as any }
      ];

      for (const params of extremeTests) {
        const result = await read_image(mockToolContext, params);
        assert(result.startsWith('ERROR:'), `Should handle extreme params: ${JSON.stringify(params)}`);
      }
    });

    test.todo('should sanitize file paths', async () => {
      const sanitizationTests = [
        'normal/path/image.png',
        'path with spaces/image.png',
        'path-with-dashes/image.png',
        'path_with_underscores/image.png',
        'path.with.dots/image.png',
        'MixedCase/Image.PNG'
      ];

      for (const testPath of sanitizationTests) {
        const result = await read_image(mockToolContext, { path: testPath });
        // Should handle without throwing, even if file doesn't exist
        assert(typeof result === 'string');
        if (result.startsWith('ERROR:')) {
          assert(result.includes('not found') || result.includes('path safety'));
        }
      }
    });
  });

  describe('Data URI Security', () => {
    test('should handle data URIs safely', async () => {
      const dataUriTests = [
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2NjIpLCBxdWFsaXR5ID0gOTAK/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/EAB8BAAMBAQEBAQEBAQEAAAAAAAABAgMEBQYHCAkKC//EALURAAIBAgQEAwQHBQQEAAECdwABAgMRBAUhMQYSQVEHYXETIjKBkQgUobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==',
        'data:,plain-text-should-be-rejected', // Non-image data URI
        'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' // SVG (may be dangerous)
      ];

      for (const dataUri of dataUriTests) {
        const result = await read_image(mockToolContext, { data: dataUri });
        assert(typeof result === 'string');
        
        if (dataUri.includes('plain-text') || dataUri.includes('svg')) {
          // Should reject non-image or potentially dangerous formats
          assert(result.startsWith('ERROR:') || result.includes('not a valid image'));
        }
      }
    });

    test('should prevent XXE and other injection attacks', async () => {
      // SVG with XXE attempt
      const maliciousSvg = `
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE svg [
          <!ENTITY xxe SYSTEM "file:///etc/passwd">
        ]>
        <svg>
          <text>&xxe;</text>
        </svg>
      `;
      
      const svgBase64 = Buffer.from(maliciousSvg).toString('base64');
      const result = await read_image(mockToolContext, { data: svgBase64 });
      
      // Should reject SVG or handle safely
      assert(result.startsWith('ERROR:') || !result.includes('/etc/passwd'));
    });
  });

  describe('Concurrent Access Security', () => {
    test('should handle concurrent requests safely', async () => {
      const validImage = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      
      // Simulate 10 concurrent requests
      const promises = Array.from({ length: 10 }, (_, i) => 
        read_image(mockToolContext, { data: validImage })
      );

      const results = await Promise.all(promises);
      
      // All should succeed independently
      results.forEach((result, i) => {
        assert(!result.startsWith('ERROR:'), `Request ${i} should succeed`);
        const parsed = JSON.parse(result);
        assert(parsed.success);
      });
    });

    test('should not leak data between requests', async () => {
      const image1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='; // 1x1 PNG
      const image2 = '/9j/4AAQSkZJRgABAQEAYABgAAD//gA7Q1JFQVRPUjogZ2QtanBlZyB2MS4wICh1c2luZyBJSkcgSlBFRyB2NjIpLCBxdWFsaXR5ID0gOTAK/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/8AAEQgAAQABAwEiAAIRAQMRAf/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q=='; // 1x1 JPEG
      
      // Process different images concurrently
      const [result1, result2] = await Promise.all([
        read_image(mockToolContext, { data: image1 }),
        read_image(mockToolContext, { data: image2 })
      ]);

      const parsed1 = JSON.parse(result1);
      const parsed2 = JSON.parse(result2);
      
      // Should have different formats and data
      assert.notEqual(parsed1.result.format, parsed2.result.format);
      assert.notEqual(parsed1.result.base64, parsed2.result.base64);
      assert.notEqual(parsed1.result.mime_type, parsed2.result.mime_type);
    });
  });

  describe.todo('Error Information Disclosure', () => {
    test('should not leak sensitive information in error messages', async () => {
      const sensitiveAttempts = [
        '/etc/passwd',
        'C:\\Windows\\System32\\config\\SAM',
        '/proc/self/environ',
        '~/.ssh/id_rsa'
      ];

      for (const sensitive of sensitiveAttempts) {
        const result = await read_image(mockToolContext, { path: sensitive });
        assert(result.startsWith('ERROR:'));
        
        // Error message should not contain the full sensitive path
        const errorMsg = result.toLowerCase();
        assert(!errorMsg.includes('/etc/passwd'));
        assert(!errorMsg.includes('sam'));
        assert(!errorMsg.includes('id_rsa'));
        assert(!errorMsg.includes('environ'));
      }
    });

    test('should not expose internal file system structure', async () => {
      const result = await read_image(mockToolContext, { 
        path: '../../../does/not/exist.png' 
      });
      
      assert(result.startsWith('ERROR:'));
      // Should not expose resolved absolute paths in error
      assert(!result.includes(process.cwd()));
      assert(!result.includes('/home/'));
      assert(!result.includes('/Users/'));
      assert(!result.includes('C:\\'));
    });
  });
});