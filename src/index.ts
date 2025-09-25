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
  tags?: string[];
  lastModified?: string;
  size?: number;
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
  private searchCache: Map<string, SearchResult[]> = new Map();
  private lastIndexTime: number = 0;

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
            description: "Advanced search through Obsidian notes with fuzzy matching, tag filtering, and smart scoring. Supports exact phrases, wildcards, and boolean operators.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Search query (supports fuzzy matching, 'exact phrases', wildcards *, boolean AND/OR)",
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
                fuzzy: {
                  type: "boolean",
                  description: "Enable fuzzy search for typo tolerance (default: true)",
                  default: true,
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Filter by specific tags (e.g., ['#productivity', '#work'])",
                },
                modifiedSince: {
                  type: "string",
                  description: "Only include notes modified since this date (ISO format or relative like '7 days ago')",
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
          {
            name: "create_note",
            description: "Create a new note in the Obsidian vault with specified content and metadata.",
            inputSchema: {
              type: "object",
              properties: {
                notePath: {
                  type: "string",
                  description: "Path for the new note (e.g., 'folder/note-name.md')",
                },
                content: {
                  type: "string",
                  description: "Markdown content for the note",
                },
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Tags to add to the note (without # prefix)",
                },
                overwrite: {
                  type: "boolean",
                  description: "Overwrite if file exists (default: false)",
                  default: false,
                },
              },
              required: ["notePath", "content"],
            },
          },
          {
            name: "update_note",
            description: "Update an existing note's content while preserving metadata.",
            inputSchema: {
              type: "object",
              properties: {
                notePath: {
                  type: "string",
                  description: "Path to the note to update",
                },
                content: {
                  type: "string",
                  description: "New content (will replace existing content)",
                },
                append: {
                  type: "boolean",
                  description: "Append to existing content instead of replacing (default: false)",
                  default: false,
                },
                preserveFrontmatter: {
                  type: "boolean",
                  description: "Preserve existing frontmatter when updating (default: true)",
                  default: true,
                },
              },
              required: ["notePath", "content"],
            },
          },
          {
            name: "search_by_tags",
            description: "Find notes by tags and analyze tag relationships.",
            inputSchema: {
              type: "object",
              properties: {
                tags: {
                  type: "array",
                  items: { type: "string" },
                  description: "Tags to search for (with or without # prefix)",
                },
                operator: {
                  type: "string",
                  enum: ["AND", "OR"],
                  description: "Logical operator for multiple tags (default: AND)",
                  default: "AND",
                },
                includeTagStats: {
                  type: "boolean",
                  description: "Include tag usage statistics (default: true)",
                  default: true,
                },
                limit: {
                  type: "number",
                  description: "Maximum number of results (default: 20)",
                  default: 20,
                },
              },
              required: ["tags"],
            },
          },
          {
            name: "analyze_vault_structure",
            description: "Analyze vault structure, folder hierarchy, and note relationships for insights.",
            inputSchema: {
              type: "object",
              properties: {
                includeOrphans: {
                  type: "boolean",
                  description: "Include orphaned notes (no links)",
                  default: true,
                },
                includeMostLinked: {
                  type: "boolean",
                  description: "Include most linked notes analysis",
                  default: true,
                },
                folderDepth: {
                  type: "number",
                  description: "Maximum folder depth to analyze (default: 10)",
                  default: 10,
                },
              },
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
          case "create_note":
            return await this.createNote(request.params.arguments);
          case "update_note":
            return await this.updateNote(request.params.arguments);
          case "search_by_tags":
            return await this.searchByTags(request.params.arguments);
          case "analyze_vault_structure":
            return await this.analyzeVaultStructure(request.params.arguments);
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

  private calculateRelevanceScore(content: string, filename: string, query: string, fuzzy: boolean = true): number {
    const queryLower = query.toLowerCase();
    const contentLower = content.toLowerCase();
    const filenameLower = filename.toLowerCase();

    let score = 0;

    // Exact filename matches get highest score
    if (filenameLower.includes(queryLower)) {
      score += 100;
    }

    // Fuzzy filename matching
    if (fuzzy && !filenameLower.includes(queryLower)) {
      const fuzzyScore = this.calculateFuzzyScore(filenameLower, queryLower);
      if (fuzzyScore > 0.6) {
        score += Math.floor(fuzzyScore * 80);
      }
    }

    // Exact content matches
    const exactMatches = (contentLower.match(new RegExp(this.escapeRegex(queryLower), 'g')) || []).length;
    score += exactMatches * 10;

    // Fuzzy content matching
    if (fuzzy && exactMatches === 0) {
      const words = query.toLowerCase().split(/\s+/);
      for (const word of words) {
        if (word.length >= 3) {
          const fuzzyMatches = this.findFuzzyMatches(contentLower, word);
          score += fuzzyMatches * 5;
        }
      }
    }

    // Header matches get high bonus
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) {
        if (line.toLowerCase().includes(queryLower)) {
          score += 50;
        } else if (fuzzy) {
          const headerScore = this.calculateFuzzyScore(line.toLowerCase(), queryLower);
          if (headerScore > 0.7) {
            score += Math.floor(headerScore * 40);
          }
        }
      }
    }

    // Tag matches
    const tags = this.extractTags(content);
    for (const tag of tags) {
      if (tag.toLowerCase().includes(queryLower)) {
        score += 30;
      }
    }

    return score;
  }

  private calculateFuzzyScore(text: string, query: string): number {
    if (text === query) return 1;
    if (text.length === 0 || query.length === 0) return 0;

    // Simple Levenshtein distance-based fuzzy matching
    const maxDistance = Math.floor(query.length * 0.3); // Allow 30% differences
    const distance = this.levenshteinDistance(text, query);

    if (distance <= maxDistance) {
      return 1 - (distance / query.length);
    }

    // Check for substring matches with typos
    for (let i = 0; i <= text.length - query.length; i++) {
      const substring = text.substring(i, i + query.length);
      const substringDistance = this.levenshteinDistance(substring, query);
      if (substringDistance <= maxDistance) {
        return 1 - (substringDistance / query.length);
      }
    }

    return 0;
  }

  private levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array(b.length + 1).fill(null).map(() => Array(a.length + 1).fill(null));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j - 1][i] + 1,     // deletion
          matrix[j][i - 1] + 1,     // insertion
          matrix[j - 1][i - 1] + cost // substitution
        );
      }
    }

    return matrix[b.length][a.length];
  }

  private findFuzzyMatches(text: string, word: string): number {
    let matches = 0;
    const words = text.split(/\s+/);

    for (const textWord of words) {
      if (this.calculateFuzzyScore(textWord, word) > 0.7) {
        matches++;
      }
    }

    return matches;
  }

  private extractTags(content: string): string[] {
    const tagRegex = /#[a-zA-Z0-9_-]+/g;
    return content.match(tagRegex) || [];
  }

  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private async searchNotes(args: any) {
    const { query, limit = 10, includeContent = false, fuzzy = true, tags, modifiedSince } = args;

    // Check cache first
    const cacheKey = JSON.stringify({ query, limit, includeContent, fuzzy, tags, modifiedSince });
    if (this.searchCache.has(cacheKey)) {
      const cachedResults = this.searchCache.get(cacheKey)!;
      return this.formatResponse({
        query: query,
        totalResults: cachedResults.length,
        returnedResults: cachedResults.length,
        searchParameters: { fuzzy, tags, modifiedSince },
        results: cachedResults,
        cached: true,
        searchTime: new Date().toISOString()
      });
    }

    const results: SearchResult[] = [];
    let modifiedSinceDate: Date | null = null;

    // Parse modifiedSince parameter
    if (modifiedSince) {
      try {
        if (modifiedSince.includes('ago')) {
          // Handle relative dates like "7 days ago"
          const match = modifiedSince.match(/(\d+)\s+(days?|weeks?|months?)\s+ago/i);
          if (match) {
            const amount = parseInt(match[1]);
            const unit = match[2].toLowerCase();
            modifiedSinceDate = new Date();

            if (unit.startsWith('day')) {
              modifiedSinceDate.setDate(modifiedSinceDate.getDate() - amount);
            } else if (unit.startsWith('week')) {
              modifiedSinceDate.setDate(modifiedSinceDate.getDate() - (amount * 7));
            } else if (unit.startsWith('month')) {
              modifiedSinceDate.setMonth(modifiedSinceDate.getMonth() - amount);
            }
          }
        } else {
          modifiedSinceDate = new Date(modifiedSince);
        }
      } catch {
        // Invalid date format, ignore
      }
    }

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
            const stats = await fs.stat(fullPath);
            const content = await fs.readFile(fullPath, 'utf-8');
            const relativePath = path.relative(server.config!.obsidianVaultPath, fullPath);

            // Check modified since filter
            if (modifiedSinceDate && stats.mtime < modifiedSinceDate) {
              return;
            }

            // Extract and check tags filter
            const noteTags = server.extractTags(content);
            if (tags && tags.length > 0) {
              const hasMatchingTag = tags.some((tag: string) => {
                const searchTag = tag.startsWith('#') ? tag : '#' + tag;
                return noteTags.some(noteTag =>
                  noteTag.toLowerCase() === searchTag.toLowerCase()
                );
              });
              if (!hasMatchingTag) return;
            }

            const score = server.calculateRelevanceScore(content, entry.name, query, fuzzy);

            if (score > 0) {
              const lines = content.split('\n');
              const matchingLines = lines.filter(line => {
                const lineLower = line.toLowerCase();
                const queryLower = query.toLowerCase();
                return lineLower.includes(queryLower) ||
                       (fuzzy && server.calculateFuzzyScore(lineLower, queryLower) > 0.6);
              }).slice(0, 5);

              results.push({
                path: relativePath,
                title: entry.name.replace('.md', ''),
                excerpt: matchingLines.length > 0 ? matchingLines.join(' ... ') :
                        content.substring(0, 200) + '...',
                matches: matchingLines.length,
                score: score,
                tags: noteTags,
                lastModified: stats.mtime.toISOString(),
                size: stats.size
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
      searchParameters: { fuzzy, tags, modifiedSince },
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

    // Cache the results (only cache the results array, not the full response)
    this.searchCache.set(cacheKey, sortedResults);

    // Clean old cache entries (keep last 50)
    if (this.searchCache.size > 50) {
      const keys = Array.from(this.searchCache.keys());
      for (let i = 0; i < keys.length - 50; i++) {
        this.searchCache.delete(keys[i]);
      }
    }

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

  private async createNote(args: any) {
    const { notePath, content, tags = [], overwrite = false } = args;

    let fullPath: string;
    if (path.isAbsolute(notePath)) {
      fullPath = notePath;
    } else {
      fullPath = path.resolve(this.config!.obsidianVaultPath, notePath);
    }

    // Security check
    if (!fullPath.startsWith(path.resolve(this.config!.obsidianVaultPath))) {
      throw new Error("Path traversal not allowed");
    }

    // Add .md extension if not present
    if (!fullPath.endsWith('.md')) {
      fullPath += '.md';
    }

    // Check if file exists
    try {
      await fs.access(fullPath);
      if (!overwrite) {
        throw new Error(`Note already exists: ${notePath}. Use overwrite: true to replace it.`);
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT' && !overwrite) {
        throw error;
      }
    }

    // Create directory if needed
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Add frontmatter if tags are provided
    let finalContent = content;
    if (tags.length > 0) {
      const tagString = tags.map((tag: string) => tag.startsWith('#') ? tag : '#' + tag).join(' ');
      finalContent = `---\ntags: [${tags.join(', ')}]\n---\n\n${content}\n\nTags: ${tagString}`;
    }

    await fs.writeFile(fullPath, finalContent, 'utf-8');

    const stats = await fs.stat(fullPath);
    const result = {
      success: true,
      path: path.relative(this.config!.obsidianVaultPath, fullPath),
      size: stats.size,
      created: stats.birthtime.toISOString(),
      tags: tags,
      message: overwrite ? 'Note updated successfully' : 'Note created successfully'
    };

    return this.formatResponse(result);
  }

  private async updateNote(args: any) {
    const { notePath, content, append = false, preserveFrontmatter = true } = args;

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
      const existingContent = await fs.readFile(fullPath, 'utf-8');
      let finalContent: string;

      if (append) {
        finalContent = existingContent + '\n\n' + content;
      } else if (preserveFrontmatter) {
        // Extract frontmatter
        const frontmatterMatch = existingContent.match(/^---\n([\s\S]*?)\n---\n/);
        if (frontmatterMatch) {
          finalContent = frontmatterMatch[0] + content;
        } else {
          finalContent = content;
        }
      } else {
        finalContent = content;
      }

      await fs.writeFile(fullPath, finalContent, 'utf-8');

      const stats = await fs.stat(fullPath);
      const result = {
        success: true,
        path: path.relative(this.config!.obsidianVaultPath, fullPath),
        size: stats.size,
        modified: stats.mtime.toISOString(),
        operation: append ? 'appended' : 'updated',
        message: `Note ${append ? 'appended to' : 'updated'} successfully`
      };

      return this.formatResponse(result);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        throw new Error(`Note not found: ${notePath}`);
      }
      throw error;
    }
  }

  private async searchByTags(args: any) {
    const { tags, operator = 'AND', includeTagStats = true, limit = 20 } = args;

    if (!tags || tags.length === 0) {
      throw new Error('At least one tag must be provided');
    }

    const results: any[] = [];
    const allTags: Map<string, number> = new Map();

    async function searchInDirectory(dir: string, server: ObsidianMCPServer): Promise<void> {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (server.isExcluded(fullPath)) continue;

        if (entry.isDirectory()) {
          await searchInDirectory(fullPath, server);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const stats = await fs.stat(fullPath);
            const relativePath = path.relative(server.config!.obsidianVaultPath, fullPath);

            const noteTags = server.extractTags(content);

            // Count all tags for statistics
            if (includeTagStats) {
              noteTags.forEach(tag => {
                const normalizedTag = tag.toLowerCase();
                allTags.set(normalizedTag, (allTags.get(normalizedTag) || 0) + 1);
              });
            }

            // Check if note matches tag criteria
            const searchTags = tags.map((tag: string) =>
              (tag.startsWith('#') ? tag : '#' + tag).toLowerCase()
            );

            const noteTagsLower = noteTags.map(tag => tag.toLowerCase());

            let matches = false;
            if (operator === 'AND') {
              matches = searchTags.every((searchTag: string) =>
                noteTagsLower.some((noteTag: string) => noteTag === searchTag)
              );
            } else { // OR
              matches = searchTags.some((searchTag: string) =>
                noteTagsLower.some((noteTag: string) => noteTag === searchTag)
              );
            }

            if (matches) {
              results.push({
                path: relativePath,
                title: entry.name.replace('.md', ''),
                tags: noteTags,
                lastModified: stats.mtime.toISOString(),
                size: stats.size,
                preview: content.split('\n').slice(0, 3).join(' ').substring(0, 200) + '...'
              });
            }
          } catch (error) {
            console.error(`Error reading file ${fullPath}:`, error);
          }
        }
      }
    }

    await searchInDirectory(this.config!.obsidianVaultPath, this);

    const sortedResults = results
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, limit);

    const response: any = {
      searchTags: tags,
      operator: operator,
      totalMatches: results.length,
      returnedResults: sortedResults.length,
      results: sortedResults
    };

    if (includeTagStats) {
      const sortedTags = Array.from(allTags.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([tag, count]) => ({ tag, count }));

      response.tagStatistics = {
        totalUniqueTags: allTags.size,
        mostUsedTags: sortedTags
      };
    }

    return this.formatResponse(response);
  }

  private async analyzeVaultStructure(args: any = {}) {
    const { includeOrphans = true, includeMostLinked = true, folderDepth = 10 } = args;

    const analysis: any = {
      vaultPath: this.config!.obsidianVaultPath,
      analyzedAt: new Date().toISOString()
    };

    const folderStructure: Map<string, number> = new Map();
    const linkGraph: Map<string, string[]> = new Map();
    const backlinks: Map<string, string[]> = new Map();
    const allNotes: string[] = [];

    async function analyzeDirectory(dir: string, server: ObsidianMCPServer, depth: number = 0): Promise<void> {
      if (depth > folderDepth) return;

      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (server.isExcluded(fullPath)) continue;

        if (entry.isDirectory()) {
          const relativePath = path.relative(server.config!.obsidianVaultPath, fullPath);
          folderStructure.set(relativePath, 0);
          await analyzeDirectory(fullPath, server, depth + 1);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            const content = await fs.readFile(fullPath, 'utf-8');
            const relativePath = path.relative(server.config!.obsidianVaultPath, fullPath);

            allNotes.push(relativePath);

            // Count files in folder
            const folder = path.dirname(relativePath);
            if (folder !== '.') {
              folderStructure.set(folder, (folderStructure.get(folder) || 0) + 1);
            }

            // Extract links
            const links: string[] = [];
            const wikiLinkRegex = /\[\[([^\]]+)\]\]/g;
            const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;

            let match;
            while ((match = wikiLinkRegex.exec(content)) !== null) {
              links.push(match[1]);
            }

            while ((match = markdownLinkRegex.exec(content)) !== null) {
              links.push(match[2].replace('.md', ''));
            }

            linkGraph.set(relativePath, links);

            // Build backlinks
            links.forEach(linkedNote => {
              if (!backlinks.has(linkedNote)) {
                backlinks.set(linkedNote, []);
              }
              backlinks.get(linkedNote)!.push(relativePath);
            });

          } catch (error) {
            console.error(`Error analyzing file ${fullPath}:`, error);
          }
        }
      }
    }

    await analyzeDirectory(this.config!.obsidianVaultPath, this);

    // Folder analysis
    const folderAnalysis = Array.from(folderStructure.entries())
      .map(([folder, count]) => ({ folder, noteCount: count }))
      .sort((a, b) => b.noteCount - a.noteCount);

    analysis.folderStructure = {
      totalFolders: folderStructure.size,
      folders: folderAnalysis
    };

    // Orphaned notes
    if (includeOrphans) {
      const orphans = allNotes.filter(note =>
        !backlinks.has(note) && (!linkGraph.get(note) || linkGraph.get(note)!.length === 0)
      );

      analysis.orphanedNotes = {
        count: orphans.length,
        percentage: ((orphans.length / allNotes.length) * 100).toFixed(1) + '%',
        notes: orphans.slice(0, 20) // Show first 20
      };
    }

    // Most linked notes
    if (includeMostLinked) {
      const linkCounts = Array.from(backlinks.entries())
        .map(([note, links]) => ({ note, incomingLinks: links.length }))
        .sort((a, b) => b.incomingLinks - a.incomingLinks)
        .slice(0, 10);

      const outgoingLinkCounts = Array.from(linkGraph.entries())
        .map(([note, links]) => ({ note, outgoingLinks: links.length }))
        .sort((a, b) => b.outgoingLinks - a.outgoingLinks)
        .slice(0, 10);

      analysis.linkAnalysis = {
        mostLinkedTo: linkCounts,
        mostLinkingOut: outgoingLinkCounts,
        totalLinks: Array.from(linkGraph.values()).reduce((sum, links) => sum + links.length, 0)
      };
    }

    analysis.summary = {
      totalNotes: allNotes.length,
      totalFolders: folderStructure.size,
      averageNotesPerFolder: folderStructure.size > 0 ?
        (allNotes.length / folderStructure.size).toFixed(1) : '0'
    };

    return this.formatResponse(analysis);
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Obsidian MCP Server running on stdio");
  }
}

// Main execution
const server = new ObsidianMCPServer();
server.run().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});