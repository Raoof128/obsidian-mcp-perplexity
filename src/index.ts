#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ObsidianConfig {
  obsidianVaultPath: string;
  excludePatterns?: string[];
  maxSearchResults?: number;
  enableIndexing?: boolean;
}

interface PerplexityResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}

interface SearchResult {
  path: string;
  title: string;
  excerpt: string;
  matches: number;
  score: number;
}

interface VaultStats {
  vaultPath: string;
  noteCount: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  fileTypes: Record<string, number>;
  lastAnalyzed: string;
}

class ObsidianMCPServer {
  private server: Server;
  private config: ObsidianConfig | null = null;
  private vaultIndex: Map<string, any> = new Map();

  constructor() {
    this.server = new Server(
      {
        name: "obsidian-mcp-perplexity",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupErrorHandling();
    this.setupHandlers();
  }

  private formatResponse(data: any) {
    let text: string;

    if (typeof data === 'string') {
      text = data;
    } else if (data && typeof data === 'object') {
      // Format structured data nicely for Perplexity
      if (data.error) {
        text = `Error: ${data.error}`;
      } else {
        text = JSON.stringify(data, null, 2);
      }
    } else {
      text = String(data);
    }

    return {
      content: [{
        type: "text" as const,
        text: text
      }]
    };
  }

  private async loadConfig(): Promise<void> {
    const configPath = process.env.OBSIDIAN_MCP_CONFIG;
    if (!configPath) {
      // Try default config locations
      const defaultPaths = [
        path.join(process.cwd(), 'config.json'),
        path.join(__dirname, '..', 'config', 'default.json'),
        path.join(process.env.HOME || '', '.obsidian-mcp', 'config.json')
      ];

      for (const defaultPath of defaultPaths) {
        try {
          await fs.access(defaultPath);
          process.env.OBSIDIAN_MCP_CONFIG = defaultPath;
          break;
        } catch {
          continue;
        }
      }

      if (!process.env.OBSIDIAN_MCP_CONFIG) {
        throw new Error("OBSIDIAN_MCP_CONFIG environment variable not set and no default config found");
      }
    }

    try {
      const configData = await fs.readFile(process.env.OBSIDIAN_MCP_CONFIG!, "utf-8");
      this.config = JSON.parse(configData);

      if (!this.config?.obsidianVaultPath) {
        throw new Error("obsidianVaultPath not specified in config");
      }

      // Expand home directory
      if (this.config.obsidianVaultPath.startsWith('~')) {
        this.config.obsidianVaultPath = path.join(
          process.env.HOME || '',
          this.config.obsidianVaultPath.slice(1)
        );
      }

      const vaultExists = await fs.access(this.config.obsidianVaultPath).then(() => true).catch(() => false);
      if (!vaultExists) {
        throw new Error(`Obsidian vault not found at: ${this.config.obsidianVaultPath}`);
      }

      // Set defaults
      this.config.maxSearchResults = this.config.maxSearchResults || 20;
      this.config.enableIndexing = this.config.enableIndexing !== false;
      this.config.excludePatterns = this.config.excludePatterns || [
        ".obsidian/**",
        "*.tmp",
        "*.bak",
        ".trash/**"
      ];

    } catch (error) {
      throw new Error(`Failed to load config: ${(error as Error).message}`);
    }
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      console.error("Shutting down Obsidian MCP server...");
      await this.server.close();
      process.exit(0);
    });

    process.on("uncaughtException", (error) => {
      console.error("Uncaught exception:", error);
      process.exit(1);
    });
  }

  private setupHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "search_notes",
            description: "Search through Obsidian notes by content and filename. Returns relevant notes with excerpts and match scores.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query to find in notes",
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results to return (default: 10)",
                  default: 10,
                },
                includeContent: {
                  type: "boolean",
                  description: "Include full content in results (default: false)",
                  default: false,
                },
              },
              required: ["query"],
            },
          },
          {
            name: "get_vault_stats",
            description: "Get comprehensive statistics about the Obsidian vault including file counts, sizes, and types.",
            inputSchema: {
              type: "object",
              properties: {
                detailed: {
                  type: "boolean",
                  description: "Include detailed breakdown by file types and directories",
                  default: false,
                },
              },
            },
          },
          {
            name: "get_note_content",
            description: "Get the full content of a specific note with metadata.",
            inputSchema: {
              type: "object",
              properties: {
                notePath: {
                  type: "string",
                  description: "Path to the note relative to vault root (e.g., 'folder/note.md')",
                },
                includeMetadata: {
                  type: "boolean",
                  description: "Include file metadata (size, dates, etc.)",
                  default: true,
                },
              },
              required: ["notePath"],
            },
          },
          {
            name: "list_recent_notes",
            description: "List recently modified notes sorted by modification time.",
            inputSchema: {
              type: "object",
              properties: {
                limit: {
                  type: "number",
                  description: "Maximum number of notes to return (default: 10)",
                  default: 10,
                },
                days: {
                  type: "number",
                  description: "Only include notes modified within this many days (default: 30)",
                  default: 30,
                },
              },
            },
          },
          {
            name: "get_note_links",
            description: "Get all internal links from a specific note and analyze the connection graph.",
            inputSchema: {
              type: "object",
              properties: {
                notePath: {
                  type: "string",
                  description: "Path to the note relative to vault root",
                },
                includeBacklinks: {
                  type: "boolean",
                  description: "Include notes that link to this note",
                  default: true,
                },
              },
              required: ["notePath"],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        await this.loadConfig();

        switch (request.params.name) {
          case "search_notes":
            return await this.searchNotes(request.params.arguments);
          case "get_vault_stats":
            return await this.getVaultStats(request.params.arguments);
          case "get_note_content":
            return await this.getNoteContent(request.params.arguments);
          case "list_recent_notes":
            return await this.listRecentNotes(request.params.arguments);
          case "get_note_links":
            return await this.getNoteLinks(request.params.arguments);
          default:
            throw new Error(`Unknown tool: ${request.params.name}`);
        }
      } catch (error) {
        console.error(`Tool error (${request.params.name}):`, error);
        return this.formatResponse({
          error: (error as Error).message,
          tool: request.params.name,
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  private isExcluded(filePath: string): boolean {
    if (!this.config?.excludePatterns) return false;

    const relativePath = path.relative(this.config.obsidianVaultPath, filePath);
    return this.config.excludePatterns.some(pattern => {
      const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
      return regex.test(relativePath);
    });
  }

  private calculateRelevanceScore(content: string, filename: string, query: string): number {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    const filenameLower = filename.toLowerCase();

    let score = 0;

    // Filename matches get high score
    if (filenameLower.includes(queryLower)) {
      score += 100;
    }

    // Count content matches
    const matches = (contentLower.match(new RegExp(queryLower, 'g')) || []).length;
    score += matches * 10;

    // Bonus for title/header matches (lines starting with #)
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('#') && line.toLowerCase().includes(queryLower)) {
        score += 50;
      }
    }

    return score;
  }

  private async searchNotes(args: any) {
    const { query, limit = 10, includeContent = false } = args;
    const results: SearchResult[] = [];

    async function searchInDirectory(dir: string, server: ObsidianMCPServer): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (server.isExcluded(fullPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await searchInDirectory(fullPath, server);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const relativePath = path.relative(server.config!.obsidianVaultPath, fullPath);

            if (content.toLowerCase().includes(query.toLowerCase()) ||
                entry.name.toLowerCase().includes(query.toLowerCase())) {

              const lines = content.split('\n');
              const matchingLines = lines.filter(line =>
                line.toLowerCase().includes(query.toLowerCase())
              ).slice(0, 5);

              const score = server.calculateRelevanceScore(content, entry.name, query);

              results.push({
                path: relativePath,
                title: entry.name.replace('.md', ''),
                excerpt: matchingLines.join(' ... '),
                matches: matchingLines.length,
                score: score
              });
            }
          } catch (error) {
            console.error(`Error reading file ${fullPath}:`, error);
          }
        }
      }
    }

    await searchInDirectory(this.config!.obsidianVaultPath, this);

    // Sort by relevance score and limit results
    const sortedResults = results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    const searchResults = {
      query: query,
      totalResults: results.length,
      returnedResults: sortedResults.length,
      results: includeContent ?
        await Promise.all(sortedResults.map(async (result) => {
          try {
            const fullPath = path.join(this.config!.obsidianVaultPath, result.path);
            const content = await fs.readFile(fullPath, 'utf-8');
            return { ...result, content };
          } catch {
            return result;
          }
        })) : sortedResults,
      searchTime: new Date().toISOString()
    };

    return this.formatResponse(searchResults);
  }

  private async getVaultStats(args: any = {}) {
    const { detailed = false } = args;
    let noteCount = 0;
    let totalSize = 0;
    const fileTypes: Record<string, number> = {};
    const directories: Record<string, number> = {};

    async function analyzeDirectory(dir: string, server: ObsidianMCPServer): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (server.isExcluded(fullPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          if (detailed) {
            const relativePath = path.relative(server.config!.obsidianVaultPath, fullPath);
            directories[relativePath] = 0;
          }
          await analyzeDirectory(fullPath, server);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          fileTypes[ext] = (fileTypes[ext] || 0) + 1;

          if (ext === '.md') {
            noteCount++;
          }

          try {
            const stats = await fs.stat(fullPath);
            totalSize += stats.size;

            if (detailed) {
              const dirPath = path.relative(server.config!.obsidianVaultPath, path.dirname(fullPath));
              directories[dirPath || '.'] = (directories[dirPath || '.'] || 0) + 1;
            }
          } catch (error) {
            console.error(`Error getting stats for ${fullPath}:`, error);
          }
        }
      }
    }

    await analyzeDirectory(this.config!.obsidianVaultPath, this);

    const vaultStats: VaultStats & { directories?: Record<string, number> } = {
      vaultPath: this.config!.obsidianVaultPath,
      noteCount: noteCount,
      totalSizeBytes: totalSize,
      totalSizeMB: Math.round(totalSize / 1024 / 1024 * 100) / 100,
      fileTypes: fileTypes,
      lastAnalyzed: new Date().toISOString()
    };

    if (detailed) {
      vaultStats.directories = directories;
    }

    return this.formatResponse(vaultStats);
  }

  private async getNoteContent(args: any) {
    const { notePath, includeMetadata = true } = args;

    // Handle both absolute and relative paths
    let fullPath: string;
    if (path.isAbsolute(notePath)) {
      fullPath = notePath;
    } else {
      fullPath = path.resolve(this.config!.obsidianVaultPath, notePath);
    }

    // Security check - ensure path is within vault
    if (!fullPath.startsWith(path.resolve(this.config!.obsidianVaultPath))) {
      throw new Error("Path traversal not allowed - path must be within vault");
    }

    // Add .md extension if not present
    if (!fullPath.endsWith('.md')) {
      fullPath += '.md';
    }

    try {
      const content = await fs.readFile(fullPath, 'utf-8');

      const noteData: any = {
        path: path.relative(this.config!.obsidianVaultPath, fullPath),
        content: content
      };

      if (includeMetadata) {
        const stats = await fs.stat(fullPath);
        noteData.metadata = {
          size: stats.size,
          sizeFormatted: `${Math.round(stats.size / 1024 * 100) / 100} KB`,
          modified: stats.mtime.toISOString(),
          created: stats.birthtime.toISOString(),
          lines: content.split('\n').length,
          words: content.split(/\s+/).filter(word => word.length > 0).length,
          characters: content.length
        };
      }

      return this.formatResponse(noteData);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Note not found: ${notePath}`);
      }
      throw error;
    }
  }

  private async listRecentNotes(args: any = {}) {
    const { limit = 10, days = 30 } = args;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const notes: Array<{
      path: string;
      title: string;
      modified: Date;
      size: number;
      preview: string;
    }> = [];

    async function collectNotes(dir: string, server: ObsidianMCPServer): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (server.isExcluded(fullPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await collectNotes(fullPath, server);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const stats = await fs.stat(fullPath);

            if (stats.mtime >= cutoffDate) {
              const relativePath = path.relative(server.config!.obsidianVaultPath, fullPath);
              const content = await fs.readFile(fullPath, 'utf-8');
              const preview = content.split('\n').slice(0, 3).join(' ').substring(0, 200) + '...';

              notes.push({
                path: relativePath,
                title: entry.name.replace('.md', ''),
                modified: stats.mtime,
                size: stats.size,
                preview: preview
              });
            }
          } catch (error) {
            console.error(`Error getting stats for ${fullPath}:`, error);
          }
        }
      }
    }

    await collectNotes(this.config!.obsidianVaultPath, this);

    const recentNotes = notes
      .sort((a, b) => b.modified.getTime() - a.modified.getTime())
      .slice(0, limit)
      .map(note => ({
        path: note.path,
        title: note.title,
        modified: note.modified.toISOString(),
        size: note.size,
        sizeFormatted: `${Math.round(note.size / 1024 * 100) / 100} KB`,
        preview: note.preview
      }));

    const result = {
      recentNotes: recentNotes,
      totalCount: notes.length,
      cutoffDate: cutoffDate.toISOString(),
      vaultPath: this.config!.obsidianVaultPath
    };

    return this.formatResponse(result);
  }

  private async getNoteLinks(args: any) {
    const { notePath, includeBacklinks = true } = args;

    let fullPath: string;
    if (path.isAbsolute(notePath)) {
      fullPath = notePath;
    } else {
      fullPath = path.resolve(this.config!.obsidianVaultPath, notePath);
    }

    if (!fullPath.startsWith(path.resolve(this.config!.obsidianVaultPath))) {
      throw new Error("Path traversal not allowed");
    }

    if (!fullPath.endsWith('.md')) {
      fullPath += '.md';
    }

    try {
      const content = await fs.readFile(fullPath, 'utf-8');

      // Extract internal links [[link]] and [text](link.md)
      const internalLinks: string[] = [];
      const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
      const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;

      let match;
      while ((match = wikiLinkRegex.exec(content)) !== null) {
        internalLinks.push(match[1]);
      }

      while ((match = markdownLinkRegex.exec(content)) !== null) {
        internalLinks.push(match[2].replace('.md', ''));
      }

      const result: any = {
        notePath: path.relative(this.config!.obsidianVaultPath, fullPath),
        outgoingLinks: [...new Set(internalLinks)],
        linkCount: internalLinks.length,
        uniqueLinkCount: [...new Set(internalLinks)].length
      };

      if (includeBacklinks) {
        const backlinks = await this.findBacklinks(path.relative(this.config!.obsidianVaultPath, fullPath));
        result.incomingLinks = backlinks;
        result.backlinkCount = backlinks.length;
      }

      return this.formatResponse(result);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Note not found: ${notePath}`);
      }
      throw error;
    }
  }

  private async findBacklinks(targetNotePath: string): Promise<string[]> {
    const backlinks: string[] = [];
    const targetName = path.basename(targetNotePath, '.md');

    async function searchForBacklinks(dir: string, server: ObsidianMCPServer): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (server.isExcluded(fullPath)) {
          continue;
        }

        if (entry.isDirectory()) {
          await searchForBacklinks(fullPath, server);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const relativePath = path.relative(server.config!.obsidianVaultPath, fullPath);

            // Skip self-references
            if (relativePath === targetNotePath) {
              continue;
            }

            // Check for various link formats
            const hasWikiLink = content.includes(`[[${targetName}]]`) || content.includes(`[[${targetNotePath}]]`);
            const hasMarkdownLink = content.includes(`](${targetNotePath})`) || content.includes(`](${targetName}.md)`);

            if (hasWikiLink || hasMarkdownLink) {
              backlinks.push(relativePath);
            }
          } catch (error) {
            console.error(`Error reading file ${fullPath}:`, error);
          }
        }
      }
    }

    await searchForBacklinks(this.config!.obsidianVaultPath, this);
    return backlinks;
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Obsidian MCP Server (Perplexity-compatible) running on stdio");
  }
}

// Main execution
const server = new ObsidianMCPServer();
server.run().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});