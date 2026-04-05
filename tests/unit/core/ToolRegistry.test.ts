/**
 * ToolRegistry Tests - Corrected
 * 
 * Tests for ToolRegistry matching actual API
 */

import { jest } from '@jest/globals';
import { ToolRegistry } from '../../../src/tools/ToolRegistry';
import { Tool, ToolContext, ToolResult, ToolCategory, PermissionLevel, ToolConfig } from '../../../src/tools/Tool';

// Mock tool class
class MockTool extends Tool {
  public readonly name = 'mock_tool';
  public readonly description = 'A mock tool';
  public readonly category = ToolCategory.FILE;
  public readonly permissionLevel = PermissionLevel.READ;
  public readonly inputSchema = {
    safeParse: (data: any) => ({ success: true, data }),
  } as any;

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    return { toolName: this.name, status: 'success', output: { result: 'mock' } };
  }
}

class ErrorTool extends Tool {
  public readonly name = 'error_tool';
  public readonly description = 'An error tool';
  public readonly category = ToolCategory.FILE;
  public readonly permissionLevel = PermissionLevel.READ;
  public readonly inputSchema = {
    safeParse: (data: any) => ({ success: true, data }),
  } as any;

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    throw new Error('Tool execution failed');
  }
}

describe('ToolRegistry', () => {
  let registry: ToolRegistry;
  let mockContext: ToolContext;

  beforeEach(() => {
    registry = new ToolRegistry();
    mockContext = {
      workingDirectory: '/test',
      environment: {},
      metadata: {},
    };
  });

  describe('Registration', () => {
    it('should register a tool', () => {
      const tool = new MockTool();
      const result = registry.register(tool);
      expect(result).toBe(true);
    });

    it('should throw on duplicate registration', () => {
      registry.register(new MockTool());
      expect(() => registry.register(new MockTool())).toThrow();
    });

    it('should unregister a tool', () => {
      registry.register(new MockTool());
      const result = registry.unregister('mock_tool');
      expect(result).toBe(true);
    });

    it('should get all tools', () => {
      registry.register(new MockTool());
      const tools = registry.getTools();
      expect(tools.length).toBe(1);
    });

    it('should get tools by category', () => {
      registry.register(new MockTool());
      const tools = registry.getToolsByCategory(ToolCategory.FILE);
      expect(tools.length).toBe(1);
    });

    it('should get tool by name', () => {
      registry.register(new MockTool());
      const tool = registry.getTool('mock_tool');
      expect(tool).toBeDefined();
    });

    it('should check if tool exists', () => {
      registry.register(new MockTool());
      expect(registry.hasTool('mock_tool')).toBe(true);
      expect(registry.hasTool('unknown')).toBe(false);
    });
  });

  describe('Execution', () => {
    it('should execute registered tool', async () => {
      registry.register(new MockTool());
      const result = await registry.executeTool('mock_tool', {}, mockContext);
      expect(result.status).toBe('success');
    });

    it('should return error for unknown tool', async () => {
      const result = await registry.executeTool('unknown', {}, mockContext);
      expect(result.status).toBe('error');
    });

    it('should handle execution errors', async () => {
      registry.register(new ErrorTool());
      const result = await registry.executeTool('error_tool', {}, mockContext);
      expect(result.status).toBe('error');
    });
  });

  describe('Tool Info', () => {
    it('should get tool info', () => {
      registry.register(new MockTool());
      const info = registry.getToolInfo('mock_tool');
      expect(info).toBeDefined();
    });

    it('should get all tool names', () => {
      registry.register(new MockTool());
      const names = registry.getToolNames();
      expect(names).toContain('mock_tool');
    });
  });

  describe('Statistics', () => {
    it('should return statistics', () => {
      registry.register(new MockTool());
      const stats = registry.getStatistics();
      expect(stats.totalTools).toBe(1);
    });
  });
});
