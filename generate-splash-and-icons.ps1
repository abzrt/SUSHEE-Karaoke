Add-Type -AssemblyName System.Drawing

$srcPath = "d:\SUSHEE Projects\SUSHEE-Karaoke\assets\splash-photo.jpg"
$baseDir = "d:\SUSHEE Projects\SUSHEE-Karaoke"

if (-not (Test-Path $srcPath)) {
    Write-Error "Source image not found: $srcPath"
    exit 1
}

$srcImg = [System.Drawing.Bitmap]::FromFile($srcPath)
Write-Host "Source image loaded: $($srcImg.Width) x $($srcImg.Height)"

# Get corner color
$cornerPx = $srcImg.GetPixel(15, 15)
$hexColor = "#{0:X2}{1:X2}{2:X2}" -f $cornerPx.R, $cornerPx.G, $cornerPx.B
Write-Host "Detected Corner Color: $hexColor"
$bgColor = [System.Drawing.ColorTranslator]::FromHtml($hexColor)

# Helper function to resize bitmap
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

# Function to create adaptive foreground for Android icon
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

# 1. Generate Web Assets
$assetsDir = Join-Path $baseDir "assets"
Resize-Image $srcImg 512 512 (Join-Path $assetsDir "icon-512.png")
Resize-Image $srcImg 192 192 (Join-Path $assetsDir "icon-192.png")
Resize-Image $srcImg 128 128 (Join-Path $assetsDir "icon.png")

# 2. Update Android Adaptive Background
$resDir = Join-Path $baseDir "android\app\src\main\res"
$bgXmlPath = Join-Path $resDir "values\ic_launcher_background.xml"
$bgXmlContent = "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<resources>`n    <color name=`"ic_launcher_background`">$hexColor</color>`n</resources>"
Set-Content -Path $bgXmlPath -Value $bgXmlContent -Encoding UTF8

$drawableBgXmlPath = Join-Path $resDir "drawable\ic_launcher_background.xml"
$drawableBgContent = "<?xml version=`"1.0`" encoding=`"utf-8`"?>`n<vector xmlns:android=`"http://schemas.android.com/apk/res/android`"`n    android:width=`"108dp`"`n    android:height=`"108dp`"`n    android:viewportHeight=`"108`"`n    android:viewportWidth=`"108`">`n    <path`n        android:fillColor=`"$hexColor`"`n        android:pathData=`"M0,0h108v108h-108z`" />`n</vector>"
Set-Content -Path $drawableBgXmlPath -Value $drawableBgContent -Encoding UTF8

# 3. Android Mipmap Densities
$densities = @(
    @{ Name = "mipmap-mdpi";   IconSize = 48;  FgSize = 108 },
    @{ Name = "mipmap-hdpi";   IconSize = 72;  FgSize = 162 },
    @{ Name = "mipmap-xhdpi";  IconSize = 96;  FgSize = 216 },
    @{ Name = "mipmap-xxhdpi"; IconSize = 144; FgSize = 324 },
    @{ Name = "mipmap-xxxhdpi"; IconSize = 192; FgSize = 432 }
)

foreach ($d in $densities) {
    $folder = Join-Path $resDir $d.Name
    Resize-Image $srcImg $d.IconSize $d.IconSize (Join-Path $folder "ic_launcher.png")
    Resize-Image $srcImg $d.IconSize $d.IconSize (Join-Path $folder "ic_launcher_round.png")
    Create-Adaptive-Foreground $srcImg $d.FgSize (Join-Path $folder "ic_launcher_foreground.png")
}

# 4. Generate Android Splash Screens
$splashFiles = Get-ChildItem -Path $resDir -Filter "splash.png" -Recurse
foreach ($sf in $splashFiles) {
    $origSplash = [System.Drawing.Bitmap]::FromFile($sf.FullName)
    $w = $origSplash.Width
    $h = $origSplash.Height
    $origSplash.Dispose()

    $splashCanvas = New-Object System.Drawing.Bitmap($w, $h, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($splashCanvas)

    # Create vertical gradient matching top deep red to bottom dark jacket
    $topColor = [System.Drawing.ColorTranslator]::FromHtml("#3d0104")
    $bottomColor = [System.Drawing.ColorTranslator]::FromHtml("#07070a")
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.Point(0, 0)),
        (New-Object System.Drawing.Point(0, $h)),
        $topColor,
        $bottomColor
    )
    $g.FillRectangle($brush, 0, 0, $w, $h)
    $brush.Dispose()
    
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    # If portrait, size image nicely in upper-center
    if ($h > $w) {
        $dim = [int][Math]::Min($w * 0.88, $h * 0.56)
        $posX = [int](($w - $dim) / 2)
        $posY = [int](($h - $dim) * 0.40)
        $g.DrawImage($srcImg, $posX, $posY, $dim, $dim)
    } else {
        # Landscape: photo centered
        $dim = [int]($h * 0.82)
        $posX = [int](($w - $dim) / 2)
        $posY = [int](($h - $dim) / 2)
        $g.DrawImage($srcImg, $posX, $posY, $dim, $dim)
    }
    
    $g.Dispose()
    $splashCanvas.Save($sf.FullName, [System.Drawing.Imaging.ImageFormat]::Png)
    $splashCanvas.Dispose()
    Write-Host "Updated Splash Screen: $($sf.FullName) ($w x $h)"
}

$srcImg.Dispose()
Write-Host "ALL SPLASH & ICON ASSETS SUCCESSFULLY GENERATED!"
