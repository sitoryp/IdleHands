import { test, describe } from 'node:test';
import assert from 'node:assert';
import { expandPromptImages } from '../dist/cli/input.js';

/**
 * Bot Integration Tests - Testing image functionality that would be used by Discord/Telegram bots
 * These tests simulate the bot workflows without requiring actual bot setup
 */

describe('Bot Image Integration Tests', () => {
  const mockProjectDir = process.cwd();

  test('Discord attachment workflow simulation', async () => {
    // Simulate Discord bot receiving an image attachment
    const userMessage = 'What do you see in this image?';
    const attachmentUrl = 'https://cdn.discordapp.com/attachments/123/456/image.png';
    
    // Simulate how Discord bot adds attachment URLs to message
    const messageWithImage = `${userMessage}\n\n![Attachment](${attachmentUrl})`;
    
    // Test vision model processing
    const result = await expandPromptImages(
      messageWithImage,
      mockProjectDir,
      true, // supportsVision
      true  // extractMetadata
    );

    assert.equal(result.imageCount, 1);
    assert(Array.isArray(result.content));
    assert.equal(result.content.length, 2); // text + image parts
    assert.equal(result.content[0].type, 'text');
    assert.equal(result.content[1].type, 'image_url');
    assert(result.content[1].image_url.url === attachmentUrl);
  });

  test('Telegram photo workflow simulation', async () => {
    // Simulate Telegram bot receiving a photo with caption
    const caption = 'Analyze this screenshot';
    const telegramFileUrl = 'https://api.telegram.org/file/bot123:ABC/photos/file_123.jpg';
    
    // Simulate how Telegram bot adds photo URLs to caption
    const messageWithPhoto = `${caption}\n\n![Photo](${telegramFileUrl})`;
    
    const result = await expandPromptImages(
      messageWithPhoto,
      mockProjectDir,
      true, // supportsVision
      true  // extractMetadata
    );

    assert.equal(result.imageCount, 1);
    assert(Array.isArray(result.content));
    assert(result.content[1].image_url.url === telegramFileUrl);
  });

  test('Multiple images from Discord simulation', async () => {
    // Simulate Discord user uploading multiple images
    const message = 'Compare these screenshots';
    const attachments = [
      'https://cdn.discordapp.com/attachments/123/456/screen1.png',
      'https://cdn.discordapp.com/attachments/123/456/screen2.png',
      'https://cdn.discordapp.com/attachments/123/456/screen3.jpg'
    ];
    
    const messageWithImages = message + '\n\n' + 
      attachments.map(url => `![Attachment](${url})`).join('\n');
    
    const result = await expandPromptImages(
      messageWithImages,
      mockProjectDir,
      true, // supportsVision
      true  // extractMetadata
    );

    assert.equal(result.imageCount, 3);
    assert(Array.isArray(result.content));
    assert.equal(result.content.length, 4); // text + 3 images
  });

  test('Non-vision model handling in bot context', async () => {
    const messageWithImage = 'Look at this\n\n![Attachment](https://example.com/image.png)';
    
    // Simulate non-vision model
    const result = await expandPromptImages(
      messageWithImage,
      mockProjectDir,
      false, // supportsVision = false
      false  // extractMetadata
    );

    assert.equal(result.imageCount, 0);
    assert.equal(result.warnings.length, 1);
    assert(result.warnings[0].includes('does not advertise vision'));
    assert(typeof result.content === 'string');
  });

  test('Mixed content - user text + image + @image syntax', async () => {
    // User sends both attachment and uses @image syntax in same message
    const message = 'Compare ![Attachment](https://discord.com/image1.png) with @image-info:local-file.png';
    
    const result = await expandPromptImages(
      message,
      mockProjectDir,
      true,  // supportsVision
      true   // extractMetadata
    );

    // Should process both the attachment URL and the @image-info syntax
    assert.equal(result.imageCount, 1); // Only the attachment counts as image
    const content = result.content as string;
    assert(content.includes('[Image:') || result.warnings.some(w => w.includes('not found')));
  });

  test('Bot error recovery - invalid image URLs', async () => {
    const messageWithBadImage = 'Check this\n\n![Bad](https://invalid-domain-12345.com/fake.png)';
    
    const result = await expandPromptImages(
      messageWithBadImage,
      mockProjectDir,
      true, // supportsVision
      false // extractMetadata - don't try to fetch invalid URL
    );

    // Should still include the image reference for the model to handle
    assert.equal(result.imageCount, 1);
    assert(Array.isArray(result.content));
  });

  test('Large number of attachments handling', async () => {
    // Simulate user sending many images at once
    const message = 'Process all these screenshots';
    const manyUrls = Array.from({ length: 20 }, (_, i) => 
      `![Image${i}](https://example.com/image${i}.png)`
    ).join('\n');
    const messageWithManyImages = message + '\n\n' + manyUrls;
    
    const result = await expandPromptImages(
      messageWithManyImages,
      mockProjectDir,
      true, // supportsVision
      false // extractMetadata - faster without metadata
    );

    assert.equal(result.imageCount, 20);
    assert(Array.isArray(result.content));
    assert.equal(result.content.length, 21); // text + 20 images
  });

  test('Empty message with only images', async () => {
    // User sends images with no text
    const onlyImages = '![Photo](https://telegram.org/photo.jpg)';
    
    const result = await expandPromptImages(
      onlyImages,
      mockProjectDir,
      true, // supportsVision
      true  // extractMetadata
    );

    assert.equal(result.imageCount, 1);
    assert(Array.isArray(result.content));
    assert.equal(result.content[0].type, 'text');
    assert.equal(result.content[0].text, onlyImages); // Original text preserved
  });

  test('Bot concurrency simulation - multiple users', async () => {
    // Simulate multiple users sending images simultaneously
    const users = [
      { message: 'User 1 image\n\n![A](https://example.com/1.png)', cwd: mockProjectDir },
      { message: 'User 2 images\n\n![B](https://example.com/2.jpg)', cwd: mockProjectDir },
      { message: 'User 3 @image:test.png', cwd: mockProjectDir }
    ];

    const results = await Promise.all(
      users.map(user => expandPromptImages(user.message, user.cwd, true, true))
    );

    // Each should be processed independently
    assert.equal(results.length, 3);
    results.forEach((result, i) => {
      if (i < 2) {
        assert.equal(result.imageCount, 1);
      } else {
        // Third user's local file may not exist - check for appropriate handling
        assert(result.imageCount === 1 || result.warnings.length > 0);
      }
    });
  });
});

describe('Bot Performance Tests', () => {
  test('Image processing should not block bot significantly', async () => {
    const message = 'Quick test\n\n![Image](https://httpbin.org/status/200)';
    
    const start = Date.now();
    await expandPromptImages(message, process.cwd(), true, false);
    const elapsed = Date.now() - start;
    
    // Should complete quickly for URL processing (no actual fetch)
    assert(elapsed < 500);
  });

  test('Metadata extraction should be reasonably fast', async () => {
    // Test with base64 data (no file I/O)
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const message = `Analyze ![Test](${testImage})`;
    
    const start = Date.now();
    await expandPromptImages(message, process.cwd(), true, true);
    const elapsed = Date.now() - start;
    
    // Metadata extraction for small image should be fast
    assert(elapsed < 1000);
  });
});

describe('Bot Security Tests', () => {
  test('Should handle malicious URLs safely', async () => {
    const maliciousUrls = [
      'file:///etc/passwd',
      'javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      '../../../sensitive-file.txt'
    ];

    for (const url of maliciousUrls) {
      const message = `Check ![Test](${url})`;
      
      // Should not throw errors, should handle gracefully
      const result = await expandPromptImages(message, process.cwd(), true, true);
      assert(typeof result === 'object');
      assert(typeof result.imageCount === 'number');
    }
  });

  test('Should handle extremely long URLs', async () => {
    const longUrl = 'https://example.com/' + 'a'.repeat(10000) + '.png';
    const message = `Image: ![Test](${longUrl})`;
    
    const result = await expandPromptImages(message, process.cwd(), true, false);
    
    // Should handle without crashing
    assert.equal(result.imageCount, 1);
    assert(Array.isArray(result.content));
  });

  test('Should limit resource usage for many images', async () => {
    // Test with reasonable limit of images
    const manyImages = Array.from({ length: 50 }, (_, i) => 
      `![Img${i}](https://example.com/${i}.png)`
    ).join(' ');
    
    const start = Date.now();
    const result = await expandPromptImages(manyImages, process.cwd(), true, false);
    const elapsed = Date.now() - start;
    
    assert.equal(result.imageCount, 50);
    // Should complete in reasonable time even with many images
    assert(elapsed < 2000);
  });
});