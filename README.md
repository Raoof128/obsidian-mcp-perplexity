# Obsidian MCP Server

A Model Context Protocol (MCP) server for Obsidian vault integration. Search and analyze your notes through natural language queries in Claude Desktop and other MCP-compatible applications.

## Features

- **🔍 Smart Search**: Search through your notes by content and filename with relevance scoring
- **📊 Vault Analytics**: Get comprehensive statistics about your vault (note count, file types, sizes)
- **📝 Note Access**: Read full content of specific notes with metadata
- **🕐 Recent Notes**: List recently modified notes with previews
- **🔗 Link Analysis**: Analyze note connections and backlinks
- **⚡ Fast Performance**: Optimized for large vaults with configurable exclusion patterns

## Quick Start

### Option 1: Claude Desktop Extension (Recommended)

1. **Build the Extension**:
   ```bash
   git clone https://github.com/Raoof128/obsidian-mcp-server.git
   cd obsidian-mcp-server
   npm install
   npm run build-extension
   ```

2. **Install in Claude Desktop**:
   - Open Claude Desktop
   - Go to Settings > Extensions
   - Click "Install from file"
   - Select the generated `.mcpb` file

3. **Configure**:
   - Set your Obsidian vault path in the extension settings
   - Restart Claude Desktop

### Option 2: Manual Setup

Run the automated setup script:

```bash
npm run setup-claude-desktop
```

This will:
- Check prerequisites
- Configure your vault path
- Build the project
- Update Claude Desktop configuration
- Create all necessary config files

## Usage Examples

Once configured, you can use these commands in Claude Desktop:

- **"Search my Obsidian vault for productivity tips"**
- **"Show me my vault statistics"**
- **"List my 10 most recent notes"**
- **"Get the content of my project planning note"**
- **"Show me all notes that link to my daily template"**
- **"Find notes about machine learning from the last month"**

## Configuration

### Vault Settings

The server can be configured with these options:

- `obsidianVaultPath`: Path to your Obsidian vault
- `maxSearchResults`: Maximum search results (default: 20)
- `enableIndexing`: Enable search indexing (default: true)
- `excludePatterns`: File patterns to exclude from searches

### Default Exclusions

By default, these patterns are excluded:
- `.obsidian/**` - Obsidian configuration files
- `*.tmp`, `*.bak` - Temporary files
- `.trash/**` - Obsidian trash folder
- `node_modules/**`, `.git/**` - Development files

## Advanced Usage

### Custom Configuration

Create a config file at `~/.obsidian-mcp/config.json`:

```json
{
  "obsidianVaultPath": "/path/to/your/vault",
  "maxSearchResults": 50,
  "enableIndexing": true,
  "excludePatterns": [
    ".obsidian/**",
    "*.tmp",
    "personal-private/**"
  ]
}
```

### Integration with Other MCP Clients

The server works with any MCP-compatible client. Add to your MCP configuration:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["path/to/obsidian-mcp-server/dist/index.js"],
      "env": {
        "OBSIDIAN_MCP_CONFIG": "path/to/config.json"
      }
    }
  }
}
```
