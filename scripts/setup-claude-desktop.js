#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ClaudeDesktopSetup {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.configDir = this.getClaudeDesktopConfigDir();
    this.configFile = path.join(this.configDir, 'claude_desktop_config.json');
  }

  getClaudeDesktopConfigDir() {
    const platform = os.platform();
    const homeDir = os.homedir();

    switch (platform) {
      case 'darwin': // macOS
        return path.join(homeDir, 'Library', 'Application Support', 'Claude');
      case 'win32': // Windows
        return path.join(process.env.APPDATA || '', 'Claude');
      case 'linux':
        return path.join(homeDir, '.config', 'claude');
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }

  async run() {
    console.log('🚀 Setting up Obsidian MCP Server for Claude Desktop...\n');

    try {
      await this.checkPrerequisites();
      await this.createConfigDirectory();
      await this.promptForVaultPath();
      await this.installDependencies();
      await this.buildProject();
      await this.updateClaudeDesktopConfig();
      await this.showCompletionInstructions();
    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    }
  }

  async checkPrerequisites() {
    console.log('🔍 Checking prerequisites...');

    // Check Node.js version
    try {
      const { stdout } = await execAsync('node --version');
      const version = stdout.trim();
      const majorVersion = parseInt(version.slice(1).split('.')[0]);

      if (majorVersion < 18) {
        throw new Error(`Node.js version ${version} is not supported. Please upgrade to Node.js 18 or later.`);
      }

      console.log(`✅ Node.js version: ${version}`);
    } catch (error) {
      throw new Error('Node.js is not installed or not accessible');
    }

    // Check if Claude Desktop is installed
    const platform = os.platform();
    let claudeDesktopPath;

    try {
      switch (platform) {
        case 'darwin':
          claudeDesktopPath = '/Applications/Claude.app';
          await fs.access(claudeDesktopPath);
          break;
        case 'win32':
          claudeDesktopPath = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Claude', 'Claude.exe');
          await fs.access(claudeDesktopPath);
          break;
        case 'linux':
          // Check common locations for Linux
          const linuxPaths = [
            '/usr/local/bin/claude',
            '/usr/bin/claude',
            path.join(os.homedir(), '.local', 'bin', 'claude')
          ];
          let found = false;
          for (const linuxPath of linuxPaths) {
            try {
              await fs.access(linuxPath);
              claudeDesktopPath = linuxPath;
              found = true;
              break;
            } catch {}
          }
          if (!found) throw new Error('Claude Desktop not found');
          break;
      }

      console.log('✅ Claude Desktop installation found');
    } catch {
      console.log('⚠️  Claude Desktop not found in default location');
      console.log('   Please ensure Claude Desktop is installed before proceeding');
    }
  }

  async createConfigDirectory() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      console.log(`✅ Claude Desktop config directory: ${this.configDir}`);
    } catch (error) {
      throw new Error(`Failed to create config directory: ${error.message}`);
    }
  }

  async promptForVaultPath() {
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const question = (query) => new Promise(resolve => rl.question(query, resolve));

    try {
      console.log('\n📁 Obsidian Vault Configuration');

      let vaultPath = await question('Enter the path to your Obsidian vault (or press Enter for default ~/Documents/ObsidianVault): ');

      if (!vaultPath.trim()) {
        vaultPath = '~/Documents/ObsidianVault';
      }

      // Expand tilde
      if (vaultPath.startsWith('~')) {
        vaultPath = path.join(os.homedir(), vaultPath.slice(1));
      }

      // Check if vault exists
      try {
        await fs.access(vaultPath);
        console.log(`✅ Vault found at: ${vaultPath}`);
      } catch {
        console.log(`⚠️  Vault not found at: ${vaultPath}`);
        const create = await question('Would you like to create this directory? (y/N): ');
        if (create.toLowerCase() === 'y' || create.toLowerCase() === 'yes') {
          await fs.mkdir(vaultPath, { recursive: true });
          console.log(`✅ Created vault directory: ${vaultPath}`);

          // Create a sample note
          const welcomeNote = path.join(vaultPath, 'Welcome.md');
          const welcomeContent = `# Welcome to your Obsidian Vault

This is your first note! You can now use Claude Desktop to search and interact with your notes.

## Getting Started
- Create new notes by adding .md files to this directory
- Use [[links]] to connect your notes
- Try searching for content using Claude Desktop

Happy note-taking!
`;
          await fs.writeFile(welcomeNote, welcomeContent);
          console.log(`✅ Created welcome note: Welcome.md`);
        } else {
          throw new Error('Vault path is required');
        }
      }

      this.vaultPath = vaultPath;

    } finally {
      rl.close();
    }
  }

  async installDependencies() {
    console.log('\n📦 Installing dependencies...');

    try {
      process.chdir(this.projectRoot);
      const { stdout, stderr } = await execAsync('npm install');

      if (stderr && !stderr.includes('npm WARN')) {
        console.warn('Warning during installation:', stderr);
      }

      console.log('✅ Dependencies installed successfully');
    } catch (error) {
      throw new Error(`Failed to install dependencies: ${error.message}`);
    }
  }

  async buildProject() {
    console.log('\n🔨 Building project...');

    try {
      const { stdout, stderr } = await execAsync('npm run build');

      if (stderr && !stderr.includes('npm WARN')) {
        console.warn('Warning during build:', stderr);
      }

      console.log('✅ Project built successfully');
    } catch (error) {
      throw new Error(`Failed to build project: ${error.message}`);
    }
  }

  async updateClaudeDesktopConfig() {
    console.log('\n⚙️  Updating Claude Desktop configuration...');

    const serverPath = path.join(this.projectRoot, 'dist', 'index.js');
    const tempConfigPath = path.join(this.projectRoot, '.obsidian-mcp-temp-config.json');

    // Create temporary config file for the MCP server
    const mcpConfig = {
      obsidianVaultPath: this.vaultPath,
      excludePatterns: [
        ".obsidian/**",
        "*.tmp",
        "*.bak",
        ".trash/**",
        "node_modules/**",
        ".git/**"
      ],
      maxSearchResults: 20,
      enableIndexing: true
    };

    await fs.writeFile(tempConfigPath, JSON.stringify(mcpConfig, null, 2));

    // Read existing Claude Desktop config or create new one
    let config = { mcpServers: {} };

    try {
      const existingConfig = await fs.readFile(this.configFile, 'utf-8');
      config = JSON.parse(existingConfig);
      if (!config.mcpServers) {
        config.mcpServers = {};
      }
    } catch (error) {
      // File doesn't exist, use default config
      console.log('Creating new Claude Desktop configuration file');
    }

    // Add or update the Obsidian MCP server
    config.mcpServers['obsidian-vault'] = {
      command: "node",
      args: [serverPath],
      env: {
        OBSIDIAN_MCP_CONFIG: tempConfigPath
      }
    };

    // Write updated config
    await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));

    console.log(`✅ Updated Claude Desktop config: ${this.configFile}`);
    console.log(`✅ Created MCP server config: ${tempConfigPath}`);
  }

  async showCompletionInstructions() {
    console.log('\n🎉 Setup completed successfully!\n');

    console.log('📋 Next Steps:');
    console.log('1. Restart Claude Desktop completely (quit and reopen)');
    console.log('2. Open a new conversation in Claude Desktop');
    console.log('3. Look for the MCP server indicator (🔌) in the input box');
    console.log('4. If you see the indicator, the server is connected!\n');

    console.log('🧪 Test Commands to try in Claude Desktop:');
    console.log('• "Search my Obsidian vault for productivity tips"');
    console.log('• "Show me my vault statistics"');
    console.log('• "List my 10 most recent notes"');
    console.log('• "Get the content of my Welcome note"');
    console.log('• "Show me all the links in my notes"\n');

    console.log('🔧 Configuration Files:');
    console.log(`• Claude Desktop config: ${this.configFile}`);
    console.log(`• MCP server config: ${path.join(this.projectRoot, '.obsidian-mcp-temp-config.json')}`);
    console.log(`• Obsidian vault: ${this.vaultPath}\n`);

    console.log('🔄 To Update:');
    console.log('• Run "npm run build" after making changes to the code');
    console.log('• Restart Claude Desktop to apply configuration changes\n');

    console.log('🆘 Troubleshooting:');
    console.log('• If you don\'t see the MCP indicator, check that Claude Desktop is fully restarted');
    console.log('• Verify the vault path is correct and accessible');
    console.log('• Check the Claude Desktop logs for any error messages');
    console.log('• Report issues at: https://github.com/Raoof128/obsidian-mcp-server/issues\n');

    const platform = os.platform();
    if (platform === 'darwin') {
      console.log('🍎 macOS Users: You can also access settings via Claude Desktop > Settings > Developer');
    } else if (platform === 'win32') {
      console.log('🪟 Windows Users: Access settings via the gear icon in Claude Desktop');
    }
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new ClaudeDesktopSetup();
  setup.run();
}

export { ClaudeDesktopSetup };