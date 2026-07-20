const { execFileSync } = require('node:child_process');
const path = require('node:path');

if (process.platform !== 'win32') {
  process.exit(0);
}

const root = path.resolve(__dirname, '..').replace(/'/g, "''");
const script = `
$root = '${root}';
$current = ${process.pid};
$parent = (Get-CimInstance Win32_Process -Filter "ProcessId = $current").ParentProcessId;

Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  Where-Object { $_ -ne $current -and $_ -gt 0 } |
  ForEach-Object {
    try { Stop-Process -Id $_ -Force -ErrorAction Stop } catch {}
  };

Get-CimInstance Win32_Process |
  Where-Object {
    $_.ProcessId -ne $current -and
      $_.ProcessId -ne $parent -and
      @("node.exe", "cmd.exe", "electron.exe", "esbuild.exe") -contains $_.Name -and
      $_.CommandLine -notmatch "stop-dev\\.cjs" -and
      $_.CommandLine -like "*$root*" -and
      (
        $_.CommandLine -match "concurrently|wait-on|vite|launch-electron|electron\\.exe|5173" -or
        $_.Name -eq "esbuild.exe"
      )
  } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
  }
`;

try {
  execFileSync('C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', [
    '-NoProfile',
    '-Command',
    script,
  ], { stdio: 'ignore' });
} catch {
  // Starting dev should not fail just because cleanup failed.
}
