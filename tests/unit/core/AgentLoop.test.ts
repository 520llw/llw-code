/**
 * AgentLoop Tests - Corrected
 * 
 * Tests for AgentLoop matching actual API
 */

import { jest } from '@jest/globals';
import { AgentLoop } from '../../../src/core/AgentLoop';
import { ContextManager } from '../../../src/core/ContextManager';
import { Tool, ToolContext, ToolResult, ToolCategory, PermissionLevel } from '../../../src/tools/Tool';
import { LLMProvider } from '../../../src/types/index.js';

// Mock LLM Provider
const mockLLMProvider: LLMProvider = {
  sendMessage: jest.fn(),
  streamMessage: jest.fn(),
  getModel: () => 'mock-model',
};

// Mock Tool
class MockTool extends Tool {
  public readonly name = 'mock_tool';
  public readonly description = 'A mock tool';
  public readonly category = ToolCategory.FILE;
  public readonly permissionLevel = PermissionLevel.READ;
  public readonly inputSchema = { safeParse: (d: any) => ({ success: true, data: d }) } as any;

  async execute(input: any, context: ToolContext): Promise<ToolResult> {
    return { toolName: this.name, status: 'success', output: { result: 'mock' } };
  }
}

describe('AgentLoop', () => {
  let agent: AgentLoop;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with valid config', () => {
      agent = new AgentLoop({
        sessionId: 'test-session',
        llm: mockLLMProvider,
        tools: [new MockTool()],
      });
      expect(agent).toBeInstanceOf(AgentLoop);
    });

    it('should require sessionId', () => {
      expect(() => new AgentLoop({
        llm: mockLLMProvider,
        tools: [new MockTool()],
      } as any)).toThrow();
    });

    it('should require tools array', () => {
      expect(() => new AgentLoop({
        sessionId: 'test-session',
        llm: mockLLMProvider,
      } as any)).toThrow();
    });
  });

  describe('Message Processing', () => {
    beforeEach(() => {
      (mockLLMProvider.sendMessage as jest.Mock).mockResolvedValue({
        content: 'Hello!',
        toolCalls: [],
      });

      agent = new AgentLoop({
        sessionId: 'test-session',
        llm: mockLLMProvider,
        tools: [new MockTool()],
      });
    });

    it('should process user message', async () => {
      const result = await agent.processMessage('Hi');
      expect(result.response).toBeDefined();
    });

    it('should track iterations', async () => {
      const result = await agent.processMessage('Hi');
      expect(result.iterations).toBeGreaterThanOrEqual(1);
    });
  });

  describe('State Management', () => {
    beforeEach(() => {
      agent = new AgentLoop({
        sessionId: 'test-session',
        llm: mockLLMProvider,
        tools: [new MockTool()],
      });
    });

    it('should return current state', () => {
      const state = agent.getState();
      expect(state).toBeDefined();
    });

    it('should return session', () => {
      const session = agent.getSession();
      expect(session).toBeDefined();
    });
  });
});
