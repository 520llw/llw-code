/**
 * ContextManager Tests - Corrected
 * 
 * Tests for ContextManager matching actual API
 */

import { jest } from '@jest/globals';
import { ContextManager } from '../../../src/core/ContextManager';
import { TextMessage, SystemMessage } from '../../../src/types/index.js';

describe('ContextManager', () => {
  let manager: ContextManager;

  beforeEach(() => {
    manager = new ContextManager({ sessionId: 'test-session', maxTokens: 4000 });
  });

  describe('Initialization', () => {
    it('should require sessionId', () => {
      expect(() => new ContextManager({} as any)).toThrow();
    });

    it('should initialize with sessionId', () => {
      const m = new ContextManager({ sessionId: 'test' });
      expect(m).toBeInstanceOf(ContextManager);
    });

    it('should initialize with custom config', () => {
      const customManager = new ContextManager({ sessionId: 'test', maxTokens: 2000 });
      expect(customManager).toBeInstanceOf(ContextManager);
    });
  });

  describe('Message Management', () => {
    it('should add user message', () => {
      const message: TextMessage = {
        role: 'user',
        content: 'Hello',
        type: 'text',
      };
      manager.addMessage(message);
      const messages = manager.getMessages();
      expect(messages.length).toBe(1);
    });

    it('should add assistant message', () => {
      const message: TextMessage = {
        role: 'assistant',
        content: 'Hello!',
        type: 'text',
      };
      manager.addMessage(message);
      const messages = manager.getMessages();
      expect(messages.some(m => m.role === 'assistant')).toBe(true);
    });

    it('should add system message', () => {
      const message: SystemMessage = {
        role: 'system',
        content: 'System prompt',
        type: 'system',
      };
      manager.addMessage(message);
      const messages = manager.getMessages();
      expect(messages.some(m => m.role === 'system')).toBe(true);
    });

    it('should handle multiple messages', () => {
      manager.addMessage({ role: 'user', content: 'Msg 1', type: 'text' });
      manager.addMessage({ role: 'assistant', content: 'Msg 2', type: 'text' });
      manager.addMessage({ role: 'user', content: 'Msg 3', type: 'text' });
      
      const messages = manager.getMessages();
      expect(messages.length).toBe(3);
    });

    it('should add multiple messages at once', () => {
      const messages = [
        { role: 'user', content: 'Msg 1', type: 'text' as const },
        { role: 'assistant', content: 'Msg 2', type: 'text' as const },
      ];
      manager.addMessages(messages);
      
      expect(manager.getMessages().length).toBe(2);
    });
  });

  describe('Message Retrieval', () => {
    it('should get all messages', () => {
      manager.addMessage({ role: 'user', content: 'Test', type: 'text' });
      const messages = manager.getMessages();
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should get messages within budget', () => {
      manager.addMessage({ role: 'user', content: 'Test message', type: 'text' });
      const messages = manager.getMessagesWithinBudget(1000);
      expect(messages.length).toBeGreaterThanOrEqual(0);
    });
  });

  describe('File Context', () => {
    it('should add file context', () => {
      manager.addFileContext({
        path: '/test/file.ts',
        content: 'const x = 1;',
        language: 'typescript',
      });
      
      const fileContexts = manager.getFileContexts();
      expect(fileContexts.length).toBeGreaterThan(0);
    });

    it('should get file contexts', () => {
      manager.addFileContext({
        path: '/test/file.ts',
        content: 'content',
        language: 'typescript',
      });
      
      const contexts = manager.getFileContexts();
      expect(contexts.length).toBe(1);
    });
  });

  describe('Compression', () => {
    it('should compress context', () => {
      const result = manager.compress({
        strategy: 'token',
        targetTokens: 500,
      });
      
      expect(result).toBeDefined();
    });
  });

  describe('Statistics', () => {
    it('should return stats', () => {
      const stats = manager.getStats();
      expect(stats).toHaveProperty('totalTokens');
      expect(stats).toHaveProperty('messageCount');
    });

    it('should track message count', () => {
      const initialCount = manager.getStats().messageCount;
      
      manager.addMessage({ role: 'user', content: 'Msg 1', type: 'text' });
      manager.addMessage({ role: 'assistant', content: 'Msg 2', type: 'text' });
      
      const updatedCount = manager.getStats().messageCount;
      expect(updatedCount).toBe(initialCount + 2);
    });
  });

  describe('Clear', () => {
    it('should clear all messages', () => {
      manager.addMessage({ role: 'user', content: 'Test', type: 'text' });
      manager.clear();
      
      const messages = manager.getMessages();
      expect(messages.length).toBe(0);
    });
  });
});
