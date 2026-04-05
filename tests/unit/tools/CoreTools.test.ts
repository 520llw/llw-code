/**
 * Tool Implementations Tests
 * 
 * Tests for core tool implementations
 */

import { jest } from '@jest/globals';
import { ToolRegistry } from '../../../src/tools/ToolRegistry';
import { ContextManager } from '../../../src/core/ContextManager';
import { ToolContext, Tool, ToolResult, ToolCategory, PermissionLevel } from '../../../src/tools/Tool';
import { FileReadTool, FileReadInputSchema } from '../../../src/tools/implementations/file/FileReadTool';
import { FileEditTool, FileEditInputSchema } from '../../../src/tools/implementations/file/FileEditTool';
import { BashTool, BashInputSchema } from '../../../src/tools/implementations/execution/BashTool';
import { GitTool, GitInputSchema } from '../../../src/tools/implementations/execution/GitTool';
import { WebFetchTool, WebFetchInputSchema } from '../../../src/tools/implementations/web/WebFetchTool';

// Mock fs
jest.mock('fs/promises');

describe('Core Tools', () => {
  const mockContext: ToolContext = {
    workingDirectory: '/test',
    environment: {},
    metadata: {},
  };

  describe('FileReadTool', () => {
    let tool: FileReadTool;

    beforeEach(() => {
      tool = new FileReadTool();
      jest.clearAllMocks();
    });

    it('should have correct name', () => {
      expect(tool.name).toBe('file_read');
    });

    it('should have description', () => {
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it('should have documentation', () => {
      expect(tool.documentation.length).toBeGreaterThan(0);
    });

    it('should validate valid input', () => {
      const result = FileReadInputSchema.safeParse({
        file_path: '/test/file.txt',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty file path', () => {
      const result = FileReadInputSchema.safeParse({
        file_path: '',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid encodings', () => {
      const encodings = ['utf8', 'utf-8', 'ascii', 'base64', 'hex', 'latin1'];
      encodings.forEach(encoding => {
        const result = FileReadInputSchema.safeParse({
          file_path: '/test/file.txt',
          encoding: encoding as any,
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('FileEditTool', () => {
    let tool: FileEditTool;

    beforeEach(() => {
      tool = new FileEditTool();
    });

    it('should have correct name', () => {
      expect(tool.name).toBe('file_edit');
    });

    it('should have description', () => {
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it('should validate valid input', () => {
      const result = FileEditInputSchema.safeParse({
        file_path: '/test/file.txt',
        old_string: 'old',
        new_string: 'new',
      });
      expect(result.success).toBe(true);
    });

    it('should require old_string', () => {
      const result = FileEditInputSchema.safeParse({
        file_path: '/test/file.txt',
        new_string: 'new',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('BashTool', () => {
    let tool: BashTool;

    beforeEach(() => {
      tool = new BashTool();
    });

    it('should have correct name', () => {
      expect(tool.name).toBe('bash');
    });

    it('should have description', () => {
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it('should validate valid command', () => {
      const result = BashInputSchema.safeParse({
        command: 'ls -la',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty command', () => {
      const result = BashInputSchema.safeParse({
        command: '',
      });
      expect(result.success).toBe(false);
    });

    it('should accept timeout option', () => {
      const result = BashInputSchema.safeParse({
        command: 'sleep 1',
        timeout: 5000,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('GitTool', () => {
    let tool: GitTool;

    beforeEach(() => {
      tool = new GitTool();
    });

    it('should have correct name', () => {
      expect(tool.name).toBe('git');
    });

    it('should have description', () => {
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it('should validate valid command', () => {
      const result = GitInputSchema.safeParse({
        command: 'status',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid command', () => {
      const result = GitInputSchema.safeParse({
        command: 'invalid' as any,
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid git commands', () => {
      const commands = ['status', 'diff', 'log', 'add', 'commit', 'push', 'pull'];
      commands.forEach(cmd => {
        const result = GitInputSchema.safeParse({ command: cmd });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('WebFetchTool', () => {
    let tool: WebFetchTool;

    beforeEach(() => {
      tool = new WebFetchTool();
    });

    it('should have correct name', () => {
      expect(tool.name).toBe('web_fetch');
    });

    it('should have description', () => {
      expect(tool.description.length).toBeGreaterThan(0);
    });

    it('should validate valid URL', () => {
      const result = WebFetchInputSchema.safeParse({
        url: 'https://example.com',
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL', () => {
      const result = WebFetchInputSchema.safeParse({
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });

    it('should accept HTTP methods', () => {
      const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
      methods.forEach(method => {
        const result = WebFetchInputSchema.safeParse({
          url: 'https://example.com',
          method: method as any,
        });
        expect(result.success).toBe(true);
      });
    });
  });
});
