#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ExtensionBuilder {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.distDir = path.join(this.projectRoot, 'dist');
    this.extensionDir = path.join(this.projectRoot, 'extension');
  }

  async run() {
    console.log('🏗️  Building Claude Desktop Extension (.mcpb)...\n');

    try {
      await this.buildTypeScript();
      await this.prepareExtensionDirectory();
      await this.copyRequiredFiles();
      await this.createExtensionPackage();
      await this.showCompletionMessage();
    } catch (error) {
      console.error('❌ Build failed:', error.message);
      process.exit(1);
    }
  }

  async buildTypeScript() {
    console.log('🔨 Building TypeScript...');

    try {
      process.chdir(this.projectRoot);
      const { stdout, stderr } = await execAsync('npm run build');

      if (stderr && !stderr.includes('npm WARN')) {
        console.warn('Warning during build:', stderr);
      }

      console.log('✅ TypeScript build completed');
    } catch (error) {
      throw new Error(`TypeScript build failed: ${error.message}`);
    }
  }

  async prepareExtensionDirectory() {
    console.log('📁 Preparing extension directory...');

    // Clean and create extension directory
    try {
      await fs.rm(this.extensionDir, { recursive: true, force: true });
    } catch {}

    await fs.mkdir(this.extensionDir, { recursive: true });

    console.log('✅ Extension directory prepared');
  }

  async copyRequiredFiles() {
    console.log('📋 Copying required files...');

    const filesToCopy = [
      { src: 'manifest.json', dest: 'manifest.json' },
      { src: 'package.json', dest: 'package.json' },
      { src: 'README.md', dest: 'README.md' },
      { src: 'dist', dest: 'dist', isDirectory: true }
    ];

    for (const file of filesToCopy) {
      const srcPath = path.join(this.projectRoot, file.src);
      const destPath = path.join(this.extensionDir, file.dest);

      try {
        if (file.isDirectory) {
          await this.copyDirectory(srcPath, destPath);
        } else {
          await fs.copyFile(srcPath, destPath);
        }
        console.log(`  ✅ Copied ${file.src}`);
      } catch (error) {
        throw new Error(`Failed to copy ${file.src}: ${error.message}`);
      }
    }

    // Create a simplified package.json for the extension
    await this.createExtensionPackageJson();
  }

  async copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }

  async createExtensionPackageJson() {
    console.log('📦 Creating extension package.json...');

    const originalPackage = JSON.parse(
      await fs.readFile(path.join(this.projectRoot, 'package.json'), 'utf-8')
    );

    const extensionPackage = {
      name: originalPackage.name,
      version: originalPackage.version,
      description: originalPackage.description,
      main: "dist/index.js",
      type: "module",
      engines: originalPackage.engines,
      dependencies: originalPackage.dependencies,
      author: originalPackage.author,
      license: originalPackage.license,
      keywords: originalPackage.keywords,
      repository: originalPackage.repository
    };

    await fs.writeFile(
      path.join(this.extensionDir, 'package.json'),
      JSON.stringify(extensionPackage, null, 2)
    );

    console.log('✅ Extension package.json created');
  }

  async createExtensionPackage() {
    console.log('📦 Creating .mcpb package...');

    try {
      // Check if @anthropic/mcpb is available
      try {
        await execAsync('npx @anthropic/mcpb --version', { cwd: this.projectRoot });
      } catch {
        console.log('📥 Installing @anthropic/mcpb...');
        await execAsync('npm install -g @anthropic/mcpb', { cwd: this.projectRoot });
      }

      // Create the .mcpb package
      process.chdir(this.extensionDir);
      const { stdout, stderr } = await execAsync('npx @anthropic/mcpb pack');

      if (stderr && !stderr.includes('npm WARN')) {
        console.warn('Warning during packaging:', stderr);
      }

      // Move the .mcpb file to the project root
      const mcpbFiles = await fs.readdir(this.extensionDir);
      const mcpbFile = mcpbFiles.find(file => file.endsWith('.mcpb'));

      if (mcpbFile) {
        const srcPath = path.join(this.extensionDir, mcpbFile);
        const destPath = path.join(this.projectRoot, mcpbFile);

        await fs.copyFile(srcPath, destPath);
        console.log(`✅ Created extension package: ${mcpbFile}`);

        this.extensionFile = mcpbFile;
      } else {
        throw new Error('No .mcpb file was created');
      }

    } catch (error) {
      // If mcpb is not available, create a ZIP file as fallback
      console.log('⚠️  @anthropic/mcpb not available, creating ZIP package as fallback...');
      await this.createZipPackage();
    }
  }

  async createZipPackage() {
    const archiver = await import('archiver').catch(() => null);

    if (!archiver) {
      console.log('📥 Installing archiver for ZIP creation...');
      await execAsync('npm install archiver', { cwd: this.projectRoot });
    }

    const { default: archive } = await import('archiver');
    const zipPath = path.join(this.projectRoot, 'obsidian-mcp-server.zip');

    const output = (await import('fs')).createWriteStream(zipPath);
    const zip = archive('zip', { zlib: { level: 9 } });

    zip.pipe(output);
    zip.directory(this.extensionDir, false);
    await zip.finalize();

    console.log(`✅ Created ZIP package: obsidian-mcp-server.zip`);
    this.extensionFile = 'obsidian-mcp-server.zip';
  }

  async showCompletionMessage() {
    console.log('\n🎉 Extension build completed successfully!\n');

    if (this.extensionFile) {
      console.log('📦 Extension Package:');
      console.log(`  ${this.extensionFile}\n`);

      console.log('📋 Installation Options:\n');

      console.log('Option 1: Claude Desktop Extensions (Recommended)');
      console.log('• Open Claude Desktop');
      console.log('• Go to Settings > Extensions');
      console.log('• Click "Install from file"');
      console.log(`• Select the ${this.extensionFile} file\n`);

      console.log('Option 2: Manual Configuration');
      console.log('• Run: npm run setup-claude-desktop');
      console.log('• This will configure Claude Desktop directly\n');

      console.log('Option 3: Share with Others');
      console.log(`• Send them the ${this.extensionFile} file`);
      console.log('• They can install it via Settings > Extensions > Install from file\n');
    }

    console.log('🔧 Development:');
    console.log('• Run "npm run build-extension" to rebuild after changes');
    console.log('• Run "npm run setup-claude-desktop" for direct configuration\n');

    console.log('📁 Generated Files:');
    console.log(`• Extension directory: ${this.extensionDir}`);
    if (this.extensionFile) {
      console.log(`• Package file: ${path.join(this.projectRoot, this.extensionFile)}`);
    }
    console.log('• Built code: dist/\n');

    console.log('🆘 Need help? Check the documentation or report issues at:');
    console.log('https://github.com/Raoof128/obsidian-mcp-perplexity/issues');
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const builder = new ExtensionBuilder();
  builder.run();
}

export { ExtensionBuilder };