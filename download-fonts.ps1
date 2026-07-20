# Create fonts directory if it doesn't exist
$fontsDir = "public/fonts"
if (-not (Test-Path $fontsDir)) {
    New-Item -ItemType Directory -Path $fontsDir | Out-Null
}

# Font URLs
$fontUrls = @{
    "Cairo-Regular.ttf" = "https://github.com/google/fonts/raw/main/ofl/cairo/Cairo-Regular.ttf"
    "Cairo-Bold.ttf" = "https://github.com/google/fonts/raw/main/ofl/cairo/Cairo-Bold.ttf"
    "Rubik-Regular.ttf" = "https://github.com/google/fonts/raw/main/ofl/rubik/Rubik-Regular.ttf"
    "Rubik-Bold.ttf" = "https://github.com/google/fonts/raw/main/ofl/rubik/Rubik-Bold.ttf"
}

# Download each font
foreach ($font in $fontUrls.GetEnumerator()) {
    $fontPath = Join-Path $fontsDir $font.Key
    Write-Host "Downloading $($font.Key)..."
    try {
        Invoke-WebRequest -Uri $font.Value -OutFile $fontPath -UseBasicParsing
        Write-Host "Successfully downloaded $($font.Key)" -ForegroundColor Green
    } catch {
        Write-Host "Failed to download $($font.Key): $_" -ForegroundColor Red
    }
}

Write-Host "\nFont download process completed." -ForegroundColor Cyan
