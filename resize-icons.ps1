Add-Type -AssemblyName System.Drawing

$srcPath = "C:\Users\user\.gemini\antigravity-ide\brain\442e215e-acbc-41f3-a773-063a3bbafca9\.user_uploaded\media_1792155208170.jpg"
$baseDir = "C:\Users\user\.gemini\antigravity-ide\scratch\karaoke-app"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source image not found: $srcPath"
    exit 1
}

$srcImg = [System.Drawing.Bitmap]::FromFile($srcPath)
Write-Host "Source image loaded: $($srcImg.Width) x $($srcImg.Height)"

# Sample corner color for background
$cornerColor = $srcImg.GetPixel(15, 15)
$hexColor = "#{0:X2}{1:X2}{2:X2}" -f $cornerColor.R, $cornerColor.G, $cornerColor.B
Write-Host "Dominant Background Color: $hexColor"

# Function to resize bitmap with high quality bicubic interpolation
function Resize-Image {
    param(
        [System.Drawing.Bitmap]$source,
        [int]$width,
        [int]$height,
        [string]$outputPath
    )
    
    $destRect = New-Object System.Drawing.Rectangle(0, 0, $width, $height)
    $destImg = New-Object System.Drawing.Bitmap($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($destImg)
    
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    $graphics.DrawImage($source, $destRect, 0, 0, $source.Width, $source.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose()
    
    $dir = [System.IO.Path]::GetDirectoryName($outputPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    
    $destImg.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destImg.Dispose()
    Write-Host "Generated: $outputPath ($width x $height)"
}

# Function to generate adaptive foreground (with safe margin so it doesn't get clipped by circular/squircle mask)
function Create-Adaptive-Foreground {
    param(
        [System.Drawing.Bitmap]$source,
        [int]$canvasSize,
        [string]$outputPath
    )
    
    $canvas = New-Object System.Drawing.Bitmap($canvasSize, $canvasSize, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($canvas)
    
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    
    # In Android adaptive icons: safe area is center 72/108 (~76% scale)
    $innerSize = [int]($canvasSize * 0.78)
    $offset = [int](($canvasSize - $innerSize) / 2)
    
    $destRect = New-Object System.Drawing.Rectangle($offset, $offset, $innerSize, $innerSize)
    $graphics.DrawImage($source, $destRect, 0, 0, $source.Width, $source.Height, [System.Drawing.GraphicsUnit]::Pixel)
    $graphics.Dispose()
    
    $dir = [System.IO.Path]::GetDirectoryName($outputPath)
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Path $dir -Force | Out-Null
    }
    
    $canvas.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
    Write-Host "Generated Adaptive Foreground: $outputPath ($canvasSize x $canvasSize)"
}

# 1. Update Web Assets
$assetsDir = Join-Path $baseDir "assets"
Resize-Image $srcImg 512 512 (Join-Path $assetsDir "icon-512.png")
Resize-Image $srcImg 192 192 (Join-Path $assetsDir "icon-192.png")
Resize-Image $srcImg 128 128 (Join-Path $assetsDir "icon.png")
$srcImg.Save((Join-Path $assetsDir "icon.jpg"), [System.Drawing.Imaging.ImageFormat]::Jpeg)
Write-Host "Updated assets/icon.jpg"

# 2. Update Android Adaptive Background Colors
$resDir = Join-Path $baseDir "android\app\src\main\res"
$bgXmlPath = Join-Path $resDir "values\ic_launcher_background.xml"
$bgXmlContent = "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<resources>`n    <color name=`"ic_launcher_background`">$hexColor</color>`n</resources>"
Set-Content -Path $bgXmlPath -Value $bgXmlContent -Encoding UTF8
Write-Host "Updated $bgXmlPath with background $hexColor"

$drawableBgXmlPath = Join-Path $resDir "drawable\ic_launcher_background.xml"
$drawableBgContent = "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<vector xmlns:android=`"http://schemas.android.com/apk/res/android`"`n    android:width=`"108dp`"`n    android:height=`"108dp`"`n    android:viewportHeight=`"108`"`n    android:viewportWidth=`"108`">`n    <path`n        android:fillColor=`"$hexColor`"`n        android:pathData=`"M0,0h108v108h-108z`" />`n</vector>"
Set-Content -Path $drawableBgXmlPath -Value $drawableBgContent -Encoding UTF8
Write-Host "Updated $drawableBgXmlPath with background $hexColor"

# 3. Android Mipmap Densities:
$densities = @(
    @{ Name = "mipmap-mdpi";   IconSize = 48;  FgSize = 108 },
    @{ Name = "mipmap-hdpi";   IconSize = 72;  FgSize = 162 },
    @{ Name = "mipmap-xhdpi";  IconSize = 96;  FgSize = 216 },
    @{ Name = "mipmap-xxhdpi"; IconSize = 144; FgSize = 324 },
    @{ Name = "mipmap-xxxhdpi"; IconSize = 192; FgSize = 432 }
)

foreach ($d in $densities) {
    $folder = Join-Path $resDir $d.Name
    # Full icon (square)
    Resize-Image $srcImg $d.IconSize $d.IconSize (Join-Path $folder "ic_launcher.png")
    # Round icon (for launchers that use ic_launcher_round)
    Resize-Image $srcImg $d.IconSize $d.IconSize (Join-Path $folder "ic_launcher_round.png")
    # Adaptive foreground (scaled inside 108dp canvas)
    Create-Adaptive-Foreground $srcImg $d.FgSize (Join-Path $folder "ic_launcher_foreground.png")
}

# 4. Update Splash Images
$splashFiles = Get-ChildItem -Path $resDir -Filter "splash.png" -Recurse
foreach ($sf in $splashFiles) {
    $origSplash = [System.Drawing.Bitmap]::FromFile($sf.FullName)
    $w = $origSplash.Width
    $h = $origSplash.Height
    $origSplash.Dispose()

    $splashCanvas = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($splashCanvas)
    $g.Clear([System.Drawing.ColorTranslator]::FromHtml($hexColor))
    
    $iconDim = [int]([Math]::Min($w, $h) * 0.45)
    $posX = [int](($w - $iconDim) / 2)
    $posY = [int](($h - $iconDim) / 2)
    
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.DrawImage($srcImg, $posX, $posY, $iconDim, $iconDim)
    $g.Dispose()

    $splashCanvas.Save($sf.FullName, [System.Drawing.Imaging.ImageFormat]::Png)
    $splashCanvas.Dispose()
    Write-Host "Updated Splash: $($sf.FullName) ($w x $h)"
}

$srcImg.Dispose()
Write-Host "SUCCESS: All icons, launcher assets, and splash screens successfully generated and updated!"
