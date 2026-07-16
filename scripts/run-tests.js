import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const tsPath = path.resolve('src/components/analytics/AnalyticsEngine.ts');
const jsPath = path.resolve('src/components/analytics/AnalyticsEngine.js');

console.log('Compiling AnalyticsEngine.ts in-memory...');

try {
  const tsCode = fs.readFileSync(tsPath, 'utf8');
  
  // Transpile TypeScript to ES Module JavaScript
  const result = ts.transpileModule(tsCode, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Node10,
      strict: true,
      esModuleInterop: true
    }
  });

  // Write compiled JS file temporarily
  fs.writeFileSync(jsPath, result.outputText, 'utf8');
  console.log('Temporary JS output generated successfully.');

  // Dynamically import and run tests
  await import('./test-analytics.js');

} catch (error) {
  console.error('Error during programmatic test execution:', error);
  process.exit(1);
} finally {
  // Clean up compiled JS file
  if (fs.existsSync(jsPath)) {
    fs.unlinkSync(jsPath);
    console.log('Cleaned up temporary JS file.');
  }
}
