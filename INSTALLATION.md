# Installation Guide

This guide provides step-by-step instructions for installing and configuring the Obsidian MCP Server for Claude Desktop.

## Prerequisites

1. **Node.js 18 or later**: [Download from nodejs.org](https://nodejs.org/)
2. **Claude Desktop**: [Download from Claude.ai](https://claude.ai/download)
3. **Obsidian Vault**: An existing Obsidian vault or create a new one

## Installation Methods

### Method 1: Automated Setup (Recommended)

This is the easiest way to get started:

```bash
# 1. Clone the repository
git clone https://github.com/Raoof128/obsidian-mcp-perplexity.git
cd obsidian-mcp-perplexity

# 2. Install dependencies
npm install

# 3. Run the automated setup
npm run setup-claude-desktop
```

The setup script will:
- Check all prerequisites
- Prompt for your Obsidian vault path
- Build the project
- Configure Claude Desktop automatically
- Create all necessary configuration files

**After setup**: Restart Claude Desktop completely and look for the MCP indicator (🔌) in the chat input.

### Method 2: Extension Package

Build and install as a Claude Desktop extension:

```bash
# 1. Clone and build
git clone https://github.com/Raoof128/obsidian-mcp-perplexity.git
cd obsidian-mcp-perplexity
npm install
npm run build-extension

# 2. Install in Claude Desktop
# - Open Claude Desktop
# - Go to Settings > Extensions
# - Click "Install from file"
# - Select the generated .mcpb file
```

### Method 3: Manual Configuration

For advanced users who want full control:

#### Step 1: Build the Project

```bash
git clone https://github.com/Raoof128/obsidian-mcp-perplexity.git
cd obsidian-mcp-perplexity
npm install
npm run build
```

#### Step 2: Create Configuration

Create a configuration file at `~/.obsidian-mcp/config.json`:

```json
{
  "obsidianVaultPath": "/path/to/your/obsidian/vault",
  "maxSearchResults": 20,
  "enableIndexing": true,
  "excludePatterns": [
    ".obsidian/**",
    "*.tmp",
    "*.bak",
    ".trash/**"
  ]
}
```

#### Step 3: Configure Claude Desktop

Edit your Claude Desktop configuration file:

**Location**:
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\\Claude\\claude_desktop_config.json`

**Configuration**:
```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/full/path/to/obsidian-mcp-perplexity/dist/index.js"],
      "env": {
        "OBSIDIAN_MCP_CONFIG": "/path/to/.obsidian-mcp/config.json"
      }
    }
  }
}
```

#### Step 4: Restart Claude Desktop

Completely quit and restart Claude Desktop.

## Verification

After installation, verify the setup:

1. **Check MCP Indicator**: Look for a 🔌 icon in the Claude Desktop chat input
2. **Test Basic Commands**:
   - "Show me my vault statistics"
   - "Search my notes for [topic]"
   - "List my recent notes"

## Troubleshooting

### Common Issues

#### 1. No MCP Indicator Visible

**Solutions**:
- Ensure Claude Desktop is completely restarted (quit and reopen)
- Check the configuration file syntax (JSON must be valid)
- Verify all file paths are correct and accessible
- Check Claude Desktop logs for errors

#### 2. "Cannot connect to MCP server" Error

**Solutions**:
- Verify Node.js is installed: `node --version`
- Check that the built files exist in `dist/`
- Ensure the configuration file path is correct
- On Windows, use full path to Node.js: `"C:\\Program Files\\nodejs\\node.exe"`

#### 3. "Vault not found" Error

**Solutions**:
- Verify the vault path exists and is accessible
- Use absolute paths instead of relative paths
- Check file permissions for the vault directory
- Ensure the path doesn't contain special characters

#### 4. Search Returns No Results

**Solutions**:
- Check that your vault contains `.md` files
- Verify exclusion patterns aren't too restrictive
- Ensure the vault path is correctly set
- Try searching for content you know exists

### Windows-Specific Issues

#### NPX Command Issues

If you see "Cannot connect to MCP server" on Windows, update your configuration to use the full path:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\path\\to\\obsidian-mcp-perplexity\\dist\\index.js"],
      "env": {
        "OBSIDIAN_MCP_CONFIG": "C:\\path\\to\\.obsidian-mcp\\config.json"
      }
    }
  }
}
```

### Configuration File Locations

#### Finding Your Claude Desktop Config

**macOS**:
```bash
# Open the config directory
open ~/Library/Application\ Support/Claude/
```

**Windows**:
```cmd
# Open the config directory
explorer %APPDATA%\Claude
```

#### Config File Contents

Your `claude_desktop_config.json` should look like:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/path/to/obsidian-mcp-perplexity/dist/index.js"],
      "env": {
        "OBSIDIAN_MCP_CONFIG": "/path/to/.obsidian-mcp/config.json"
      }
    }
  }
}
```

## Advanced Configuration

### Custom Exclusion Patterns

Exclude specific folders or file types:

```json
{
  "excludePatterns": [
    ".obsidian/**",
    "personal/**",
    "*.pdf",
    "archive/**",
    "templates/**"
  ]
}
```

### Performance Tuning

For large vaults, adjust these settings:

```json
{
  "maxSearchResults": 10,
  "enableIndexing": true,
  "excludePatterns": [
    ".obsidian/**",
    "archive/**",
    "*.tmp"
  ]
}
```

### Multiple Vault Support

Configure multiple vaults by creating separate MCP servers:

```json
{
  "mcpServers": {
    "obsidian-work": {
      "command": "node",
      "args": ["/path/to/obsidian-mcp-perplexity/dist/index.js"],
      "env": {
        "OBSIDIAN_MCP_CONFIG": "/path/to/work-vault-config.json"
      }
    },
    "obsidian-personal": {
      "command": "node",
      "args": ["/path/to/obsidian-mcp-perplexity/dist/index.js"],
      "env": {
        "OBSIDIAN_MCP_CONFIG": "/path/to/personal-vault-config.json"
      }
    }
  }
}
```

## Getting Help

- **Issues**: [GitHub Issues](https://github.com/Raoof128/obsidian-mcp-perplexity/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Raoof128/obsidian-mcp-perplexity/discussions)
- **Documentation**: See README.md for usage examples

## Updates

To update to the latest version:

```bash
cd obsidian-mcp-perplexity
git pull
npm install
npm run build
# Restart Claude Desktop
```

For extension installations, rebuild and reinstall the .mcpb file:

```bash
npm run build-extension
# Install the new .mcpb file in Claude Desktop
```