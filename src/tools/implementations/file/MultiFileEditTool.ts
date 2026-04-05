/**
 * @fileoverview Multi-File Edit Tool for Claude Code Clone
 * 
 * This tool provides atomic multi-file editing capabilities with:
 - Multiple file operations in a single transaction
 - Atomic execution (all succeed or all rollback)
 - Preview mode for reviewing changes before applying
 - Conflict detection across operations
 - Unified diff generation
 - Comprehensive rollback support
 * 
 * Supported operations:
 * - edit: String replacement in existing files
 * - create: Create new files
 * - delete: Delete existing files
 * - rename: Rename/move files
 * 
 * @module MultiFileEditTool
 * @version 1.0.0
 * @author Claude Code Clone
 */

import { z } from 'zod';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Tool, ToolCategory, PermissionLevel, ToolResult, ToolContext, ToolExecutionStatus, createToolError } from '../../Tool';

// ============================================================================
// Operation Schemas
// ============================================================================

/**
 * Schema for edit operation
 */
export const EditOperationSchema = z.object({
  type: z.literal('edit'),
  file_path: z.string().min(1).max(4096),
  old_string: z.string().describe('String to find and replace'),
  new_string: z.string().describe('String to replace with'),
  replace_all: z.boolean().default(false).optional(),
}).describe('Edit operation: replace string in existing file');

export type EditOperation = z.infer<typeof EditOperationSchema>;

/**
 * Schema for create operation
 */
export const CreateOperationSchema = z.object({
  type: z.literal('create'),
  file_path: z.string().min(1).max(4096),
  content: z.string().describe('Content to write to the file'),
  overwrite: z.boolean().default(false).optional(),
  permissions: z.string().regex(/^[0-7]{3,4}$/).optional(),
}).describe('Create operation: create a new file');

export type CreateOperation = z.infer<typeof CreateOperationSchema>;

/**
 * Schema for delete operation
 */
export const DeleteOperationSchema = z.object({
  type: z.literal('delete'),
  file_path: z.string().min(1).max(4096),
}).describe('Delete operation: delete an existing file');

export type DeleteOperation = z.infer<typeof DeleteOperationSchema>;

/**
 * Schema for rename operation
 */
export const RenameOperationSchema = z.object({
  type: z.literal('rename'),
  source_path: z.string().min(1).max(4096),
  target_path: z.string().min(1).max(4096),
  overwrite: z.boolean().default(false).optional(),
}).describe('Rename operation: rename/move a file');

export type RenameOperation = z.infer<typeof RenameOperationSchema>;

/**
 * Union schema for all operation types
 */
export const FileOperationSchema = z.discriminatedUnion('type', [
  EditOperationSchema,
  CreateOperationSchema,
  DeleteOperationSchema,
  RenameOperationSchema,
]);

export type FileOperation = z.infer<typeof FileOperationSchema>;

// ============================================================================
// Input/Output Schemas
// ============================================================================

/**
 * Schema for multi-file edit tool input
 */
export const MultiFileEditInputSchema = z.object({
  /** Array of file operations to perform */
  operations: z.array(FileOperationSchema)
    .min(1, 'At least one operation is required')
    .max(100, 'Maximum 100 operations allowed')
    .describe('Array of file operations to perform atomically'),

  /** Whether to preview changes without applying them */
  preview_only: z.boolean()
    .default(false)
    .describe('Preview changes without applying them'),

  /** Whether to create backups before editing */
  create_backups: z.boolean()
    .default(true)
    .describe('Create backups before editing existing files'),

  /** Backup suffix */
  backup_suffix: z.string()
    .default('.backup')
    .describe('Suffix for backup files'),

  /** Whether to skip conflict detection */
  skip_conflict_check: z.boolean()
    .default(false)
    .describe('Skip conflict detection (not recommended)'),
}).describe('Input for multi-file atomic edit');

export type MultiFileEditInput = z.infer<typeof MultiFileEditInputSchema>;

/**
 * Schema for single operation result
 */
export const OperationResultSchema = z.object({
  /** Operation type */
  type: z.enum(['edit', 'create', 'delete', 'rename']),

  /** File path affected */
  file_path: z.string(),

  /** Whether the operation succeeded */
  success: z.boolean(),

  /** Error message if failed */
  error: z.string().optional(),

  /** Operation-specific details */
  details: z.record(z.unknown()).optional(),
});

export type OperationResult = z.infer<typeof OperationResultSchema>;

/**
 * Schema for conflict information
 */
export const ConflictSchema = z.object({
  /** Type of conflict */
  type: z.enum(['target_conflict', 'source_missing', 'concurrent_edit']),

  /** Description of the conflict */
  description: z.string(),

  /** Operations involved in the conflict */
  operations: z.array(z.number()).describe('Indices of conflicting operations'),

  /** File path involved */
  file_path: z.string(),
});

export type Conflict = z.infer<typeof ConflictSchema>;

/**
 * Schema for multi-file edit tool output
 */
export const MultiFileEditOutputSchema = z.object({
  /** Whether all operations succeeded */
  success: z.boolean(),

  /** Total number of operations */
  total_operations: z.number().int(),

  /** Number of successful operations */
  successful_operations: z.number().int(),

  /** Number of failed operations */
  failed_operations: z.number().int(),

  /** Whether the transaction was rolled back */
  rolled_back: z.boolean(),

  /** Results for each operation */
  results: z.array(OperationResultSchema),

  /** Detected conflicts */
  conflicts: z.array(ConflictSchema),

  /** Unified diff of all changes */
  diff: z.string().optional(),

  /** Paths to backup files created */
  backup_paths: z.array(z.string()),

  /** Preview of changes (if preview_only) */
  preview: z.array(z.object({
    operation: FileOperationSchema,
    status: z.enum(['success', 'error', 'conflict']),
    message: z.string(),
  })).optional(),
}).describe('Result of multi-file atomic edit');

export type MultiFileEditOutput = z.infer<typeof MultiFileEditOutputSchema>;

// ============================================================================
// Backup Entry Type
// ============================================================================

interface BackupEntry {
  filePath: string;
  backupPath: string;
  operationType: string;
  originalContent?: string;
  originalExists: boolean;
}

// ============================================================================
// Tool Implementation
// ============================================================================

/**
 * Multi-File Edit Tool - Atomic multi-file editing with rollback support
 * 
 * This tool performs multiple file operations atomically:
 * 1. Validates all operations
 * 2. Detects conflicts
 * 3. Creates backups
 * 4. Executes operations (all succeed or all rollback)
 * 5. Generates unified diff
 * 
 * @example
 * ```typescript
 * const tool = new MultiFileEditTool();
 * const result = await tool.execute({
 *   operations: [
 *     { type: 'create', file_path: 'new.ts', content: 'export const x = 1;' },
 *     { type: 'edit', file_path: 'old.ts', old_string: 'foo', new_string: 'bar' },
 *     { type: 'rename', source_path: 'a.ts', target_path: 'b.ts' },
 *     { type: 'delete', file_path: 'temp.ts' }
 *   ],
 *   preview_only: false
 * }, context);
 * ```
 */
export class MultiFileEditTool extends Tool {
  /** Tool name */
  public readonly name = 'multi_file_edit';

  /** Tool description */
  public readonly description = 'Atomically edit multiple files with conflict detection and rollback support';

  /** Detailed documentation */
  public readonly documentation = `
## Multi-File Edit Tool

Performs multiple file operations atomically with conflict detection and rollback support.

### Supported Operations

1. **edit** - Replace string in existing file
2. **create** - Create a new file
3. **delete** - Delete an existing file
4. **rename** - Rename/move a file

### Input Parameters

- **operations** (required): Array of file operations to perform
- **preview_only** (optional): Preview changes without applying (default: false)
- **create_backups** (optional): Create backups before editing (default: true)
- **backup_suffix** (optional): Backup file suffix (default: '.backup')
- **skip_conflict_check** (optional): Skip conflict detection (default: false)

### Output

Returns comprehensive results:
- success: Whether all operations succeeded
- total_operations: Total number of operations
- successful_operations: Number of successful operations
- failed_operations: Number of failed operations
- rolled_back: Whether the transaction was rolled back
- results: Detailed results for each operation
- conflicts: Detected conflicts
- diff: Unified diff of all changes
- backup_paths: Paths to backup files

### Examples

Basic multi-file edit:
\`\`\`json
{
  "operations": [
    { "type": "create", "file_path": "config.ts", "content": "export const API_URL = 'https://api.example.com';" },
    { "type": "edit", "file_path": "main.ts", "old_string": "import { foo } from './old';", "new_string": "import { foo } from './new';" },
    { "type": "rename", "source_path": "old.ts", "target_path": "new.ts" },
    { "type": "delete", "file_path": "temp.ts" }
  ]
}
\`\`\`

Preview changes:
\`\`\`json
{
  "operations": [...],
  "preview_only": true
}
\`\`\`

### Error Handling

- Validation errors: Returns VALIDATION_ERROR with details
- Conflict detected: Returns CONFLICT_ERROR before execution
- Execution failure: Automatically rolls back all changes
- Permission denied: Returns PERMISSION_DENIED error

### Safety Features

1. **Atomic Execution**: All operations succeed or all rollback
2. **Conflict Detection**: Detects conflicting operations before execution
3. **Automatic Backups**: Creates backups of modified files
4. **Preview Mode**: Review changes before applying
5. **Rollback on Error**: Restores original state on any failure
  `;

  /** Tool category */
  public readonly category = ToolCategory.FILE;

  /** Permission level - ask for multi-file edit operations */
  public readonly permissionLevel = PermissionLevel.ASK;

  /** Input schema */
  public readonly inputSchema = MultiFileEditInputSchema;

  /** Output schema */
  public readonly outputSchema = MultiFileEditOutputSchema;

  /** Tool tags */
  public readonly tags = ['file', 'edit', 'multi', 'atomic', 'transaction', 'batch'];

  /** Examples of tool usage */
  public readonly examples = [
    {
      description: 'Create, edit, rename, and delete files atomically',
      input: {
        operations: [
          { type: 'create', file_path: 'new.ts', content: 'export const x = 1;' },
          { type: 'edit', file_path: 'old.ts', old_string: 'foo', new_string: 'bar' },
          { type: 'rename', source_path: 'a.ts', target_path: 'b.ts' },
          { type: 'delete', file_path: 'temp.ts' },
        ],
      },
    },
    {
      description: 'Preview changes without applying',
      input: {
        operations: [
          { type: 'edit', file_path: 'main.ts', old_string: 'old', new_string: 'new' },
        ],
        preview_only: true,
      },
    },
  ];

  // Store for rollback
  private backupEntries: BackupEntry[] = [];

  /**
   * Execute the multi-file edit operation
   * @param input - Validated input
   * @param context - Execution context
   * @returns Tool result
   */
  protected async executeImpl(
    input: unknown,
    context: ToolContext
  ): Promise<ToolResult> {
    const startedAt = new Date();
    const params = input as MultiFileEditInput;

    try {
      // Reset backup entries
      this.backupEntries = [];

      // Step 1: Preview mode (bypass validation)
      if (params.preview_only) {
        const preview = await this.generatePreview(params.operations, context);
        const output: MultiFileEditOutput = {
          success: true,
          total_operations: params.operations.length,
          successful_operations: 0,
          failed_operations: 0,
          rolled_back: false,
          results: [],
          conflicts: [],
          preview,
        };

        return this.createSuccessResult(
          startedAt,
          output,
          this.formatPreviewOutput(output),
          { preview: true }
        );
      }

      // Step 2: Validate all operations
      const validationResult = await this.validateOperations(params.operations, context);
      if (!validationResult.valid) {
        return this.createErrorResult(
          startedAt,
          createToolError(
            'VALIDATION_ERROR',
            `Operation validation failed: ${validationResult.errors?.join(', ')}`
          ),
          ToolExecutionStatus.FAILURE,
          {
            success: false,
            total_operations: params.operations.length,
            successful_operations: 0,
            failed_operations: params.operations.length,
            rolled_back: false,
            results: [],
            conflicts: [],
            diff: undefined,
            backup_paths: [],
          }
        );
      }

      // Step 3: Detect conflicts
      const conflicts = params.skip_conflict_check 
        ? [] 
        : this.detectConflicts(params.operations);
      
      if (conflicts.length > 0) {
        return this.createErrorResult(
          startedAt,
          createToolError(
            'CONFLICT_DETECTED',
            `Detected ${conflicts.length} conflict(s): ${conflicts.map(c => c.description).join('; ')}`,
            {
              suggestion: 'Review conflicts and adjust operations, or set skip_conflict_check to true (not recommended).',
              retryable: true,
            }
          ),
          ToolExecutionStatus.FAILURE,
          {
            success: false,
            total_operations: params.operations.length,
            successful_operations: 0,
            failed_operations: 0,
            rolled_back: false,
            results: [],
            conflicts,
            diff: undefined,
            backup_paths: [],
          }
        );
      }

      // Step 4: Create backups
      const backupPaths: string[] = [];
      if (params.create_backups) {
        try {
          await this.createBackups(params.operations, context, params.backup_suffix);
          backupPaths.push(...this.backupEntries.map(b => b.backupPath).filter(p => p));
        } catch (error) {
          return this.createErrorResult(
            startedAt,
            createToolError(
              'BACKUP_FAILED',
              `Failed to create backups: ${error instanceof Error ? error.message : String(error)}`,
              { suggestion: 'Check disk space and permissions, or set create_backups to false.' }
            ),
            ToolExecutionStatus.FAILURE,
            {
              success: false,
              total_operations: params.operations.length,
              successful_operations: 0,
              failed_operations: 0,
              rolled_back: false,
              results: [],
              conflicts: [],
              diff: undefined,
              backup_paths: [],
            }
          );
        }
      }

      // Step 5: Execute operations atomically
      const results: OperationResult[] = [];
      let allSucceeded = true;

      for (let i = 0; i < params.operations.length; i++) {
        const operation = params.operations[i];
        try {
          const result = await this.executeOperation(operation, context);
          results.push(result);
          if (!result.success) {
            allSucceeded = false;
            break;
          }
        } catch (error) {
          allSucceeded = false;
          results.push({
            type: operation.type,
            file_path: this.getOperationPath(operation),
            success: false,
            error: error instanceof Error ? error.message : String(error),
          });
          break;
        }
      }

      // Step 6: Rollback if any operation failed
      let rolledBack = false;
      if (!allSucceeded) {
        try {
          await this.rollback();
          rolledBack = true;
        } catch (rollbackError) {
          // Log rollback error but don't fail
          this.log('error', `Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
        }
      }

      // Generate diff
      const diff = allSucceeded 
        ? await this.generateUnifiedDiff(params.operations, context) 
        : undefined;

      // Count successes
      const successfulOps = results.filter(r => r.success).length;

      // Build output
      const output: MultiFileEditOutput = {
        success: allSucceeded,
        total_operations: params.operations.length,
        successful_operations: successfulOps,
        failed_operations: params.operations.length - successfulOps,
        rolled_back: rolledBack,
        results,
        conflicts,
        diff,
        backup_paths: backupPaths,
      };

      // Validate output
      const outputValidation = this.outputSchema.safeParse(output);
      if (!outputValidation.success) {
        return this.createErrorResult(
          startedAt,
          createToolError(
            'OUTPUT_VALIDATION_ERROR',
            `Output validation failed: ${outputValidation.error.message}`
          )
        );
      }

      // Create display output
      const displayOutput = this.formatOutput(output);

      if (allSucceeded) {
        return this.createSuccessResult(
          startedAt,
          output,
          displayOutput,
          {
            totalOperations: params.operations.length,
            successfulOperations: successfulOps,
            hasBackups: backupPaths.length > 0,
          }
        );
      } else {
        return this.createErrorResult(
          startedAt,
          createToolError(
            'OPERATION_FAILED',
            `Operation ${successfulOps + 1} of ${params.operations.length} failed: ${results[successfulOps]?.error || 'Unknown error'}`,
            { 
              suggestion: rolledBack 
                ? 'All changes have been rolled back. Review the error and try again.' 
                : 'Changes may be partially applied. Manual cleanup may be required.',
              retryable: true,
            }
          ),
          ToolExecutionStatus.FAILURE,
          output
        );
      }

    } catch (error) {
      // Attempt rollback on unexpected error
      try {
        await this.rollback();
      } catch {
        // Ignore rollback errors
      }

      return this.createErrorResult(
        startedAt,
        createToolError(
          'EXECUTION_ERROR',
          `Failed to execute multi-file edit: ${error instanceof Error ? error.message : String(error)}`,
          { retryable: true }
        )
      );
    }
  }

  /**
   * Validate all operations before execution
   */
  private async validateOperations(
    operations: FileOperation[],
    context: ToolContext
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];

    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const opErrors = await this.validateOperation(op, context, i);
      errors.push(...opErrors);
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Validate a single operation
   */
  private async validateOperation(
    operation: FileOperation,
    context: ToolContext,
    index: number
  ): Promise<string[]> {
    const errors: string[] = [];
    const prefix = `Operation ${index + 1}`;

    switch (operation.type) {
      case 'edit': {
        const resolvedPath = path.resolve(context.workingDirectory, operation.file_path);
        try {
          await fs.access(resolvedPath);
          const stats = await fs.stat(resolvedPath);
          if (!stats.isFile()) {
            errors.push(`${prefix}: Path is not a file: ${operation.file_path}`);
          }
        } catch {
          errors.push(`${prefix}: File not found: ${operation.file_path}`);
        }
        if (operation.old_string.length === 0) {
          errors.push(`${prefix}: old_string cannot be empty`);
        }
        break;
      }

      case 'create': {
        const resolvedPath = path.resolve(context.workingDirectory, operation.file_path);
        if (!operation.overwrite) {
          try {
            await fs.access(resolvedPath);
            errors.push(`${prefix}: File already exists: ${operation.file_path} (set overwrite: true to replace)`);
          } catch {
            // File doesn't exist, which is fine
          }
        }
        break;
      }

      case 'delete': {
        const resolvedPath = path.resolve(context.workingDirectory, operation.file_path);
        try {
          await fs.access(resolvedPath);
          const stats = await fs.stat(resolvedPath);
          if (!stats.isFile()) {
            errors.push(`${prefix}: Path is not a file: ${operation.file_path}`);
          }
        } catch {
          errors.push(`${prefix}: File not found: ${operation.file_path}`);
        }
        break;
      }

      case 'rename': {
        const resolvedSource = path.resolve(context.workingDirectory, operation.source_path);
        try {
          await fs.access(resolvedSource);
          const stats = await fs.stat(resolvedSource);
          if (!stats.isFile()) {
            errors.push(`${prefix}: Source path is not a file: ${operation.source_path}`);
          }
        } catch {
          errors.push(`${prefix}: Source file not found: ${operation.source_path}`);
        }

        if (!operation.overwrite) {
          const resolvedTarget = path.resolve(context.workingDirectory, operation.target_path);
          try {
            await fs.access(resolvedTarget);
            errors.push(`${prefix}: Target file already exists: ${operation.target_path} (set overwrite: true to replace)`);
          } catch {
            // Target doesn't exist, which is fine
          }
        }
        break;
      }
    }

    return errors;
  }

  /**
   * Detect conflicts between operations
   */
  private detectConflicts(operations: FileOperation[]): Conflict[] {
    const conflicts: Conflict[] = [];
    const targetPaths = new Map<string, number[]>();
    const sourcePaths = new Map<string, number[]>();

    // Build path maps
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const paths = this.getAllPaths(op);

      for (const { type, path: filePath } of paths) {
        const map = type === 'target' ? targetPaths : sourcePaths;
        const indices = map.get(filePath) || [];
        indices.push(i);
        map.set(filePath, indices);
      }
    }

    // Check for target conflicts (multiple operations targeting the same file)
    for (const [filePath, indices] of targetPaths.entries()) {
      if (indices.length > 1) {
        conflicts.push({
          type: 'target_conflict',
          description: `Multiple operations target the same file: ${filePath}`,
          operations: indices,
          file_path: filePath,
        });
      }
    }

    // Check for source-target conflicts
    for (let i = 0; i < operations.length; i++) {
      const op = operations[i];
      const targetPath = this.getOperationPath(op);

      // Check if target is used as a source in later operations
      for (let j = i + 1; j < operations.length; j++) {
        const laterOp = operations[j];
        const laterSourcePaths = this.getSourcePaths(laterOp);

        if (laterSourcePaths.includes(targetPath)) {
          conflicts.push({
            type: 'concurrent_edit',
            description: `Operation ${i + 1} modifies ${targetPath} which is used by operation ${j + 1}`,
            operations: [i, j],
            file_path: targetPath,
          });
        }
      }
    }

    return conflicts;
  }

  /**
   * Get all paths involved in an operation
   */
  private getAllPaths(operation: FileOperation): Array<{ type: 'source' | 'target'; path: string }> {
    switch (operation.type) {
      case 'edit':
        return [{ type: 'source', path: operation.file_path }, { type: 'target', path: operation.file_path }];
      case 'create':
        return [{ type: 'target', path: operation.file_path }];
      case 'delete':
        return [{ type: 'source', path: operation.file_path }];
      case 'rename':
        return [{ type: 'source', path: operation.source_path }, { type: 'target', path: operation.target_path }];
    }
  }

  /**
   * Get source paths for an operation
   */
  private getSourcePaths(operation: FileOperation): string[] {
    switch (operation.type) {
      case 'edit':
      case 'delete':
        return [operation.file_path];
      case 'rename':
        return [operation.source_path];
      case 'create':
        return [];
    }
  }

  /**
   * Get the primary path for an operation
   */
  private getOperationPath(operation: FileOperation): string {
    switch (operation.type) {
      case 'edit':
      case 'create':
      case 'delete':
        return operation.file_path;
      case 'rename':
        return operation.target_path;
    }
  }

  /**
   * Generate preview of operations
   */
  private async generatePreview(
    operations: FileOperation[],
    context: ToolContext
  ): Promise<Array<{ operation: FileOperation; status: 'success' | 'error' | 'conflict'; message: string }>> {
    const preview = [];

    for (const operation of operations) {
      const validation = await this.validateOperation(operation, context, 0);
      if (validation.length > 0) {
        preview.push({
          operation,
          status: 'error' as const,
          message: validation[0],
        });
      } else {
        preview.push({
          operation,
          status: 'success' as const,
          message: `${operation.type} operation validated successfully`,
        });
      }
    }

    return preview;
  }

  /**
   * Create backups before execution
   */
  private async createBackups(
    operations: FileOperation[],
    context: ToolContext,
    backupSuffix: string
  ): Promise<void> {
    for (const operation of operations) {
      // Handle source paths (for edit, delete, rename)
      const sourcePaths = this.getSourcePaths(operation);
      
      for (const filePath of sourcePaths) {
        const resolvedPath = path.resolve(context.workingDirectory, filePath);
        
        try {
          await fs.access(resolvedPath);
          const content = await fs.readFile(resolvedPath, 'utf8');
          const backupPath = `${resolvedPath}${backupSuffix}`;
          
          await fs.writeFile(backupPath, content, 'utf8');
          
          this.backupEntries.push({
            filePath: resolvedPath,
            backupPath,
            operationType: operation.type,
            originalContent: content,
            originalExists: true,
          });
        } catch {
          // File doesn't exist, mark for rollback handling
          this.backupEntries.push({
            filePath: resolvedPath,
            backupPath: '',
            operationType: operation.type,
            originalContent: undefined,
            originalExists: false,
          });
        }
      }

      // Handle target paths for create and rename operations
      // These need to be tracked for rollback (to delete created files or restore original targets)
      if (operation.type === 'create') {
        const resolvedPath = path.resolve(context.workingDirectory, operation.file_path);
        
        try {
          // If file exists and we're overwriting, backup the existing content
          await fs.access(resolvedPath);
          const content = await fs.readFile(resolvedPath, 'utf8');
          const backupPath = `${resolvedPath}${backupSuffix}`;
          
          await fs.writeFile(backupPath, content, 'utf8');
          
          this.backupEntries.push({
            filePath: resolvedPath,
            backupPath,
            operationType: operation.type,
            originalContent: content,
            originalExists: true,
          });
        } catch {
          // File doesn't exist (normal for create), track it for potential deletion on rollback
          this.backupEntries.push({
            filePath: resolvedPath,
            backupPath: '',
            operationType: operation.type,
            originalContent: undefined,
            originalExists: false,
          });
        }
      }

      if (operation.type === 'rename') {
        const resolvedTarget = path.resolve(context.workingDirectory, operation.target_path);
        
        try {
          // If target exists and we're overwriting, backup the existing content
          await fs.access(resolvedTarget);
          const content = await fs.readFile(resolvedTarget, 'utf8');
          const backupPath = `${resolvedTarget}${backupSuffix}`;
          
          await fs.writeFile(backupPath, content, 'utf8');
          
          this.backupEntries.push({
            filePath: resolvedTarget,
            backupPath,
            operationType: operation.type,
            originalContent: content,
            originalExists: true,
          });
        } catch {
          // Target doesn't exist, track it for potential deletion on rollback
          this.backupEntries.push({
            filePath: resolvedTarget,
            backupPath: '',
            operationType: operation.type,
            originalContent: undefined,
            originalExists: false,
          });
        }
      }
    }
  }

  /**
   * Execute a single operation
   */
  private async executeOperation(
    operation: FileOperation,
    context: ToolContext
  ): Promise<OperationResult> {
    const baseResult = {
      type: operation.type,
      file_path: this.getOperationPath(operation),
      success: false,
    };

    try {
      switch (operation.type) {
        case 'edit':
          return await this.executeEdit(operation, context, baseResult);
        case 'create':
          return await this.executeCreate(operation, context, baseResult);
        case 'delete':
          return await this.executeDelete(operation, context, baseResult);
        case 'rename':
          return await this.executeRename(operation, context, baseResult);
      }
    } catch (error) {
      return {
        ...baseResult,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Execute edit operation
   */
  private async executeEdit(
    operation: EditOperation,
    context: ToolContext,
    baseResult: Omit<OperationResult, 'success' | 'error' | 'details'>
  ): Promise<OperationResult> {
    const resolvedPath = path.resolve(context.workingDirectory, operation.file_path);
    const content = await fs.readFile(resolvedPath, 'utf8');

    // Find occurrences
    const occurrences: number[] = [];
    let searchIndex = 0;
    while (true) {
      const index = content.indexOf(operation.old_string, searchIndex);
      if (index === -1) break;
      occurrences.push(index);
      searchIndex = index + 1;
    }

    if (occurrences.length === 0) {
      return {
        ...baseResult,
        success: false,
        error: `String not found: "${this.truncateString(operation.old_string, 50)}"`,
      };
    }

    if (occurrences.length > 1 && !operation.replace_all) {
      return {
        ...baseResult,
        success: false,
        error: `Found ${occurrences.length} occurrences. Use replace_all: true to replace all.`,
      };
    }

    // Perform replacements
    let newContent = content;
    const sortedOccurrences = [...occurrences].sort((a, b) => b - a);
    for (const index of sortedOccurrences) {
      newContent = newContent.substring(0, index) + operation.new_string + newContent.substring(index + operation.old_string.length);
    }

    await fs.writeFile(resolvedPath, newContent, 'utf8');

    return {
      ...baseResult,
      success: true,
      details: {
        replacements: occurrences.length,
        originalSize: content.length,
        newSize: newContent.length,
      },
    };
  }

  /**
   * Execute create operation
   */
  private async executeCreate(
    operation: CreateOperation,
    context: ToolContext,
    baseResult: Omit<OperationResult, 'success' | 'error' | 'details'>
  ): Promise<OperationResult> {
    const resolvedPath = path.resolve(context.workingDirectory, operation.file_path);

    // Create parent directories
    const parentDir = path.dirname(resolvedPath);
    await fs.mkdir(parentDir, { recursive: true });

    // Check if file exists
    let overwritten = false;
    try {
      await fs.access(resolvedPath);
      if (!operation.overwrite) {
        return {
          ...baseResult,
          success: false,
          error: `File already exists: ${operation.file_path}`,
        };
      }
      overwritten = true;
    } catch {
      // File doesn't exist
    }

    await fs.writeFile(resolvedPath, operation.content, 'utf8');

    if (operation.permissions) {
      const mode = parseInt(operation.permissions, 8);
      await fs.chmod(resolvedPath, mode);
    }

    return {
      ...baseResult,
      success: true,
      details: {
        size: operation.content.length,
        lines: operation.content.split('\n').length,
        overwritten,
        permissions: operation.permissions,
      },
    };
  }

  /**
   * Execute delete operation
   */
  private async executeDelete(
    operation: DeleteOperation,
    context: ToolContext,
    baseResult: Omit<OperationResult, 'success' | 'error' | 'details'>
  ): Promise<OperationResult> {
    const resolvedPath = path.resolve(context.workingDirectory, operation.file_path);
    
    const stats = await fs.stat(resolvedPath);
    const size = stats.size;

    await fs.unlink(resolvedPath);

    return {
      ...baseResult,
      success: true,
      details: {
        size,
        deletedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Execute rename operation
   */
  private async executeRename(
    operation: RenameOperation,
    context: ToolContext,
    baseResult: Omit<OperationResult, 'success' | 'error' | 'details'>
  ): Promise<OperationResult> {
    const resolvedSource = path.resolve(context.workingDirectory, operation.source_path);
    const resolvedTarget = path.resolve(context.workingDirectory, operation.target_path);

    // Create parent directories
    const parentDir = path.dirname(resolvedTarget);
    await fs.mkdir(parentDir, { recursive: true });

    // Check if target exists
    let overwritten = false;
    try {
      await fs.access(resolvedTarget);
      if (!operation.overwrite) {
        return {
          ...baseResult,
          success: false,
          error: `Target file already exists: ${operation.target_path}`,
        };
      }
      overwritten = true;
    } catch {
      // Target doesn't exist
    }

    const stats = await fs.stat(resolvedSource);

    try {
      await fs.rename(resolvedSource, resolvedTarget);
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      if (err.code === 'EXDEV') {
        // Cross-device move
        await fs.copyFile(resolvedSource, resolvedTarget);
        await fs.unlink(resolvedSource);
      } else {
        throw error;
      }
    }

    const sourceDir = path.dirname(resolvedSource);
    const targetDir = path.dirname(resolvedTarget);
    const operationType = sourceDir === targetDir ? 'rename' : 'move';

    return {
      ...baseResult,
      success: true,
      details: {
        operation_type: operationType,
        size: stats.size,
        overwritten,
      },
    };
  }

  /**
   * Rollback all changes
   */
  private async rollback(): Promise<void> {
    // Rollback in reverse order
    for (const entry of [...this.backupEntries].reverse()) {
      try {
        if (entry.operationType === 'rename') {
          // For rename: if target was created/exists, delete it
          // if source was moved, restore it from backup
          if (!entry.originalExists) {
            // This was a newly created target path, delete it
            try {
              await fs.unlink(entry.filePath);
            } catch {
              // Ignore if doesn't exist
            }
          } else {
            // Target existed before, restore its original content
            if (entry.originalContent !== undefined) {
              await fs.writeFile(entry.filePath, entry.originalContent, 'utf8');
            }
          }
        } else if (entry.operationType === 'create') {
          // For create: delete the file if it was created
          if (!entry.originalExists) {
            try {
              await fs.unlink(entry.filePath);
            } catch {
              // Ignore if doesn't exist
            }
          } else {
            // File existed before (overwrite case), restore original
            if (entry.originalContent !== undefined) {
              await fs.writeFile(entry.filePath, entry.originalContent, 'utf8');
            }
          }
        } else if (entry.operationType === 'delete') {
          // For delete: restore the deleted file
          if (entry.originalExists && entry.originalContent !== undefined) {
            await fs.writeFile(entry.filePath, entry.originalContent, 'utf8');
          }
        } else if (entry.operationType === 'edit') {
          // For edit: restore original content
          if (entry.originalExists && entry.originalContent !== undefined) {
            await fs.writeFile(entry.filePath, entry.originalContent, 'utf8');
          }
        }

        // Clean up backup file
        if (entry.backupPath) {
          try {
            await fs.unlink(entry.backupPath);
          } catch {
            // Ignore
          }
        }
      } catch (error) {
        this.log('error', `Rollback error for ${entry.filePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  /**
   * Generate unified diff for all changes
   */
  private async generateUnifiedDiff(
    operations: FileOperation[],
    context: ToolContext
  ): Promise<string> {
    const diffLines: string[] = [];

    for (const operation of operations) {
      if (operation.type === 'edit') {
        const resolvedPath = path.resolve(context.workingDirectory, operation.file_path);
        const fileName = path.basename(resolvedPath);
        
        try {
          const currentContent = await fs.readFile(resolvedPath, 'utf8');
          const originalContent = this.backupEntries.find(
            b => b.filePath === resolvedPath
          )?.originalContent || '';

          diffLines.push(`--- ${fileName}`);
          diffLines.push(`+++ ${fileName}`);
          diffLines.push(`@@ Operation: edit ${operation.file_path} @@`);
          diffLines.push(`-${operation.old_string}`);
          diffLines.push(`+${operation.new_string}`);
          diffLines.push('');
        } catch {
          // Ignore errors
        }
      } else if (operation.type === 'create') {
        const resolvedPath = path.resolve(context.workingDirectory, operation.file_path);
        const fileName = path.basename(resolvedPath);
        
        diffLines.push(`--- /dev/null`);
        diffLines.push(`+++ ${fileName}`);
        diffLines.push(`@@ Operation: create ${operation.file_path} @@`);
        diffLines.push(`+${operation.content.substring(0, 200)}${operation.content.length > 200 ? '...' : ''}`);
        diffLines.push('');
      } else if (operation.type === 'rename') {
        const resolvedSource = path.resolve(context.workingDirectory, operation.source_path);
        const resolvedTarget = path.resolve(context.workingDirectory, operation.target_path);
        
        diffLines.push(`--- ${path.basename(resolvedSource)}`);
        diffLines.push(`+++ ${path.basename(resolvedTarget)}`);
        diffLines.push(`@@ Operation: rename ${operation.source_path} -> ${operation.target_path} @@`);
        diffLines.push('');
      } else if (operation.type === 'delete') {
        const resolvedPath = path.resolve(context.workingDirectory, operation.file_path);
        const fileName = path.basename(resolvedPath);
        
        diffLines.push(`--- ${fileName}`);
        diffLines.push(`+++ /dev/null`);
        diffLines.push(`@@ Operation: delete ${operation.file_path} @@`);
        diffLines.push('');
      }
    }

    return diffLines.join('\n');
  }

  /**
   * Validate execution context
   */
  protected async validateContext(
    input: unknown,
    context: ToolContext
  ): Promise<{ valid: boolean; errors?: string[] }> {
    const params = input as MultiFileEditInput;
    const errors: string[] = [];

    // Validate working directory exists
    try {
      await fs.access(context.workingDirectory);
    } catch {
      errors.push(`Working directory does not exist: ${context.workingDirectory}`);
    }

    // Validate operations array is not empty
    if (params.operations.length === 0) {
      errors.push('At least one operation is required');
    }

    // Validate max operations
    if (params.operations.length > 100) {
      errors.push('Maximum 100 operations allowed');
    }

    // Validate backup suffix
    if (params.create_backups && params.backup_suffix.length === 0) {
      errors.push('backup_suffix cannot be empty when create_backups is true');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Truncate string for display
   */
  private truncateString(str: string, maxLength: number): string {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
  }

  /**
   * Format output for display
   */
  private formatOutput(output: MultiFileEditOutput): string {
    const parts: string[] = [];

    // Header
    if (output.success) {
      parts.push(`✅ Multi-file edit completed successfully`);
    } else if (output.rolled_back) {
      parts.push(`❌ Multi-file edit failed - changes rolled back`);
    } else {
      parts.push(`❌ Multi-file edit failed - partial changes may remain`);
    }

    parts.push(`   Operations: ${output.successful_operations}/${output.total_operations} succeeded`);
    
    if (output.backup_paths.length > 0) {
      parts.push(`   Backups: ${output.backup_paths.length} files backed up`);
    }

    // Results
    if (output.results.length > 0) {
      parts.push('');
      parts.push('Operation Results:');
      output.results.forEach((result, index) => {
        const status = result.success ? '✓' : '✗';
        parts.push(`  ${status} ${index + 1}. ${result.type}: ${result.file_path}`);
        if (result.error) {
          parts.push(`    Error: ${result.error}`);
        }
      });
    }

    // Conflicts
    if (output.conflicts.length > 0) {
      parts.push('');
      parts.push('Conflicts:');
      output.conflicts.forEach(conflict => {
        parts.push(`  ⚠ ${conflict.description}`);
      });
    }

    // Diff
    if (output.diff) {
      parts.push('');
      parts.push('Diff:');
      parts.push('```diff');
      parts.push(output.diff);
      parts.push('```');
    }

    return parts.join('\n');
  }

  /**
   * Format preview output
   */
  private formatPreviewOutput(output: MultiFileEditOutput): string {
    const parts: string[] = [];

    parts.push(`🔍 Preview Mode - No changes applied`);
    parts.push(`   Operations: ${output.total_operations}`);
    parts.push('');

    if (output.preview) {
      parts.push('Preview Results:');
      output.preview.forEach((item, index) => {
        const icon = item.status === 'success' ? '✓' : item.status === 'conflict' ? '⚠' : '✗';
        parts.push(`  ${icon} ${index + 1}. ${item.operation.type}: ${this.getOperationPath(item.operation)}`);
        parts.push(`     ${item.message}`);
      });
    }

    return parts.join('\n');
  }

  /**
   * Create a success result
   */
  private createSuccessResult(
    startedAt: Date,
    data: MultiFileEditOutput,
    output: string,
    metadata?: Record<string, unknown>
  ): ToolResult {
    const completedAt = new Date();
    return {
      executionId: `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      status: ToolExecutionStatus.SUCCESS,
      toolName: this.name,
      startedAt,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      success: true,
      data,
      output,
      metadata,
    };
  }

  /**
   * Create an error result
   */
  private createErrorResult(
    startedAt: Date,
    error: ReturnType<typeof createToolError>,
    status: ToolExecutionStatus = ToolExecutionStatus.FAILURE,
    data?: MultiFileEditOutput
  ): ToolResult {
    const completedAt = new Date();
    return {
      executionId: `${this.name}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      status,
      toolName: this.name,
      startedAt,
      completedAt,
      duration: completedAt.getTime() - startedAt.getTime(),
      success: false,
      error,
      data,
    };
  }
}

export default MultiFileEditTool;
