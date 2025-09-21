# Obsidian MCP for Perplexity

A production-ready Model Context Protocol (MCP) server that enables Perplexity to interact with your Obsidian vault. Search notes, get vault statistics, analyze note connections, and more - all through natural language queries in Perplexity.

## Features

- 🔍 **Intelligent Search** - Search through notes with relevance scoring
- 📊 **Vault Analytics** - Get comprehensive vault statistics
- 📄 **Note Access** - Read individual notes with metadata
- 🕒 **Recent Activity** - Track recently modified notes
- 🔗 **Link Analysis** - Analyze note connections and backlinks
- 🛡️ **Security** - Path traversal protection and safe file access
- ⚡ **Performance** - Efficient file scanning and caching

## Quick Start

### 1. Installation

```bash
cd obsidian-mcp-perplexity
npm install
npm run setup
```

The setup script will:
- Check Node.js version (requires 18+)
- Prompt for your Obsidian vault path
- Install dependencies and build the project
- Generate Perplexity configuration

### 2. Configure in Perplexity

1. Open Perplexity settings
2. Navigate to **Model Context Protocol (MCP)**
3. Add a new server with these settings:

```
Name: obsidian-vault
Command: node /absolute/path/to/obsidian-mcp-perplexity/dist/index.js
Environment: OBSIDIAN_MCP_CONFIG=/Users/yourname/.obsidian-mcp/config.json
```

### 3. Test the Connection

```bash
npm run test
```

### 4. Use in Perplexity

Try these queries:
- "Search my Obsidian vault for productivity tips"
- "Show me my vault statistics"
- "List my 10 most recent notes"
- "Get the content of my daily planning note"
- "Show me all notes that link to my project ideas"

## Available Tools

### search_notes
Search through your vault by content and filename with intelligent relevance scoring.

**Parameters:**
- `query` (required): Search terms
- `limit` (optional): Max results (default: 10)
- `includeContent` (optional): Include full note content

**Example:** "Search for 'machine learning' in my notes"

### get_vault_stats
Get comprehensive statistics about your vault.

**Parameters:**
- `detailed` (optional): Include directory breakdown

**Example:** "Show me my vault statistics"

### get_note_content
Retrieve the full content of a specific note.

**Parameters:**
- `notePath` (required): Path to note (with or without .md)
- `includeMetadata` (optional): Include file metadata

**Example:** "Get the content of my daily/2024-01-15 note"

### list_recent_notes
List recently modified notes sorted by date.

**Parameters:**
- `limit` (optional): Max results (default: 10)
- `days` (optional): Only notes modified within N days (default: 30)

**Example:** "Show me my 5 most recent notes"

### get_note_links
Analyze internal links within a note.

**Parameters:**
- `notePath` (required): Path to note
- `includeBacklinks` (optional): Include notes linking to this one

**Example:** "Show me all links in my project planning note"

## Configuration

### Main Config (`~/.obsidian-mcp/config.json`)

```json
{
  "obsidianVaultPath": "/Users/yourname/Documents/ObsidianVault",
  "excludePatterns": [
    ".obsidian/**",
    "*.tmp",
    "*.bak",
    ".trash/**"
  ],
  "maxSearchResults": 20,
  "enableIndexing": true
}
```

### Advanced Configuration

**excludePatterns**: Glob patterns for files/folders to ignore
**maxSearchResults**: Maximum search results to return
**enableIndexing**: Enable future indexing features (reserved)

## Project Structure

```
obsidian-mcp-perplexity/
├── src/
│   └── index.ts          # Main MCP server
├── config/
│   └── default.json      # Default configuration
├── scripts/
│   ├── setup.js          # Interactive setup
│   └── test.js           # Test runner
├── docs/
│   ├── README.md         # This file
│   ├── PERPLEXITY.md     # Perplexity integration guide
│   └── API.md            # Detailed API documentation
├── dist/                 # Compiled JavaScript (after build)
├── package.json
└── tsconfig.json
```

## Development

### Building
```bash
npm run build
```

### Development Mode
```bash
npm run dev  # Watch mode
```

### Testing
```bash
npm run test
```

### Manual Testing
```bash
OBSIDIAN_MCP_CONFIG=~/.obsidian-mcp/config.json node dist/index.js
```

## Response Format

All tool responses use Perplexity's required format:

```typescript
{
  content: [{
    type: "text",
    text: "response data as JSON string or plain text"
  }]
}
```

This ensures compatibility with Perplexity's MCP implementation.

## Security

- **Path Traversal Protection**: All file access is restricted to the vault directory
- **Read-Only Access**: The server only reads files, never writes or modifies
- **Exclude Patterns**: Sensitive files (.obsidian config, etc.) are excluded by default
- **Error Handling**: Comprehensive error handling prevents information leakage

## Troubleshooting

### Common Issues

**"keyNotFound" errors in Perplexity**
- Check that responses use the correct Perplexity format
- Ensure the server is properly configured in Perplexity settings

**"Vault not found" errors**
- Verify the vault path in your config file
- Ensure the path exists and is accessible
- Use absolute paths, not relative ones

**"Permission denied" errors**
- Check file permissions on your vault directory
- Ensure the user running the server has read access

**Module/import errors**
- Ensure Node.js version is 18 or later
- Run `npm install` to install all dependencies
- Check that the project was built successfully

### Getting Help

1. Run `npm run test` to diagnose issues
2. Check the configuration in `~/.obsidian-mcp/config.json`
3. Verify vault path and permissions
4. Enable debug logging by setting `DEBUG=obsidian-mcp`

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests
5. Submit a pull request

---

**Note**: This MCP server is specifically designed for Perplexity's MCP implementation. While it follows the standard MCP protocol, the response format is optimized for Perplexity's requirements.