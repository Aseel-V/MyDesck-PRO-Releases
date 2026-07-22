import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const tsPath = path.resolve('src/components/analytics/AnalyticsEngine.ts');
const jsPath = path.resolve('src/components/analytics/AnalyticsEngine.js');
const statusTsPath = path.resolve('src/lib/tripStatus.ts');
const statusJsPath = path.resolve('src/lib/tripStatus.js');

console.log('Compiling AnalyticsEngine.ts and tripStatus.ts in-memory...');

try {
  const statusTsCode = fs.readFileSync(statusTsPath, 'utf8');
  const statusResult = ts.transpileModule(statusTsCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      strict: true,
      esModuleInterop: true
    }
  });
  fs.writeFileSync(statusJsPath, statusResult.outputText, 'utf8');

  const tsCode = fs.readFileSync(tsPath, 'utf8');
  const result = ts.transpileModule(tsCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      strict: true,
      esModuleInterop: true
    }
  });

  // Ensure imports have .js extension for node ESM
  const outputText = result.outputText.replace("from '../../lib/tripStatus'", "from '../../lib/tripStatus.js'");
  fs.writeFileSync(jsPath, outputText, 'utf8');
  console.log('Temporary JS outputs generated successfully.');

  // Dynamically import and run tests
  await import('./test-analytics.js');

} catch (error) {
  console.error('Error during programmatic test execution:', error);
  process.exit(1);
} finally {
  // Clean up compiled JS files
  if (fs.existsSync(jsPath)) {
    fs.unlinkSync(jsPath);
  }
  if (fs.existsSync(statusJsPath)) {
    fs.unlinkSync(statusJsPath);
  }
  console.log('Cleaned up temporary JS files.');
}
