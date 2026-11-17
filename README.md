# Obsidian MCP Server

A small [Model Context Protocol](https://modelcontextprotocol.io) server that lets an MCP client such as Claude Desktop search, read and edit the Markdown notes in an Obsidian vault on your machine. It reads the vault's files directly and does not need Obsidian to be running.

> **Status: a personal experiment from September 2025, not maintained.** It began as an attempt to connect Obsidian to Perplexity, which is where the repository name comes from; that support was removed and the code targets Claude Desktop and other stdio MCP clients. There is no CI. See [Known problems](#known-problems) before relying on it.

## Tools

Nine tools. **Two of them write to your vault.**

| Tool | What it does | Writes |
|---|---|---|
| `search_notes` | Searches note names and contents, with optional fuzzy matching and tag filtering | no |
| `get_vault_stats` | File counts, sizes and types | no |
| `get_note_content` | The content of one note, with its metadata | no |
| `list_recent_notes` | Recently modified notes | no |
| `get_note_links` | The internal links in a note, and optionally its backlinks | no |
| `search_by_tags` | Notes carrying given tags | no |
| `analyze_vault_structure` | Folder hierarchy and note relationships | no |
| `create_note` | Creates a note; refuses to replace one unless `overwrite` is set | **yes** |
| `update_note` | Replaces or appends to an existing note | **yes** |

Every note path is resolved inside the configured vault. A path that would leave it (`../`, an absolute path elsewhere, a sibling directory whose name starts like the vault's) is refused. Symbolic links inside the vault are followed.

## Setup

You need Node.js 18 or newer.

```bash
git clone https://github.com/Raoof128/obsidian-mcp-perplexity.git
cd obsidian-mcp-perplexity
npm install
npm run build
```

Write a configuration file, for example `~/.obsidian-mcp/config.json`:

```json
{
  "obsidianVaultPath": "~/Documents/ObsidianVault",
  "excludePatterns": [".obsidian/**", "*.tmp", "*.bak", ".trash/**", "node_modules/**", ".git/**"],
  "maxSearchResults": 20,
  "enableIndexing": true
}
```

Then add the server to your MCP client. For Claude Desktop, in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "obsidian-vault": {
      "command": "node",
      "args": ["/full/path/to/obsidian-mcp-perplexity/dist/index.js"],
      "env": { "OBSIDIAN_MCP_CONFIG": "/full/path/to/.obsidian-mcp/config.json" }
    }
  }
}
```

`npm run setup-claude-desktop` asks for the vault path and writes both files for you. [INSTALLATION.md](INSTALLATION.md) has per-platform notes.

## Testing

```bash
npm run test:unit                                           # the vault path check, with node:test
OBSIDIAN_MCP_CONFIG=/path/to/config.json npm test           # starts the built server and calls three tools
```

The second command needs a configuration that points at a real directory. Those two commands are all the testing there is: four unit tests for the path check, and a smoke test that lists the tools, reads the vault statistics and runs one search.

## Known problems

- **`npm run build-extension` does not work.** It tries to install a packaging tool under a name that does not exist on npm, and its ZIP fallback then fails. Use the setup above.
- **Symbolic links are followed.** A link inside the vault that points outside it can be read or written through.
- **Search claims are untested.** The tool descriptions mention exact phrases, wildcards and boolean operators; only a plain query is exercised by the smoke test.
- **The MCP SDK is old** (`@modelcontextprotocol/sdk` 0.5), from when this was written.

## Licence

[MIT](LICENSE).
