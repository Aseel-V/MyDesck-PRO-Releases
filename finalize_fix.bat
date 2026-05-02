@echo off
echo Finalizing White Screen Fix...
"C:\Program Files\Git\cmd\git.exe" add .
"C:\Program Files\Git\cmd\git.exe" commit -m "fix: resolve white screen by fixing production paths and adding safety checks"
"C:\Program Files\Git\cmd\git.exe" push
echo Creating tag v0.0.39 to trigger build...
"C:\Program Files\Git\cmd\git.exe" tag v0.0.39
"C:\Program Files\Git\cmd\git.exe" push origin v0.0.39
echo Done! Please check your GitHub Actions tab.
pause
