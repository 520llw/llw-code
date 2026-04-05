/**
 * @fileoverview MultiFileEditTool Unit Tests
 * 
 * Tests for the MultiFileEditTool covering:
 * - All operation types (edit, create, delete, rename)
 * - Atomic execution and rollback
 * - Conflict detection
 * - Preview mode
 * - Error handling
 * 
 * @module MultiFileEditTool.test
 * @version 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import { MultiFileEditTool, MultiFileEditInputSchema } from '../../../src/tools/implementations/file/MultiFileEditTool';
import { ToolContext, ToolExecutionStatus } from '../../../src/tools/Tool';

// ============================================================================
// Test Setup
// ============================================================================

describe('MultiFileEditTool', () => {
  let tool: MultiFileEditTool;
  let context: ToolContext;
  let testDir: string;

  beforeEach(async () => {
    tool = new MultiFileEditTool();
    testDir = path.join(process.cwd(), 'test-temp', `multi-file-test-${Date.now()}`);
    
    // Create test directory
    await fs.mkdir(testDir, { recursive: true });
    
    context = {
      sessionId: 'test-session',
      userId: 'test-user',
      workingDirectory: testDir,
      environment: {},
      projectRoot: testDir,
    };
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ============================================================================
  // Schema Validation Tests
  // ============================================================================

  describe('Input Schema Validation', () => {
    it('should validate valid input with single operation', () => {
      const input = {
        operations: [
          { type: 'create', file_path: 'test.txt', content: 'hello' },
        ],
      };

      const result = MultiFileEditInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should validate valid input with multiple operations', () => {
      const input = {
        operations: [
          { type: 'create', file_path: 'a.txt', content: 'A' },
          { type: 'create', file_path: 'b.txt', content: 'B' },
          { type: 'edit', file_path: 'a.txt', old_string: 'A', new_string: 'AA' },
        ],
      };

      const result = MultiFileEditInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty operations array', () => {
      const input = {
        operations: [],
      };

      const result = MultiFileEditInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject more than 100 operations', () => {
      const input = {
        operations: Array.from({ length: 101 }, (_, i) => ({
          type: 'create',
          file_path: `file${i}.txt`,
          content: `content${i}`,
        })),
      };

      const result = MultiFileEditInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should validate all operation types', () => {
      const input = {
        operations: [
          { type: 'create', file_path: 'new.txt', content: 'content' },
          { type: 'edit', file_path: 'existing.txt', old_string: 'old', new_string: 'new' },
          { type: 'delete', file_path: 'delete.txt' },
          { type: 'rename', source_path: 'old.txt', target_path: 'new.txt' },
        ],
      };

      const result = MultiFileEditInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // Create Operation Tests
  // ============================================================================

  describe('Create Operation', () => {
    it('should create a single file successfully', async () => {
      const input = {
        operations: [
          { type: 'create', file_path: 'new.txt', content: 'Hello, World!' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.status).toBe(ToolExecutionStatus.SUCCESS);
      
      // Verify file was created
      const filePath = path.join(testDir, 'new.txt');
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('Hello, World!');
    });

    it('should create multiple files atomically', async () => {
      const input = {
        operations: [
          { type: 'create', file_path: 'a.txt', content: 'File A' },
          { type: 'create', file_path: 'b.txt', content: 'File B' },
          { type: 'create', file_path: 'c.txt', content: 'File C' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      // Verify all files were created
      const files = ['a.txt', 'b.txt', 'c.txt'];
      for (const file of files) {
        const filePath = path.join(testDir, file);
        const exists = await fs.access(filePath).then(() => true).catch(() => false);
        expect(exists).toBe(true);
      }
    });

    it('should create parent directories automatically', async () => {
      const input = {
        operations: [
          { type: 'create', file_path: 'deep/nested/file.txt', content: 'nested content' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const filePath = path.join(testDir, 'deep/nested/file.txt');
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('nested content');
    });

    it('should reject creating file that already exists without overwrite', async () => {
      // Pre-create the file
      const existingPath = path.join(testDir, 'existing.txt');
      await fs.writeFile(existingPath, 'original content', 'utf8');

      const input = {
        operations: [
          { type: 'create', file_path: 'existing.txt', content: 'new content' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
      
      // Verify original content is preserved
      const content = await fs.readFile(existingPath, 'utf8');
      expect(content).toBe('original content');
    });

    it('should overwrite existing file with overwrite flag', async () => {
      // Pre-create the file
      const existingPath = path.join(testDir, 'existing.txt');
      await fs.writeFile(existingPath, 'original content', 'utf8');

      const input = {
        operations: [
          { type: 'create', file_path: 'existing.txt', content: 'new content', overwrite: true },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      // Verify content was overwritten
      const content = await fs.readFile(existingPath, 'utf8');
      expect(content).toBe('new content');
    });
  });

  // ============================================================================
  // Edit Operation Tests
  // ============================================================================

  describe('Edit Operation', () => {
    beforeEach(async () => {
      // Create test files for editing
      await fs.writeFile(path.join(testDir, 'edit.txt'), 'Hello, World!', 'utf8');
      await fs.writeFile(path.join(testDir, 'multi.txt'), 'foo bar foo bar', 'utf8');
    });

    it('should edit a single file successfully', async () => {
      const input = {
        operations: [
          { type: 'edit', file_path: 'edit.txt', old_string: 'Hello', new_string: 'Hi' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const filePath = path.join(testDir, 'edit.txt');
      const content = await fs.readFile(filePath, 'utf8');
      expect(content).toBe('Hi, World!');
    });

    it('should edit multiple files atomically', async () => {
      await fs.writeFile(path.join(testDir, 'a.txt'), 'AAA', 'utf8');
      await fs.writeFile(path.join(testDir, 'b.txt'), 'BBB', 'utf8');

      const input = {
        operations: [
          { type: 'edit', file_path: 'a.txt', old_string: 'AAA', new_string: 'XXX' },
          { type: 'edit', file_path: 'b.txt', old_string: 'BBB', new_string: 'YYY' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const contentA = await fs.readFile(path.join(testDir, 'a.txt'), 'utf8');
      const contentB = await fs.readFile(path.join(testDir, 'b.txt'), 'utf8');
      expect(contentA).toBe('XXX');
      expect(contentB).toBe('YYY');
    });

    it('should replace all occurrences with replace_all flag', async () => {
      const input = {
        operations: [
          { type: 'edit', file_path: 'multi.txt', old_string: 'foo', new_string: 'baz', replace_all: true },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const content = await fs.readFile(path.join(testDir, 'multi.txt'), 'utf8');
      expect(content).toBe('baz bar baz bar');
    });

    it('should fail when string not found', async () => {
      const input = {
        operations: [
          { type: 'edit', file_path: 'edit.txt', old_string: 'NOT_FOUND', new_string: 'replacement' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
    });

    it('should fail on multiple matches without replace_all', async () => {
      const input = {
        operations: [
          { type: 'edit', file_path: 'multi.txt', old_string: 'foo', new_string: 'baz' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
    });

    it('should fail when file does not exist', async () => {
      const input = {
        operations: [
          { type: 'edit', file_path: 'nonexistent.txt', old_string: 'old', new_string: 'new' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // Delete Operation Tests
  // ============================================================================

  describe('Delete Operation', () => {
    beforeEach(async () => {
      await fs.writeFile(path.join(testDir, 'delete.txt'), 'delete me', 'utf8');
      await fs.writeFile(path.join(testDir, 'keep.txt'), 'keep me', 'utf8');
    });

    it('should delete a file successfully', async () => {
      const input = {
        operations: [
          { type: 'delete', file_path: 'delete.txt' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const filePath = path.join(testDir, 'delete.txt');
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should delete multiple files atomically', async () => {
      await fs.writeFile(path.join(testDir, 'a.txt'), 'A', 'utf8');
      await fs.writeFile(path.join(testDir, 'b.txt'), 'B', 'utf8');

      const input = {
        operations: [
          { type: 'delete', file_path: 'a.txt' },
          { type: 'delete', file_path: 'b.txt' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const existsA = await fs.access(path.join(testDir, 'a.txt')).then(() => true).catch(() => false);
      const existsB = await fs.access(path.join(testDir, 'b.txt')).then(() => true).catch(() => false);
      expect(existsA).toBe(false);
      expect(existsB).toBe(false);
    });

    it('should fail when file does not exist', async () => {
      const input = {
        operations: [
          { type: 'delete', file_path: 'nonexistent.txt' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // Rename Operation Tests
  // ============================================================================

  describe('Rename Operation', () => {
    beforeEach(async () => {
      await fs.writeFile(path.join(testDir, 'old.txt'), 'original content', 'utf8');
    });

    it('should rename a file successfully', async () => {
      const input = {
        operations: [
          { type: 'rename', source_path: 'old.txt', target_path: 'new.txt' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const oldPath = path.join(testDir, 'old.txt');
      const newPath = path.join(testDir, 'new.txt');
      
      const oldExists = await fs.access(oldPath).then(() => true).catch(() => false);
      const newExists = await fs.access(newPath).then(() => true).catch(() => false);
      
      expect(oldExists).toBe(false);
      expect(newExists).toBe(true);
      
      const content = await fs.readFile(newPath, 'utf8');
      expect(content).toBe('original content');
    });

    it('should move a file to different directory', async () => {
      await fs.mkdir(path.join(testDir, 'subdir'), { recursive: true });

      const input = {
        operations: [
          { type: 'rename', source_path: 'old.txt', target_path: 'subdir/moved.txt' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const oldPath = path.join(testDir, 'old.txt');
      const newPath = path.join(testDir, 'subdir/moved.txt');
      
      const oldExists = await fs.access(oldPath).then(() => true).catch(() => false);
      const newExists = await fs.access(newPath).then(() => true).catch(() => false);
      
      expect(oldExists).toBe(false);
      expect(newExists).toBe(true);
    });

    it('should create parent directories when renaming', async () => {
      const input = {
        operations: [
          { type: 'rename', source_path: 'old.txt', target_path: 'deep/nested/new.txt' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const newPath = path.join(testDir, 'deep/nested/new.txt');
      const exists = await fs.access(newPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should reject renaming when target exists without overwrite', async () => {
      await fs.writeFile(path.join(testDir, 'existing.txt'), 'existing content', 'utf8');

      const input = {
        operations: [
          { type: 'rename', source_path: 'old.txt', target_path: 'existing.txt' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
    });

    it('should overwrite target with overwrite flag', async () => {
      await fs.writeFile(path.join(testDir, 'existing.txt'), 'existing content', 'utf8');

      const input = {
        operations: [
          { type: 'rename', source_path: 'old.txt', target_path: 'existing.txt', overwrite: true },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const content = await fs.readFile(path.join(testDir, 'existing.txt'), 'utf8');
      expect(content).toBe('original content');
    });

    it('should fail when source does not exist', async () => {
      const input = {
        operations: [
          { type: 'rename', source_path: 'nonexistent.txt', target_path: 'new.txt' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
    });
  });

  // ============================================================================
  // Atomic Execution & Rollback Tests
  // ============================================================================

  describe('Atomic Execution & Rollback', () => {
    it('should rollback all changes when one operation fails', async () => {
      // Setup: create initial files
      await fs.writeFile(path.join(testDir, 'a.txt'), 'AAA', 'utf8');
      await fs.writeFile(path.join(testDir, 'b.txt'), 'BBB', 'utf8');

      const input = {
        operations: [
          { type: 'edit', file_path: 'a.txt', old_string: 'AAA', new_string: 'CHANGED_A' },
          { type: 'edit', file_path: 'b.txt', old_string: 'NOT_FOUND', new_string: 'CHANGED_B' }, // Will fail
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
      expect(result.data).toBeDefined();
      expect((result.data as { rolled_back: boolean }).rolled_back).toBe(true);
      
      // Verify rollback occurred
      const contentA = await fs.readFile(path.join(testDir, 'a.txt'), 'utf8');
      expect(contentA).toBe('AAA'); // Should be rolled back
    });

    it('should rollback created files on failure', async () => {
      await fs.writeFile(path.join(testDir, 'existing.txt'), 'content', 'utf8');

      const input = {
        operations: [
          { type: 'create', file_path: 'new.txt', content: 'new content' },
          { type: 'edit', file_path: 'existing.txt', old_string: 'NOT_FOUND', new_string: 'changed' }, // Will fail
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
      
      // Verify created file was removed
      const newFileExists = await fs.access(path.join(testDir, 'new.txt')).then(() => true).catch(() => false);
      expect(newFileExists).toBe(false);
    });

    it('should rollback deleted files on failure', async () => {
      await fs.writeFile(path.join(testDir, 'to-delete.txt'), 'deleteme', 'utf8');
      await fs.writeFile(path.join(testDir, 'to-edit.txt'), 'content', 'utf8');

      const input = {
        operations: [
          { type: 'delete', file_path: 'to-delete.txt' },
          { type: 'edit', file_path: 'to-edit.txt', old_string: 'NOT_FOUND', new_string: 'changed' }, // Will fail
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
      
      // Verify deleted file was restored
      const content = await fs.readFile(path.join(testDir, 'to-delete.txt'), 'utf8');
      expect(content).toBe('deleteme');
    });

    it('should rollback renamed files on failure', async () => {
      await fs.writeFile(path.join(testDir, 'to-rename.txt'), 'content', 'utf8');
      await fs.writeFile(path.join(testDir, 'to-edit.txt'), 'editme', 'utf8');

      const input = {
        operations: [
          { type: 'rename', source_path: 'to-rename.txt', target_path: 'renamed.txt' },
          { type: 'edit', file_path: 'to-edit.txt', old_string: 'NOT_FOUND', new_string: 'changed' }, // Will fail
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
      
      // Verify renamed file was restored
      const oldExists = await fs.access(path.join(testDir, 'to-rename.txt')).then(() => true).catch(() => false);
      const newExists = await fs.access(path.join(testDir, 'renamed.txt')).then(() => true).catch(() => false);
      expect(oldExists).toBe(true);
      expect(newExists).toBe(false);
    });
  });

  // ============================================================================
  // Conflict Detection Tests
  // ============================================================================

  describe('Conflict Detection', () => {
    it('should detect multiple operations targeting same file', async () => {
      // Create the file first
      await fs.writeFile(path.join(testDir, 'file.txt'), 'ABC', 'utf8');
      
      const input = {
        operations: [
          { type: 'edit', file_path: 'file.txt', old_string: 'A', new_string: 'B' },
          { type: 'edit', file_path: 'file.txt', old_string: 'B', new_string: 'C' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CONFLICT_DETECTED');
    });

    it('should allow operations on different files', async () => {
      await fs.writeFile(path.join(testDir, 'a.txt'), 'AAA', 'utf8');
      await fs.writeFile(path.join(testDir, 'b.txt'), 'BBB', 'utf8');

      const input = {
        operations: [
          { type: 'edit', file_path: 'a.txt', old_string: 'AAA', new_string: 'XXX' },
          { type: 'edit', file_path: 'b.txt', old_string: 'BBB', new_string: 'YYY' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
    });

    it('should skip conflict detection when skip_conflict_check is true', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'ABC', 'utf8');

      const input = {
        operations: [
          { type: 'edit', file_path: 'file.txt', old_string: 'ABC', new_string: 'BCD' },
          { type: 'edit', file_path: 'file.txt', old_string: 'BCD', new_string: 'CDE' },
        ],
        skip_conflict_check: true,
      };

      const result = await tool.execute(input, context);

      // This might succeed or fail depending on order, but shouldn't fail due to conflict detection
      expect(result.error?.code).not.toBe('CONFLICT_DETECTED');
    });
  });

  // ============================================================================
  // Preview Mode Tests
  // ============================================================================

  describe('Preview Mode', () => {
    it('should preview changes without applying them', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'original', 'utf8');

      const input = {
        operations: [
          { type: 'edit', file_path: 'file.txt', old_string: 'original', new_string: 'changed' },
        ],
        preview_only: true,
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      // Verify file was not changed
      const content = await fs.readFile(path.join(testDir, 'file.txt'), 'utf8');
      expect(content).toBe('original');
      
      // Verify preview is in output
      expect(result.data).toBeDefined();
      expect((result.data as { preview: unknown[] }).preview).toBeDefined();
    });

    it('should show validation errors in preview', async () => {
      const input = {
        operations: [
          { type: 'edit', file_path: 'nonexistent.txt', old_string: 'old', new_string: 'new' },
        ],
        preview_only: true,
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect((result.data as { preview: Array<{ status: string }> }).preview[0].status).toBe('error');
    });
  });

  // ============================================================================
  // Backup Tests
  // ============================================================================

  describe('Backup Creation', () => {
    it('should create backups of modified files', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'original content', 'utf8');

      const input = {
        operations: [
          { type: 'edit', file_path: 'file.txt', old_string: 'original', new_string: 'modified' },
        ],
        create_backups: true,
        backup_suffix: '.bak',
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      // Verify backup was created
      const backupPath = path.join(testDir, 'file.txt.bak');
      const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(true);
      
      const backupContent = await fs.readFile(backupPath, 'utf8');
      expect(backupContent).toBe('original content');
    });

    it('should not create backups when create_backups is false', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'original content', 'utf8');

      const input = {
        operations: [
          { type: 'edit', file_path: 'file.txt', old_string: 'original', new_string: 'modified' },
        ],
        create_backups: false,
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      // Verify no backup was created
      const backupPath = path.join(testDir, 'file.txt.backup');
      const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(false);
    });

    it('should clean up backups after successful rollback', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'original content', 'utf8');

      const input = {
        operations: [
          { type: 'edit', file_path: 'file.txt', old_string: 'original', new_string: 'modified' },
          { type: 'edit', file_path: 'nonexistent.txt', old_string: 'old', new_string: 'new' }, // Will fail
        ],
      };

      await tool.execute(input, context);
      
      // Backup should be cleaned up after rollback
      const backupPath = path.join(testDir, 'file.txt.backup');
      const backupExists = await fs.access(backupPath).then(() => true).catch(() => false);
      expect(backupExists).toBe(false);
    });
  });

  // ============================================================================
  // Diff Generation Tests
  // ============================================================================

  describe('Diff Generation', () => {
    it('should generate diff for edit operations', async () => {
      await fs.writeFile(path.join(testDir, 'file.txt'), 'Hello, World!', 'utf8');

      const input = {
        operations: [
          { type: 'edit', file_path: 'file.txt', old_string: 'Hello', new_string: 'Hi' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect((result.data as { diff?: string }).diff).toBeDefined();
      expect((result.data as { diff: string }).diff).toContain('Hello');
      expect((result.data as { diff: string }).diff).toContain('Hi');
    });

    it('should generate diff for create operations', async () => {
      const input = {
        operations: [
          { type: 'create', file_path: 'new.txt', content: 'new content' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect((result.data as { diff?: string }).diff).toBeDefined();
    });

    it('should generate diff for delete operations', async () => {
      await fs.writeFile(path.join(testDir, 'delete.txt'), 'delete me', 'utf8');

      const input = {
        operations: [
          { type: 'delete', file_path: 'delete.txt' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect((result.data as { diff?: string }).diff).toBeDefined();
    });

    it('should generate diff for rename operations', async () => {
      await fs.writeFile(path.join(testDir, 'old.txt'), 'content', 'utf8');

      const input = {
        operations: [
          { type: 'rename', source_path: 'old.txt', target_path: 'new.txt' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect((result.data as { diff?: string }).diff).toBeDefined();
    });

    it('should not generate diff on failure', async () => {
      const input = {
        operations: [
          { type: 'edit', file_path: 'nonexistent.txt', old_string: 'old', new_string: 'new' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
      expect((result.data as { diff?: string }).diff).toBeUndefined();
    });
  });

  // ============================================================================
  // Mixed Operations Tests
  // ============================================================================

  describe('Mixed Operations', () => {
    it('should handle create, edit, rename, and delete in one transaction', async () => {
      // Setup
      await fs.writeFile(path.join(testDir, 'original.txt'), 'original content', 'utf8');
      await fs.writeFile(path.join(testDir, 'to-delete.txt'), 'delete me', 'utf8');

      const input = {
        operations: [
          { type: 'create', file_path: 'new.txt', content: 'new content' },
          { type: 'edit', file_path: 'original.txt', old_string: 'original', new_string: 'modified' },
          { type: 'rename', source_path: 'modified.txt', target_path: 'renamed.txt' }, // This will use the file from edit
          { type: 'delete', file_path: 'to-delete.txt' },
        ],
      };

      // Note: This will fail because we can't rename 'modified.txt' (it doesn't exist)
      // The file is still named 'original.txt'
      const result = await tool.execute(input, context);

      // Since the rename operation refers to the wrong file name, it should fail
      expect(result.success).toBe(false);
    });

    it('should handle valid sequence of mixed operations', async () => {
      // Setup
      await fs.writeFile(path.join(testDir, 'step1.txt'), 'step 1 content', 'utf8');
      await fs.writeFile(path.join(testDir, 'step2.txt'), 'step 2 content', 'utf8');

      const input = {
        operations: [
          { type: 'edit', file_path: 'step1.txt', old_string: 'step 1', new_string: 'completed step 1' },
          { type: 'edit', file_path: 'step2.txt', old_string: 'step 2', new_string: 'completed step 2' },
          { type: 'create', file_path: 'summary.txt', content: 'All steps completed' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      // Verify all changes
      const step1Content = await fs.readFile(path.join(testDir, 'step1.txt'), 'utf8');
      const step2Content = await fs.readFile(path.join(testDir, 'step2.txt'), 'utf8');
      const summaryContent = await fs.readFile(path.join(testDir, 'summary.txt'), 'utf8');
      
      expect(step1Content).toBe('completed step 1 content');
      expect(step2Content).toBe('completed step 2 content');
      expect(summaryContent).toBe('All steps completed');
    });
  });

  // ============================================================================
  // Edge Case Tests
  // ============================================================================

  describe('Edge Cases', () => {
    it('should handle empty file content', async () => {
      const input = {
        operations: [
          { type: 'create', file_path: 'empty.txt', content: '' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const content = await fs.readFile(path.join(testDir, 'empty.txt'), 'utf8');
      expect(content).toBe('');
    });

    it('should handle very long content', async () => {
      const longContent = 'A'.repeat(10000);

      const input = {
        operations: [
          { type: 'create', file_path: 'long.txt', content: longContent },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const content = await fs.readFile(path.join(testDir, 'long.txt'), 'utf8');
      expect(content).toBe(longContent);
    });

    it('should handle special characters in content', async () => {
      const specialContent = 'Special chars: 你好世界 émojis 🎉 \n\t\\"\' \u0000 \u001F';

      const input = {
        operations: [
          { type: 'create', file_path: 'special.txt', content: specialContent },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      
      const content = await fs.readFile(path.join(testDir, 'special.txt'), 'utf8');
      expect(content).toBe(specialContent);
    });

    it('should handle file paths with special characters', async () => {
      const input = {
        operations: [
          { type: 'create', file_path: 'file-with-dashes.txt', content: 'content' },
          { type: 'create', file_path: 'file_with_underscores.txt', content: 'content' },
          { type: 'create', file_path: 'file.with.dots.txt', content: 'content' },
        ],
      };

      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // Tool Metadata Tests
  // ============================================================================

  describe('Tool Metadata', () => {
    it('should have correct tool metadata', () => {
      expect(tool.name).toBe('multi_file_edit');
      expect(tool.category).toBe('file');
      expect(tool.permissionLevel).toBe('ask');
      expect(tool.tags).toContain('atomic');
      expect(tool.tags).toContain('multi');
    });

    it('should provide JSON schema', () => {
      const inputSchema = tool.getInputSchema();
      const outputSchema = tool.getOutputSchema();

      expect(inputSchema).toBeDefined();
      expect(outputSchema).toBeDefined();
      expect(inputSchema.type).toBe('object');
    });

    it('should have examples', () => {
      expect(tool.examples.length).toBeGreaterThan(0);
      expect(tool.examples[0].description).toBeDefined();
      expect(tool.examples[0].input).toBeDefined();
    });
  });
});
