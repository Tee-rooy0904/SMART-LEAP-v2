param(
    [Parameter(Mandatory = $true)][string]$OutputPath,
    [Parameter(Mandatory = $true)][string]$RecipientName,
    [Parameter(Mandatory = $true)][string]$IssueDateText,
    [Parameter(Mandatory = $true)][string]$VenueText,
    [Parameter(Mandatory = $true)][string]$AssetsRoot
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function Get-FontSafe {
    param(
        [string]$Family,
        [float]$Size,
        [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
    )

    try {
        return New-Object System.Drawing.Font($Family, $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
    } catch {
        return New-Object System.Drawing.Font('Arial', $Size, $Style, [System.Drawing.GraphicsUnit]::Pixel)
    }
}

function Open-Image {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $null }
    return [System.Drawing.Image]::FromFile($Path)
}

$width = 3508
$height = 2480
$slideWidthCm = 29.7
$slideHeightCm = 21.0
$pxPerCmX = $width / $slideWidthCm
$pxPerCmY = $height / $slideHeightCm

function CmX([double]$cm) { return [int][Math]::Round($cm * $pxPerCmX) }
function CmY([double]$cm) { return [int][Math]::Round($cm * $pxPerCmY) }
function Pt([double]$points) { return [float]($points * 300.0 / 72.0) }

$outputDirectory = Split-Path -Parent $OutputPath
if (-not (Test-Path $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
}

$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$bitmap.SetResolution(300, 300)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$graphics.Clear([System.Drawing.Color]::White)

$formatCenter = New-Object System.Drawing.StringFormat
$formatCenter.Alignment = [System.Drawing.StringAlignment]::Center
$formatCenter.LineAlignment = [System.Drawing.StringAlignment]::Near

$formatRight = New-Object System.Drawing.StringFormat
$formatRight.Alignment = [System.Drawing.StringAlignment]::Far
$formatRight.LineAlignment = [System.Drawing.StringAlignment]::Near

$design1 = Open-Image (Join-Path $AssetsRoot 'public/assets/img/Design1.png')
$design2 = Open-Image (Join-Path $AssetsRoot 'public/assets/img/Design2.png')
$design3 = Open-Image (Join-Path $AssetsRoot 'public/assets/img/Design3.png')
$design4 = Open-Image (Join-Path $AssetsRoot 'public/assets/img/Design4.png')
$design5 = Open-Image (Join-Path $AssetsRoot 'public/assets/img/Design5.png')
$butuanOn = Open-Image (Join-Path $AssetsRoot 'public/assets/img/NewButuanon.png')
$cswdLogo = Open-Image (Join-Path $AssetsRoot 'public/assets/img/CSWD logo.png')

try {
    if ($design3 -ne $null) {
        $graphics.DrawImage($design3, (CmX 0.0), (CmY -0.06), (CmX 33.12), (CmY 11.31))
    }

    if ($design5 -ne $null) {
        $graphics.DrawImage($design5, (CmX -29.16), (CmY -3.73), (CmX 46.12), (CmY 18.82))
    }

    if ($design1 -ne $null) {
        $x = 2680
        $y = 1690
        $w = 2320
        $h = 1340
        $graphics.TranslateTransform($x + ($w / 2), $y + ($h / 2))
        $graphics.RotateTransform(0)
        $graphics.DrawImage($design1, -($w / 2), -($h / 2), $w, $h)
        $graphics.ResetTransform()
    }

    if ($cswdLogo -ne $null) {
        $graphics.DrawImage($cswdLogo, (CmX -1.2), (CmY 0.86), (CmX 10.97), (CmY 6.17))
    }

    if ($design2 -ne $null) {
        $graphics.DrawImage($design2, (CmX -2.68), (CmY 14.03), (CmX 3.83), (CmY 1.06))
        $graphics.DrawImage($design2, (CmX 28.47), (CmY 13.85), (CmX 3.83), (CmY 1.06))
    }

    if ($butuanOn -ne $null) {
        $graphics.DrawImage($butuanOn, (CmX 0.46), (CmY 18.62), (CmX 6.01), (CmY 2.45))
    }

    $whiteBrush = [System.Drawing.Brushes]::White
    $blackBrush = [System.Drawing.Brushes]::Black
    $blueBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(43, 77, 145))
    $mutedBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(96, 103, 118))
    $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(82, 82, 82), 2)

    $republicFont = Get-FontSafe -Family 'Arial' -Size 44 -Style ([System.Drawing.FontStyle]::Regular)
    $deptFont = Get-FontSafe -Family 'Arial' -Size 40 -Style ([System.Drawing.FontStyle]::Bold)
    $addressFont = Get-FontSafe -Family 'Arial' -Size 46 -Style ([System.Drawing.FontStyle]::Regular)
    $titleFont = Get-FontSafe -Family 'Times New Roman' -Size 190 -Style ([System.Drawing.FontStyle]::Regular)
    $subtitleFont = Get-FontSafe -Family 'Times New Roman' -Size 112 -Style ([System.Drawing.FontStyle]::Bold)
    $recipientHintFont = Get-FontSafe -Family 'Arial' -Size (Pt 14.0) -Style ([System.Drawing.FontStyle]::Regular)
    $recipientFont = Get-FontSafe -Family 'Times New Roman' -Size 92 -Style ([System.Drawing.FontStyle]::Bold)
    $bodyFont = Get-FontSafe -Family 'Arial' -Size (Pt 12.0) -Style ([System.Drawing.FontStyle]::Bold)
    $issueFont = Get-FontSafe -Family 'Arial' -Size (Pt 12.0) -Style ([System.Drawing.FontStyle]::Bold)
    $signatoryFont = Get-FontSafe -Family 'Arial' -Size 36 -Style ([System.Drawing.FontStyle]::Bold)
    $signatoryTitleFont = Get-FontSafe -Family 'Arial' -Size 44 -Style ([System.Drawing.FontStyle]::Regular)

    $graphics.DrawString('Republic of the Philippines', $republicFont, $whiteBrush, [System.Drawing.RectangleF]::new(1940, 56, 1320, 40), $formatCenter)
    $graphics.DrawString('CITY SOCIAL WELFARE AND DEVELOPMENT DEPARTMENT', $deptFont, $whiteBrush, [System.Drawing.RectangleF]::new(1860, 118, 1480, 58), $formatCenter)
    $graphics.DrawString('J. Rosales Avenue, Butuan City', $addressFont, $whiteBrush, [System.Drawing.RectangleF]::new(1940, 178, 1320, 42), $formatCenter)

    $graphics.DrawString('CERTIFICATE', $titleFont, $whiteBrush, [System.Drawing.RectangleF]::new(1710, 270, 1780, 305), $formatCenter)
    $graphics.DrawString('OF PARTICIPATION', $subtitleFont, $whiteBrush, [System.Drawing.RectangleF]::new(1990, 465, 1270, 205), $formatCenter)

    $graphics.DrawString('is hereby given to', $recipientHintFont, $blackBrush, [System.Drawing.RectangleF]::new(960, 1115, 1580, 135), $formatCenter)
    $graphics.DrawString($RecipientName, $recipientFont, $blueBrush, [System.Drawing.RectangleF]::new(850, 1300, 1800, 120), $formatCenter)
    $graphics.DrawLine($linePen, 840, 1400, 2685, 1400)

    $bodyText = 'For actively participating in the Capacity-Building Activities of the Sustainable Market and Technology-Driven Livelihood and Employment Assistance Program (SMART LEAP) and for fulfilling the attendance requirements during the period leading up to the turnover of sub-projects and the provision of livelihood assistance to SMART LEAP beneficiaries.'
    $graphics.DrawString($bodyText, $bodyFont, $blackBrush, [System.Drawing.RectangleF]::new((CmX 4.29), (CmY 12.06), (CmX 23.09), (CmY 3.59)), $formatCenter)

    $issueLine = "Given this $IssueDateText, at $VenueText."
    $graphics.DrawString($issueLine, $issueFont, $blackBrush, [System.Drawing.RectangleF]::new((CmX 4.81), (CmY 15.36), (CmX 21.72), (CmY 0.82)), $formatCenter)

    if ($design4 -ne $null) {
        $graphics.DrawImage($design4, (CmX 10.93), (CmY 17.85), (CmX 7.59), (CmY 2.38))
    }

    $graphics.DrawString('GOLDA V. VERGARA-POCON, RSW, MSSW, CESE', $signatoryFont, $blackBrush, [System.Drawing.RectangleF]::new((CmX 6.95), (CmY 19.48), (CmX 15.56), (CmY 1.26)), $formatCenter)
    $graphics.DrawString('CSWDO/CGDH II', $signatoryTitleFont, $mutedBrush, [System.Drawing.RectangleF]::new((CmX 8.65), (CmY 20.10), (CmX 12.2), 48), $formatCenter)
} finally {
    foreach ($asset in @($design1, $design2, $design3, $design4, $design5, $butuanOn, $cswdLogo)) {
        if ($asset -ne $null) { $asset.Dispose() }
    }
}

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' } | Select-Object -First 1
$encoder = [System.Drawing.Imaging.Encoder]::Quality
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, 100L)

$bitmap.Save($OutputPath, $jpegCodec, $encoderParams)

$encoderParams.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$formatRight.Dispose()
$formatCenter.Dispose()
