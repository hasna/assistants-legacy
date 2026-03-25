import { join } from 'path';
import { homedir } from 'os';
import { stat, readdir } from 'fs/promises';
import type { Tool, AssistantsConfig } from '@hasna/assistants-shared';
import type { ToolExecutor } from '../tools/registry';
import type { ToolRegistry } from '../tools/registry';
import type { Command } from '../commands/types';
import type { CommandLoader } from '../commands/loader';

/**
 * Extension context provided to each extension's setup() function.
 * Allows extensions to register tools and commands.
 */
export interface ExtensionContext {
  /** Register a new tool with the assistant */
  registerTool(tool: Tool, executor: ToolExecutor): void;
  /** Register a new slash command */
  registerCommand(command: Command): void;
  /** Current assistant configuration */
  config: AssistantsConfig;
  /** Current working directory */
  cwd: string;
}

/**
 * Extension interface that plugins must implement.
 * Each extension directory must have an index.ts or index.js that default-exports an Extension.
 */
export interface Extension {
  /** Unique extension name */
  name: string;
  /** Semver version string */
  version: string;
  /** Called once during initialization to register tools and commands */
  setup(context: ExtensionContext): void | Promise<void>;
}

/**
 * Result of loading a single extension
 */
export interface ExtensionLoadResult {
  name: string;
  version: string;
  success: boolean;
  error?: string;
}

/**
 * ExtensionLoader discovers and loads TypeScript/JavaScript extensions
 * from ~/.hasna/assistants/extensions/ and .assistants/extensions/.
 *
 * Each extension is a directory with an index.ts or index.js that
 * default-exports an object implementing the Extension interface.
 *
 * Discovery order (later overrides earlier by name):
 * 1. ~/.hasna/assistants/extensions/<name>/  — global user extensions
 * 2. {cwd}/.assistants/extensions/<name>/ — project-local extensions
 */
export class ExtensionLoader {
  private extensions: Map<string, Extension> = new Map();
  private loadResults: ExtensionLoadResult[] = [];

  /**
   * Discover and load all extensions, then call setup() on each.
   */
  async loadAll(
    cwd: string,
    toolRegistry: ToolRegistry,
    commandLoader: CommandLoader,
    config: AssistantsConfig,
  ): Promise<ExtensionLoadResult[]> {
    this.extensions.clear();
    this.loadResults = [];

    const envHome = process.env.HOME || process.env.USERPROFILE;
    const userHome = envHome && envHome.trim().length > 0 ? envHome : homedir();
    const globalDir = join(userHome, '.hasna', 'assistants', 'extensions');
    const projectDir = join(cwd, '.assistants', 'extensions');

    // Load global extensions first, then project extensions (project overrides global by name)
    await this.discoverExtensions(globalDir);
    await this.discoverExtensions(projectDir);

    // Setup all loaded extensions
    const results: ExtensionLoadResult[] = [];
    for (const extension of this.extensions.values()) {
      const result = await this.setupExtension(extension, toolRegistry, commandLoader, config, cwd);
      results.push(result);
    }

    this.loadResults = results;
    return results;
  }

  /**
   * Discover extensions in a directory. Each subdirectory with an index.ts or index.js
   * is treated as an extension.
   */
  private async discoverExtensions(dir: string): Promise<void> {
    try {
      const stats = await stat(dir);
      if (!stats.isDirectory()) return;
    } catch {
      return; // Directory doesn't exist, skip silently
    }

    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      return;
    }

    for (const entry of entries) {
      // Skip hidden directories and node_modules
      if (entry.startsWith('.') || entry === 'node_modules') continue;

      const extDir = join(dir, entry);
      try {
        const extStats = await stat(extDir);
        if (!extStats.isDirectory()) continue;
      } catch {
        continue;
      }

      // Try to load the extension module
      const extension = await this.loadExtensionModule(extDir, entry);
      if (extension) {
        this.extensions.set(extension.name, extension);
      }
    }
  }

  /**
   * Load a single extension module from a directory.
   * Tries index.ts first, then index.js.
   */
  private async loadExtensionModule(dir: string, fallbackName: string): Promise<Extension | null> {
    const candidates = ['index.ts', 'index.js'];

    for (const filename of candidates) {
      const filePath = join(dir, filename);
      try {
        const fileStats = await stat(filePath);
        if (!fileStats.isFile()) continue;
      } catch {
        continue;
      }

      try {
        const mod = await import(filePath);
        const ext: Extension = mod.default ?? mod;

        // Validate extension interface
        if (!ext || typeof ext.name !== 'string' || typeof ext.version !== 'string' || typeof ext.setup !== 'function') {
          this.loadResults.push({
            name: fallbackName,
            version: '0.0.0',
            success: false,
            error: `Extension at ${filePath} does not export a valid Extension (requires name, version, setup)`,
          });
          return null;
        }

        return ext;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.loadResults.push({
          name: fallbackName,
          version: '0.0.0',
          success: false,
          error: `Failed to import ${filePath}: ${message}`,
        });
        return null;
      }
    }

    // No index file found — not an error, just skip
    return null;
  }

  /**
   * Call setup() on an extension, providing the extension context.
   */
  private async setupExtension(
    extension: Extension,
    toolRegistry: ToolRegistry,
    commandLoader: CommandLoader,
    config: AssistantsConfig,
    cwd: string,
  ): Promise<ExtensionLoadResult> {
    const context: ExtensionContext = {
      registerTool: (tool: Tool, executor: ToolExecutor) => {
        toolRegistry.register(tool, executor);
      },
      registerCommand: (command: Command) => {
        commandLoader.register(command);
      },
      config,
      cwd,
    };

    try {
      await extension.setup(context);
      return {
        name: extension.name,
        version: extension.version,
        success: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        name: extension.name,
        version: extension.version,
        success: false,
        error: `setup() failed: ${message}`,
      };
    }
  }

  /**
   * Get all successfully loaded extensions
   */
  getExtensions(): Extension[] {
    return Array.from(this.extensions.values());
  }

  /**
   * Get a specific extension by name
   */
  getExtension(name: string): Extension | undefined {
    return this.extensions.get(name);
  }

  /**
   * Get load results from the last loadAll() call
   */
  getLoadResults(): ExtensionLoadResult[] {
    return this.loadResults;
  }
}
