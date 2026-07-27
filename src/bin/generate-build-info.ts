import * as fs from 'fs';
import * as path from 'path';

console.log('\n=========================================');
console.log('   Yuihime Build-Info Manifest Generator ');
console.log('=========================================\n');

try {
  const rootDir = process.cwd();
  
  // 1. Read package.json metadata
  const packageJsonPath = path.join(rootDir, 'package.json');
  let packageVersion = 'unknown';
  let dependencies: Record<string, string> = {};
  if (fs.existsSync(packageJsonPath)) {
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    packageVersion = pkg.version || '0.0.0';
    dependencies = pkg.dependencies || {};
  }

  // 2. Scan instruction files (Core Prompts)
  const promptsDir = path.join(rootDir, 'src', 'share', 'prompts');
  const instructionSets: Record<string, { path: string; content: string }> = {};

  if (fs.existsSync(promptsDir)) {
    const promptFiles = fs.readdirSync(promptsDir);
    for (const file of promptFiles) {
      if (file.endsWith('.md')) {
        const filePath = path.join(promptsDir, file);
        const name = path.basename(file, '.md');
        instructionSets[name] = {
          path: path.relative(rootDir, filePath),
          content: fs.readFileSync(filePath, 'utf8'),
        };
      }
    }
  }

  // Also check .yuihime/agent if it has some local customization templates to aggregate
  const localAgentDir = path.join(rootDir, '.yuihime', 'agent');
  const localInstructionSets: Record<string, { path: string; content: string }> = {};
  if (fs.existsSync(localAgentDir)) {
    const localFiles = fs.readdirSync(localAgentDir);
    for (const file of localFiles) {
      if (file.endsWith('.md')) {
        const filePath = path.join(localAgentDir, file);
        const name = path.basename(file, '.md');
        localInstructionSets[name] = {
          path: path.relative(rootDir, filePath),
          content: fs.readFileSync(filePath, 'utf8'),
        };
      }
    }
  }

  // 4. Create the final manifest structure
  const manifest = {
    appName: "YuiHime AI Engine",
    buildVersion: packageVersion,
    buildTimestamp: new Date().toISOString(),
    environment: {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    },
    dependenciesSummary: Object.keys(dependencies),
    aggregatedPromptsFallback: instructionSets,
    aggregatedPromptsRuntime: localInstructionSets,
  };

  // Ensure output directory exists
  const distDir = path.join(rootDir, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // Write to dist/ for standalone binary distribution and debugging
  const distManifestPath = path.join(distDir, 'build-info.json');
  fs.writeFileSync(distManifestPath, JSON.stringify(manifest, null, 2), 'utf8');
  console.log(`✓ Manifest written to dist: ${path.relative(rootDir, distManifestPath)}`);

  console.log('\n=========================================');
  console.log('✓ Success! Build manifest completed.');
  console.log('=========================================\n');
} catch (error: any) {
  console.error('🔴 Failed to generate build manifest:', error.message || error);
  process.exit(1);
}
