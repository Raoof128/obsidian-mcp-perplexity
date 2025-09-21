# API Documentation

Complete technical reference for the Obsidian MCP server tools and responses.

## Response Format

All tools return responses in Perplexity's required format:

```typescript
interface PerplexityResponse {
  content: Array<{
    type: "text";
    text: string;
  }>;
}
```

The `text` field contains either:
- Plain text for simple responses
- JSON string for structured data

## Tools Reference

### search_notes

Search through vault contents and filenames with relevance scoring.

#### Input Schema
```typescript
{
  query: string;           // Required: Search terms
  limit?: number;          // Optional: Max results (default: 10)
  includeContent?: boolean; // Optional: Include full content (default: false)
}
```

#### Response Structure
```typescript
{
  query: string;
  totalResults: number;
  returnedResults: number;
  results: Array<{
    path: string;        // Relative path from vault root
    title: string;       // Filename without .md extension
    excerpt: string;     // Matching lines preview
    matches: number;     // Number of matching lines
    score: number;       // Relevance score
    content?: string;    // Full content (if includeContent: true)
  }>;
  searchTime: string;    // ISO timestamp
}
```

#### Scoring Algorithm
- Filename matches: +100 points
- Content matches: +10 points per occurrence
- Header matches (lines starting with #): +50 points

#### Examples

**Basic Search**
```json
{
  "query": "productivity",
  "limit": 5
}
```

**Search with Content**
```json
{
  "query": "machine learning",
  "limit": 3,
  "includeContent": true
}
```

### get_vault_stats

Get comprehensive vault statistics and analysis.

#### Input Schema
```typescript
{
  detailed?: boolean; // Optional: Include directory breakdown (default: false)
}
```

#### Response Structure
```typescript
{
  vaultPath: string;
  noteCount: number;
  totalSizeBytes: number;
  totalSizeMB: number;
  fileTypes: Record<string, number>; // Extension -> count
  lastAnalyzed: string;              // ISO timestamp
  directories?: Record<string, number>; // Path -> file count (if detailed: true)
}
```

#### Examples

**Basic Stats**
```json
{}
```

**Detailed Analysis**
```json
{
  "detailed": true
}
```

### get_note_content

Retrieve full content of a specific note with metadata.

#### Input Schema
```typescript
{
  notePath: string;           // Required: Path relative to vault
  includeMetadata?: boolean;  // Optional: Include file metadata (default: true)
}
```

#### Path Handling
- Relative paths are resolved from vault root
- `.md` extension is added if missing
- Absolute paths are converted to relative
- Path traversal attempts are blocked

#### Response Structure
```typescript
{
  path: string;     // Relative path from vault root
  content: string;  // Full file content
  metadata?: {      // If includeMetadata: true
    size: number;
    sizeFormatted: string;
    modified: string;    // ISO timestamp
    created: string;     // ISO timestamp
    lines: number;
    words: number;
    characters: number;
  };
}
```

#### Examples

**Get Note**
```json
{
  "notePath": "daily/2024-01-15.md"
}
```

**Without Metadata**
```json
{
  "notePath": "projects/website",
  "includeMetadata": false
}
```

### list_recent_notes

List recently modified notes sorted by modification time.

#### Input Schema
```typescript
{
  limit?: number; // Optional: Max results (default: 10)
  days?: number;  // Optional: Only include notes modified within N days (default: 30)
}
```

#### Response Structure
```typescript
{
  recentNotes: Array<{
    path: string;         // Relative path from vault root
    title: string;        // Filename without .md
    modified: string;     // ISO timestamp
    size: number;         // File size in bytes
    sizeFormatted: string; // Human-readable size
    preview: string;      // First 200 characters + "..."
  }>;
  totalCount: number;     // Total notes in time range
  cutoffDate: string;     // ISO timestamp of oldest included date
  vaultPath: string;
}
```

#### Examples

**Recent Notes**
```json
{
  "limit": 5
}
```

**Last Week**
```json
{
  "limit": 20,
  "days": 7
}
```

### get_note_links

Analyze internal links within a note and find backlinks.

#### Input Schema
```typescript
{
  notePath: string;            // Required: Path to note
  includeBacklinks?: boolean;  // Optional: Find notes linking to this one (default: true)
}
```

#### Link Detection
Supports these formats:
- Wiki links: `[[Note Name]]`
- Markdown links: `[Display Text](note.md)`
- Both absolute and relative paths

#### Response Structure
```typescript
{
  notePath: string;
  outgoingLinks: string[];     // Links from this note
  linkCount: number;           // Total links (including duplicates)
  uniqueLinkCount: number;     // Unique links only
  incomingLinks?: string[];    // Notes linking to this one (if includeBacklinks: true)
  backlinkCount?: number;      // Count of incoming links
}
```

#### Examples

**Link Analysis**
```json
{
  "notePath": "projects/overview.md"
}
```

**Without Backlinks**
```json
{
  "notePath": "daily/2024-01-15.md",
  "includeBacklinks": false
}
```

## Error Handling

### Error Response Format
```typescript
{
  content: [{
    type: "text",
    text: JSON.stringify({
      error: string;
      tool: string;
      timestamp: string;
    })
  }]
}
```

### Common Errors

**Configuration Errors**
- `OBSIDIAN_MCP_CONFIG environment variable not set`
- `obsidianVaultPath not specified in config`
- `Obsidian vault not found at: [path]`

**File Access Errors**
- `Note not found: [path]`
- `Path traversal not allowed`
- `Permission denied`

**Tool Errors**
- `Unknown tool: [toolName]`

## Security Features

### Path Security
- All file access restricted to vault directory
- Path traversal attempts blocked
- Relative path resolution enforced

### File Filtering
Default exclude patterns:
- `.obsidian/**` - Obsidian configuration
- `*.tmp` - Temporary files
- `*.bak` - Backup files
- `.trash/**` - Deleted files

### Read-Only Access
- Server never writes or modifies files
- Only read operations permitted
- No file system manipulation

## Performance Considerations

### Search Performance
- Linear scan through all files
- Pattern matching on content
- Relevance scoring computation
- Results sorted by score

### Large Vault Optimization
- Use exclude patterns for irrelevant folders
- Limit search results appropriately
- Consider file size when including content

### Memory Usage
- Files read on-demand
- No persistent caching (currently)
- Minimal memory footprint

## Configuration Options

### Main Config Schema
```typescript
interface ObsidianConfig {
  obsidianVaultPath: string;      // Required: Absolute path to vault
  excludePatterns?: string[];     // Optional: Glob patterns to ignore
  maxSearchResults?: number;      // Optional: Global search limit (default: 20)
  enableIndexing?: boolean;       // Optional: Reserved for future use (default: true)
}
```

### Environment Variables
- `OBSIDIAN_MCP_CONFIG` - Path to configuration file
- `DEBUG` - Enable debug logging (future)

## Integration Examples

### Basic Query Flow
1. Perplexity sends tool call request
2. Server loads configuration
3. Tool executes with parameters
4. Response formatted for Perplexity
5. JSON-RPC response sent back

### Search Flow
```
User: "Search for productivity tips"
↓
Tool: search_notes
Parameters: { query: "productivity tips", limit: 10 }
↓
Server: Scans vault files, scores matches, sorts results
↓
Response: { content: [{ type: "text", text: "{...search results...}" }] }
```

### Error Flow
```
User: "Get note that-doesnt-exist.md"
↓
Tool: get_note_content
Parameters: { notePath: "that-doesnt-exist.md" }
↓
Server: File not found
↓
Response: { content: [{ type: "text", text: "{error: 'Note not found: ...'}" }] }
```

---

**Note**: This API is optimized for Perplexity's MCP implementation and may differ from standard MCP response formats used by other clients.