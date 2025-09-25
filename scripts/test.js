#!/usr/bin/env node

import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ObsidianMCPTester {
  constructor() {
    this.projectRoot = path.join(__dirname, '..');
    this.serverPath = path.join(this.projectRoot, 'dist', 'index.js');
    this.configPath = process.env.OBSIDIAN_MCP_CONFIG ||
                     path.join(process.env.HOME || '', '.obsidian-mcp', 'config.json');
  }

  async run() {
    console.log('🧪 Testing Obsidian MCP Server...\n');

    try {
      await this.checkSetup();
      await this.testServer();
    } catch (error) {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    }
  }

  async checkSetup() {
    // Check if server is built
    try {
      await fs.access(this.serverPath);
      console.log('✅ Server binary found');
    } catch {
      throw new Error(`Server not built. Run 'npm run build' first. Looking for: ${this.serverPath}`);
    }

    // Check if config exists
    try {
      await fs.access(this.configPath);
      console.log('✅ Configuration file found');
    } catch {
      throw new Error(`Config not found. Run 'npm run setup' first. Looking for: ${this.configPath}`);
    }

    // Check config validity
    try {
      const configData = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(configData);

      if (!config.obsidianVaultPath) {
        throw new Error('obsidianVaultPath not set in config');
      }

      // Expand tilde
      let vaultPath = config.obsidianVaultPath;
      if (vaultPath.startsWith('~')) {
        vaultPath = path.join(process.env.HOME || '', vaultPath.slice(1));
      }

      await fs.access(vaultPath);
      console.log(`✅ Vault accessible at: ${vaultPath}`);
    } catch (error) {
      throw new Error(`Config validation failed: ${error.message}`);
    }
  }

  async testServer() {
    console.log('\n🚀 Starting server test...\n');

    return new Promise((resolve, reject) => {
      const server = spawn('node', [this.serverPath], {
        env: {
          ...process.env,
          OBSIDIAN_MCP_CONFIG: this.configPath
        },
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let responseBuffer = '';
      let errorBuffer = '';

      // Test sequence
      const tests = [
        {
          name: 'List Tools',
          request: {
            jsonrpc: "2.0",
            id: 1,
            method: "tools/list"
          }
        },
        {
          name: 'Get Vault Stats',
          request: {
            jsonrpc: "2.0",
            id: 2,
            method: "tools/call",
            params: {
              name: "get_vault_stats",
              arguments: {}
            }
          }
        },
        {
          name: 'Search Notes',
          request: {
            jsonrpc: "2.0",
            id: 3,
            method: "tools/call",
            params: {
              name: "search_notes",
              arguments: {
                query: "test",
                limit: 5
              }
            }
          }
        }
      ];

      let currentTest = 0;
      let testResults = [];

      server.stdout.on('data', (data) => {
        responseBuffer += data.toString();

        // Try to parse complete JSON responses
        const lines = responseBuffer.split('\n');
        responseBuffer = lines.pop() || ''; // Keep incomplete line

        for (const line of lines) {
          if (line.trim()) {
            try {
              const response = JSON.parse(line);

              if (response.id && response.id <= tests.length) {
                const test = tests[response.id - 1];

                if (response.error) {
                  testResults.push({
                    test: test.name,
                    status: 'FAILED',
                    error: response.error.message
                  });
                  console.log(`❌ ${test.name}: ${response.error.message}`);
                } else {
                  testResults.push({
                    test: test.name,
                    status: 'PASSED',
                    data: response.result
                  });
                  console.log(`✅ ${test.name}: Success`);

                  // Show some result details
                  if (test.name === 'List Tools' && response.result.tools) {
                    console.log(`   Found ${response.result.tools.length} tools`);
                  } else if (test.name === 'Get Vault Stats' && response.result.content) {
                    try {
                      const stats = JSON.parse(response.result.content[0].text);
                      console.log(`   Notes: ${stats.noteCount}, Size: ${stats.totalSizeMB}MB`);
                    } catch {}
                  } else if (test.name === 'Search Notes' && response.result.content) {
                    try {
                      const searchResults = JSON.parse(response.result.content[0].text);
                      console.log(`   Found ${searchResults.totalResults} results`);
                    } catch {}
                  }
                }
              }

              // Send next test
              if (currentTest < tests.length) {
                setTimeout(() => {
                  const nextTest = tests[currentTest++];
                  server.stdin.write(JSON.stringify(nextTest.request) + '\n');
                }, 100);
              } else {
                // All tests completed
                server.kill();
                this.printTestSummary(testResults);
                resolve();
              }
            } catch (parseError) {
              // Ignore JSON parse errors for incomplete responses
            }
          }
        }
      });

      server.stderr.on('data', (data) => {
        errorBuffer += data.toString();
        const lines = errorBuffer.split('\n');
        for (const line of lines) {
          if (line.includes('running on stdio')) {
            console.log('✅ Server started successfully');

            // Start first test
            setTimeout(() => {
              const firstTest = tests[currentTest++];
              server.stdin.write(JSON.stringify(firstTest.request) + '\n');
            }, 100);
          }
        }
      });

      server.on('error', (error) => {
        reject(new Error(`Server process error: ${error.message}`));
      });

      server.on('exit', (code) => {
        if (code !== null && code !== 0 && currentTest < tests.length) {
          reject(new Error(`Server exited with code ${code}`));
        }
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        server.kill();
        reject(new Error('Test timeout'));
      }, 30000);
    });
  }

  printTestSummary(results) {
    console.log('\n📊 Test Summary:');
    console.log('═'.repeat(50));

    const passed = results.filter(r => r.status === 'PASSED').length;
    const failed = results.filter(r => r.status === 'FAILED').length;

    results.forEach(result => {
      const icon = result.status === 'PASSED' ? '✅' : '❌';
      console.log(`${icon} ${result.test}`);
      if (result.error) {
        console.log(`    Error: ${result.error}`);
      }
    });

    console.log('═'.repeat(50));
    console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

    if (failed === 0) {
      console.log('\n🎉 All tests passed! Your MCP server is ready for Claude Desktop.');
      console.log('\n📋 Next Steps:');
      console.log('1. Add the server to Claude Desktop MCP settings');
      console.log('2. Use these test queries:');
      console.log('   • "Search my vault for productivity"');
      console.log('   • "Show my vault statistics"');
      console.log('   • "List my recent notes"');
    } else {
      console.log(`\n⚠️  ${failed} test(s) failed. Please check your configuration.`);
    }
  }
}

// Run tests if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const tester = new ObsidianMCPTester();
  tester.run();
}