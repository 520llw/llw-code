/**
 * @fileoverview File Tools Index
 * 
 * This module exports all file operation tools for the Claude Code Clone.
 * 
 * @module file
 * @version 1.0.0
 * @author Claude Code Clone
 */

// File Operations
export { FileReadTool, FileReadInputSchema, FileReadOutputSchema } from './FileReadTool';
export type { FileReadInput, FileReadOutput } from './FileReadTool';

export { FileEditTool, FileEditInputSchema, FileEditOutputSchema } from './FileEditTool';
export type { FileEditInput, FileEditOutput, EditOperation, ReplacementResult } from './FileEditTool';

export { FileCreateTool, FileCreateInputSchema, FileCreateOutputSchema } from './FileCreateTool';
export type { FileCreateInput, FileCreateOutput } from './FileCreateTool';

export { FileDeleteTool, FileDeleteInputSchema, FileDeleteOutputSchema } from './FileDeleteTool';
export type { FileDeleteInput, FileDeleteOutput } from './FileDeleteTool';

export { FileRenameTool, FileRenameInputSchema, FileRenameOutputSchema } from './FileRenameTool';
export type { FileRenameInput, FileRenameOutput } from './FileRenameTool';

// Multi-File Operations
export { MultiFileEditTool, MultiFileEditInputSchema, MultiFileEditOutputSchema } from './MultiFileEditTool';
export type {
  MultiFileEditInput,
  MultiFileEditOutput,
  FileOperation,
  EditOperation,
  CreateOperation,
  DeleteOperation,
  RenameOperation,
  OperationResult,
  Conflict,
} from './MultiFileEditTool';

// Directory Operations
export { DirectoryListTool, DirectoryListInputSchema, DirectoryListOutputSchema, DirectoryEntrySchema } from './DirectoryListTool';
export type { DirectoryListInput, DirectoryListOutput, DirectoryEntry } from './DirectoryListTool';

export { DirectoryCreateTool, DirectoryCreateInputSchema, DirectoryCreateOutputSchema } from './DirectoryCreateTool';
export type { DirectoryCreateInput, DirectoryCreateOutput } from './DirectoryCreateTool';

export { DirectoryDeleteTool, DirectoryDeleteInputSchema, DirectoryDeleteOutputSchema } from './DirectoryDeleteTool';
export type { DirectoryDeleteInput, DirectoryDeleteOutput } from './DirectoryDeleteTool';
