# Perplexity Integration Guide

This guide covers the complete setup and usage of the Obsidian MCP server with Perplexity.

## Prerequisites

- Node.js 18 or later
- An Obsidian vault with notes
- Perplexity Pro account (MCP access required)
- macOS, Linux, or Windows with WSL

## Step-by-Step Setup

### 1. Download and Install

```bash
# Clone or download the project
cd obsidian-mcp-perplexity

# Run the interactive setup
npm run setup
```

The setup wizard will:
1. Check your Node.js version
2. Ask for your Obsidian vault path
3. Install dependencies
4. Build the project
5. Generate configuration files

### 2. Locate Your Configuration

After setup, you'll have these files:

```
~/.obsidian-mcp/
├── config.json           # Main configuration
└── perplexity-config.json # Ready-to-use Perplexity config
```

### 3. Configure Perplexity

#### Method 1: Using the Generated Config

1. Open `~/.obsidian-mcp/perplexity-config.json`
2. Copy the `command` and `env` values
3. In Perplexity, go to Settings → Model Context Protocol
4. Add new server with those values

#### Method 2: Manual Configuration

1. **Name**: `obsidian-vault`
2. **Command**: `node /full/path/to/obsidian-mcp-perplexity/dist/index.js`
3. **Environment**: `OBSIDIAN_MCP_CONFIG=/Users/yourname/.obsidian-mcp/config.json`

### 4. Test the Connection

```bash
npm run test
```

Expected output:
```
✅ Server binary found
✅ Configuration file found
✅ Vault accessible at: /path/to/vault
✅ Server started successfully
✅ List Tools: Success
✅ Get Vault Stats: Success
✅ Search Notes: Success
```

## Using with Perplexity

### Search Commands

**Basic Search**
```
Search my Obsidian vault for "productivity tips"
```

**Detailed Search**
```
Find all notes in my vault about machine learning, include full content
```

**Limited Results**
```
Search for "project ideas" and show me the top 5 results
```

### Vault Analysis

**Statistics**
```
Show me statistics about my Obsidian vault
```

**Detailed Analysis**
```
Give me a detailed breakdown of my vault including file types and directories
```

### Note Access

**Read Specific Note**
```
Get the content of my "Daily Planning" note
```

**With Path**
```
Show me the content of projects/website-redesign.md
```

### Recent Activity

**Recent Notes**
```
List my 10 most recent notes
```

**Recent with Preview**
```
Show me notes I've modified in the last 7 days with previews
```

### Link Analysis

**Note Connections**
```
Show me all the links in my "Project Overview" note
```

**Backlink Analysis**
```
Find all notes that link to my "Reference Materials" note
```

## Advanced Usage

### Complex Queries

**Research Assistant**
```
Search my vault for information about "neural networks" and summarize the key concepts I've collected
```

**Project Management**
```
Find all my project-related notes and give me a status overview
```

**Knowledge Discovery**
```
What topics do I write about most based on my vault statistics?
```

### Combining Tools

**Content Analysis**
```
Search for "learning" in my vault, then analyze the links in the most relevant note
```

**Vault Exploration**
```
Show me my vault stats, then list my most recent notes about the largest topic area
```

## Troubleshooting

### Perplexity Shows "No Results"

1. **Check Server Status**
   ```bash
   npm run test
   ```

2. **Verify Configuration**
   - Ensure command path is absolute
   - Check environment variable is set correctly
   - Verify vault path exists

3. **Check Perplexity Settings**
   - MCP server should show as "Connected"
   - Server name should be unique
   - No typos in command or environment

### "keyNotFound" Errors

This usually means the response format is incorrect. The server should return:

```json
{
  "content": [{
    "type": "text",
    "text": "actual data here"
  }]
}
```

**Solution**: Update to the latest version of this MCP server.

### Permission Errors

```bash
# Check vault permissions
ls -la /path/to/your/vault

# Fix if needed
chmod -R 755 /path/to/your/vault
```

### Server Won't Start

```bash
# Check Node.js version
node --version  # Should be 18+

# Rebuild project
npm run build

# Test configuration
node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.OBSIDIAN_MCP_CONFIG, 'utf8')))"
```

## Performance Tips

### Large Vaults

For vaults with thousands of notes:

1. **Use Specific Searches**
   ```
   Search for "react hooks" in my programming notes
   ```

2. **Limit Results**
   ```
   Find "productivity" but only show 5 results
   ```

3. **Use Exclude Patterns**
   Add to config.json:
   ```json
   "excludePatterns": [
     ".obsidian/**",
     "archive/**",
     "templates/**"
   ]
   ```

### Search Optimization

**Better Results**:
- Use specific terms rather than single words
- Include context: "machine learning algorithms" vs "learning"
- Use quotes for exact phrases

**Faster Searches**:
- Search specific folders when possible
- Use recent notes for current projects
- Combine with vault stats to understand content

## Integration Examples

### Daily Workflow

**Morning Review**
```
Show me my recent notes and any that mention today's date
```

**Research Session**
```
Search my vault for "customer feedback" and summarize the main themes
```

**Project Planning**
```
Find all notes about "website project" and show me the connections between them
```

### Content Creation

**Blog Post Research**
```
Search for "productivity" and "workflow" in my notes, then analyze the most connected note
```

**Reference Gathering**
```
Find all notes that link to my "Resources" note and list their topics
```

### Knowledge Management

**Topic Analysis**
```
What are my vault statistics and which topics appear most in my recent notes?
```

**Connection Discovery**
```
Show me notes that have the most outgoing links - these might be my index or MOC notes
```

## Best Practices

### Organize for MCP

1. **Use Descriptive Filenames**
   - `2024-01-15-daily-planning.md` vs `daily.md`
   - `machine-learning-resources.md` vs `resources.md`

2. **Consistent Folder Structure**
   ```
   vault/
   ├── daily/
   ├── projects/
   ├── resources/
   └── archive/
   ```

3. **Regular Cleanup**
   - Archive old notes
   - Use consistent tags
   - Maintain link hygiene

### Effective Queries

**Specific > General**
- ✅ "machine learning model evaluation metrics"
- ❌ "AI"

**Context Matters**
- ✅ "productivity tips for software developers"
- ❌ "productivity"

**Use Tool Features**
- ✅ "Search for 'react' and include full content"
- ❌ "Search for react"

## Next Steps

After successful setup:

1. **Explore Your Vault**
   - Run vault statistics
   - Try different search queries
   - Analyze note connections

2. **Integrate into Workflow**
   - Use for research sessions
   - Daily note reviews
   - Project planning

3. **Optimize Performance**
   - Adjust exclude patterns
   - Organize vault structure
   - Refine search strategies

4. **Advanced Features**
   - Combine multiple tools
   - Use for content analysis
   - Knowledge discovery

---

**Support**: If you encounter issues, run `npm run test` first, then check the troubleshooting section above.