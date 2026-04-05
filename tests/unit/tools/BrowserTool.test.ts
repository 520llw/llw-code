/**
 * BrowserTool Unit Tests
 * Tests for browser automation functionality using Playwright
 */

import { describe, test, expect } from '@jest/globals';
import { BrowserTool, BrowserInputSchema } from '../../../src/tools/implementations/web/BrowserTool';

describe('BrowserTool', () => {
  let tool: BrowserTool;

  beforeAll(() => {
    tool = new BrowserTool();
  });

  // ============================================================================
  // Schema Validation Tests
  // ============================================================================

  describe('Input Schema Validation', () => {
    test('should validate navigate action', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'navigate',
        url: 'https://example.com',
      });
      expect(result.success).toBe(true);
    });

    test('should reject invalid URL', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'navigate',
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    test('should validate click action', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'click',
        selector: '#button',
      });
      expect(result.success).toBe(true);
    });

    test('should validate type action', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'type',
        selector: '#input',
        text: 'Hello World',
      });
      expect(result.success).toBe(true);
    });

    test('should validate screenshot action', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'screenshot',
        fullPage: true,
      });
      expect(result.success).toBe(true);
    });

    test('should validate evaluate action', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'evaluate',
        script: 'document.title',
      });
      expect(result.success).toBe(true);
    });

    test('should reject evaluate without script', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'evaluate',
      });
      expect(result.success).toBe(false);
    });

    test('should validate wait action', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'wait',
        type: 'selector',
        value: '#element',
      });
      expect(result.success).toBe(true);
    });

    test('should validate scroll action', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'scroll',
        direction: 'down',
        amount: 500,
      });
      expect(result.success).toBe(true);
    });

    test('should validate getText action', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'getText',
        selector: 'h1',
      });
      expect(result.success).toBe(true);
    });

    test('should validate getAttribute action', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'getAttribute',
        selector: 'a.link',
        attribute: 'href',
      });
      expect(result.success).toBe(true);
    });

    test('should reject unknown action', () => {
      const result = BrowserInputSchema.safeParse({
        action: 'unknown',
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // Tool Metadata Tests
  // ============================================================================

  describe('Tool Metadata', () => {
    test('should have correct name', () => {
      expect(tool.name).toBe('browser');
    });

    test('should have description', () => {
      expect(tool.description.toLowerCase()).toContain('browser');
      expect(tool.description.length).toBeGreaterThan(0);
    });

    test('should be in WEB category', () => {
      expect(tool.category).toBe('web');
    });

    test('should require ASK permission', () => {
      expect(tool.permissionLevel).toBe('ask');
    });

    test('should have examples', () => {
      expect(tool.examples.length).toBeGreaterThan(0);
      expect(tool.examples[0]).toHaveProperty('description');
      expect(tool.examples[0]).toHaveProperty('input');
    });

    test('should have documentation', () => {
      expect(tool.documentation.length).toBeGreaterThan(0);
      expect(tool.documentation).toContain('navigate');
    });

    test('should have correct tags', () => {
      expect(tool.tags).toContain('browser');
      expect(tool.tags).toContain('playwright');
      expect(tool.tags).toContain('automation');
    });
  });

  // ============================================================================
  // Schema Export Tests
  // ============================================================================

  describe('Schema Exports', () => {
    test('should export BrowserInputSchema', () => {
      expect(BrowserInputSchema).toBeDefined();
      expect(typeof BrowserInputSchema.parse).toBe('function');
    });
  });

  // ============================================================================
  // Output Formatting Tests
  // ============================================================================

  describe('Output Formatting', () => {
    test('should format navigate output', () => {
      const formatOutput = (tool as unknown as { 
        formatOutput: (action: string, result: unknown) => string 
      }).formatOutput;
      
      const output = formatOutput.call(tool, 'navigate', {
        success: true,
        url: 'https://example.com',
        title: 'Example Page',
      });
      
      expect(output).toContain('🌐 Browser: navigate');
      expect(output).toContain('URL: https://example.com');
      expect(output).toContain('Title: Example Page');
    });

    test('should format click output', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'click', {
        success: true,
        selector: '#button',
      });
      
      expect(output).toContain('🌐 Browser: click');
      expect(output).toContain('Selector: #button');
    });

    test('should format type output', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'type', {
        success: true,
        selector: '#input',
        text: 'Hello World',
      });
      
      expect(output).toContain('🌐 Browser: type');
      expect(output).toContain('Selector: #input');
      expect(output).toContain('Text: Hello World');
    });

    test('should format getText output', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'getText', {
        success: true,
        selector: 'h1',
        text: 'Welcome to Example',
      });
      
      expect(output).toContain('🌐 Browser: getText');
      expect(output).toContain('Selector: h1');
      expect(output).toContain('Text: Welcome to Example');
    });

    test('should format getAttribute output', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'getAttribute', {
        success: true,
        selector: 'a.link',
        attribute: 'href',
        value: 'https://example.com',
      });
      
      expect(output).toContain('🌐 Browser: getAttribute');
      expect(output).toContain('Selector: a.link');
      expect(output).toContain('Value: https://example.com');
    });

    test('should format scroll output', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'scroll', {
        success: true,
        x: 0,
        y: 500,
      });
      
      expect(output).toContain('🌐 Browser: scroll');
      expect(output).toContain('Position: (0, 500)');
    });

    test('should format wait output', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'wait', {
        success: true,
        type: 'selector',
        duration: 100,
      });
      
      expect(output).toContain('🌐 Browser: wait');
      expect(output).toContain('Duration: 100ms');
    });

    test('should format evaluate output', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'evaluate', {
        success: true,
        result: { count: 42 },
        logs: [],
      });
      
      expect(output).toContain('🌐 Browser: evaluate');
      expect(output).toContain('Result:');
    });

    test('should format screenshot output', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'screenshot', {
        success: true,
        data: 'data:image/png;base64,iVBORw0KGgoAAAA',
        format: 'png',
      });
      
      expect(output).toContain('🌐 Browser: screenshot');
      expect(output).toContain('Screenshot:');
    });
  });

  // ============================================================================
  // Edge Case Tests
  // ============================================================================

  describe('Edge Cases', () => {
    test('should handle long text truncation', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const longText = 'a'.repeat(300);
      const output = formatOutput.call(tool, 'getText', {
        success: true,
        selector: 'p',
        text: longText,
      });
      
      expect(output).toContain('...');
    });

    test('should handle empty text', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'getText', {
        success: true,
        selector: 'p',
        text: '',
      });
      
      expect(output).toContain('Text:');
    });

    test('should handle null attribute value', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'getAttribute', {
        success: true,
        selector: 'div',
        attribute: 'data-missing',
        value: undefined,
      });
      
      expect(output).toContain('Value: (not set)');
    });

    test('should handle complex evaluate result', () => {
      const formatOutput = (tool as unknown as { formatOutput: (action: string, result: unknown) => string }).formatOutput;
      
      const output = formatOutput.call(tool, 'evaluate', {
        success: true,
        result: { nested: { array: [1, 2, 3], object: { key: 'value' } } },
        logs: [],
      });
      
      expect(output).toContain('Result:');
    });
  });
});
