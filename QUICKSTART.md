# Quick Start Guide

## 🚀 Ready-to-Use Obsidian MCP for Perplexity

This package is **pre-configured and tested** - just follow these 3 steps:

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Your Vault Path
Edit the config file with your actual Obsidian vault path:
```bash
# Edit this file:
~/.obsidian-mcp/config.json

# Change this line to your vault:
"obsidianVaultPath": "/Users/yourname/Documents/YourObsidianVault"
```

### Step 3: Add to Perplexity
In Perplexity settings → Model Context Protocol:

**Name:** `obsidian-vault`
**Command:** `node /absolute/path/to/this/folder/dist/index.js`
**Environment:** `OBSIDIAN_MCP_CONFIG=/Users/yourname/.obsidian-mcp/config.json`

### Test It
Try these queries in Perplexity:
- "Search my Obsidian vault for productivity tips"
- "Show me my vault statistics"
- "List my recent notes"

## 🔧 Manual Test (Optional)
```bash
export OBSIDIAN_MCP_CONFIG=~/.obsidian-mcp/config.json
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node dist/index.js
```

Should return a list of 5 available tools.

## 📁 What's Included
- ✅ Pre-built MCP server (`dist/index.js`)
- ✅ Configuration templates (`config/`)
- ✅ Complete documentation (`docs/`)
- ✅ Setup and test scripts (`scripts/`)
- ✅ Sample vault with test notes

## 🆘 Need Help?
- Check `docs/README.md` for full documentation
- Check `docs/PERPLEXITY.md` for integration details
- Run `npm run test` to verify setup

---
**Status:** ✅ Tested and working with Perplexity's MCP format