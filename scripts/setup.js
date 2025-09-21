#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ObsidianMCPSetup {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.configDir = path.join(process.env.HOME || '', '.obsidian-mcp');
    this.configFile = path.join(this.configDir, 'config.json');
  }

  async run() {
    console.log('🚀 Setting up Obsidian MCP for Perplexity...\n');

    try {
      await this.checkNodeVersion();
      await this.createConfigDirectory();
      await this.promptForVaultPath();
      await this.installDependencies();
      await this.buildProject();
      await this.generatePerplexityConfig();
      await this.showCompletionInstructions();
    } catch (error) {
      console.error('❌ Setup failed:', error.message);
      process.exit(1);
    }
  }

  async checkNodeVersion() {
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
  }

  async createConfigDirectory() {
    try {
      await fs.mkdir(this.configDir, { recursive: true });
      console.log(`✅ Config directory created: ${this.configDir}`);
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
      console.log('📁 Obsidian Vault Configuration');

      let vaultPath = await question('Enter the path to your Obsidian vault (or press Enter for default ~/Documents/ObsidianVault): ');

      if (!vaultPath.trim()) {
        vaultPath = '~/Documents/ObsidianVault';
      }

      // Expand tilde
      if (vaultPath.startsWith('~')) {
        vaultPath = path.join(process.env.HOME || '', vaultPath.slice(1));
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
        } else {
          throw new Error('Vault path is required');
        }
      }

      const config = {
        obsidianVaultPath: vaultPath,
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

      await fs.writeFile(this.configFile, JSON.stringify(config, null, 2));
      console.log(`✅ Configuration saved to: ${this.configFile}`);

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

  async generatePerplexityConfig() {
    const serverPath = path.join(this.projectRoot, 'dist', 'index.js');

    const perplexityConfig = {
      name: "obsidian-vault",
      description: "Access and search your Obsidian vault",
      command: `node ${serverPath}`,
      env: {
        OBSIDIAN_MCP_CONFIG: this.configFile
      }
    };

    const perplexityConfigFile = path.join(this.configDir, 'perplexity-config.json');
    await fs.writeFile(perplexityConfigFile, JSON.stringify(perplexityConfig, null, 2));

    console.log(`✅ Perplexity configuration generated: ${perplexityConfigFile}`);
  }

  async showCompletionInstructions() {
    const serverPath = path.join(this.projectRoot, 'dist', 'index.js');

    console.log('\n🎉 Setup completed successfully!\n');

    console.log('📋 Next Steps:');
    console.log('1. Open Perplexity settings');
    console.log('2. Navigate to Model Context Protocol (MCP) section');
    console.log('3. Add a new MCP server with these settings:');
    console.log('   ┌─────────────────────────────────────────────────────────┐');
    console.log('   │ Name: obsidian-vault                                   │');
    console.log(`   │ Command: node ${serverPath}`);
    console.log(`   │ Environment: OBSIDIAN_MCP_CONFIG=${this.configFile}`);
    console.log('   └─────────────────────────────────────────────────────────┘\n');

    console.log('🧪 Test Commands (once configured in Perplexity):');
    console.log('• "Search my Obsidian vault for productivity tips"');
    console.log('• "Show me my vault statistics"');
    console.log('• "List my 10 most recent notes"');
    console.log('• "Get the content of my daily note"');
    console.log('• "Show me links in my project planning note"\n');

    console.log('🔧 Manual Test (optional):');
    console.log(`OBSIDIAN_MCP_CONFIG=${this.configFile} node ${serverPath}\n`);

    console.log('📁 Config Files:');
    console.log(`• Main config: ${this.configFile}`);
    console.log(`• Perplexity config: ${path.join(this.configDir, 'perplexity-config.json')}\n`);

    console.log('🆘 Need help? Check the documentation in the docs/ folder');
  }
}

// Run setup if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const setup = new ObsidianMCPSetup();
  setup.run();
}