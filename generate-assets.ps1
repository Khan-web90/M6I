# Generates all image assets for the M61 restaurant rebuild.
# Uses System.Drawing.Common (built-in on .NET Framework / PowerShell 5+).

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = 'D:\workspace\m61-restaurant\assets'

# Brand palette
$crimson       = [System.Drawing.Color]::FromArgb(255, 122, 15, 27)
$crimsonDeep   = [System.Drawing.Color]::FromArgb(255, 92, 8, 16)
$crimsonDarker = [System.Drawing.Color]::FromArgb(255, 42, 3, 7)
$gold          = [System.Drawing.Color]::FromArgb(255, 201, 163, 90)
$goldSoft      = [System.Drawing.Color]::FromArgb(255, 232, 199, 122)
$goldDeep      = [System.Drawing.Color]::FromArgb(255, 164, 120, 54)
$cream         = [System.Drawing.Color]::FromArgb(255, 250, 246, 240)
$ink           = [System.Drawing.Color]::FromArgb(255, 26, 26, 26)

# ---------- helpers ----------

function New-GradientBrush($w, $h, [System.Drawing.Color]$c1, [System.Drawing.Color]$c2, $mode) {
    if (-not $mode) { $mode = 0 }  # 0 = Horizontal, 1 = Vertical, 2 = ForwardDiagonal, 3 = BackwardDiagonal
    return New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        (New-Object System.Drawing.PointF 0, 0),
        (New-Object System.Drawing.PointF $w, $h),
        $c1, $c2)
}

function Save-Jpeg($bitmap, $path, $quality = 88) {
    $dir = Split-Path -Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -Path $dir -ItemType Directory -Force | Out-Null }
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $qualityParam = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$quality)
    $params.Param[0] = $qualityParam
    $bitmap.Save($path, $codec, $params)
}

function Save-Png($bitmap, $path) {
    $dir = Split-Path -Path $path -Parent
    if (-not (Test-Path $dir)) { New-Item -Path $dir -ItemType Directory -Force | Out-Null }
    $bitmap.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function Draw-M61Mark($g, $x, $y, $size, $color, $alpha = 200) {
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb($alpha, $color)), ([single]($size / 18))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $pts = @(
        (New-Object System.Drawing.PointF ([single]($x + 0*$size/64)),  ([single]($y + 50*$size/64))),
        (New-Object System.Drawing.PointF ([single]($x + 14*$size/64)), ([single]($y + 14*$size/64))),
        (New-Object System.Drawing.PointF ([single]($x + 32*$size/64)), ([single]($y + 38*$size/64))),
        (New-Object System.Drawing.PointF ([single]($x + 50*$size/64)), ([single]($y + 14*$size/64))),
        (New-Object System.Drawing.PointF ([single]($x + 64*$size/64)), ([single]($y + 50*$size/64)))
    )
    $g.DrawLines($pen, $pts)
    $pen.Dispose()
}

function Draw-TextBlock($g, $text, $x, $y, $w, $h, $font, $color) {
    $brush = New-Object System.Drawing.SolidBrush $color
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 1   # Center
    $fmt.LineAlignment = 1 # Middle
    $rect = New-Object System.Drawing.RectangleF ([single]$x), ([single]$y), ([single]$w), ([single]$h)
    $g.DrawString($text, $font, $brush, $rect, $fmt)
    $brush.Dispose()
    $fmt.Dispose()
}

function Draw-TextBlockNear($g, $text, $x, $y, $w, $h, $font, $color) {
    $brush = New-Object System.Drawing.SolidBrush $color
    $fmt = New-Object System.Drawing.StringFormat
    $fmt.Alignment = 0   # Near
    $fmt.LineAlignment = 1 # Middle
    $rect = New-Object System.Drawing.RectangleF ([single]$x), ([single]$y), ([single]$w), ([single]$h)
    $g.DrawString($text, $font, $brush, $rect, $fmt)
    $brush.Dispose()
    $fmt.Dispose()
}

function Add-Noise($bitmap, $intensity = 8) {
    $w = $bitmap.Width; $h = $bitmap.Height
    $rnd = New-Object System.Random 42
    for ($i = 0; $i -lt ([int]($w * $h) / 40); $i++) {
        $x = $rnd.Next(0, $w); $y = $rnd.Next(0, $h)
        $v = $rnd.Next(0, $intensity * 2)
        $c = $bitmap.GetPixel($x, $y)
        $r = [Math]::Max(0, [Math]::Min(255, $c.R + $v - $intensity))
        $gg = [Math]::Max(0, [Math]::Min(255, $c.G + $v - $intensity))
        $b = [Math]::Max(0, [Math]::Min(255, $c.B + $v - $intensity))
        $bitmap.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($c.A, $r, $gg, $b))
    }
}

# Soft radial glow using nested ellipses with decreasing alpha
function Draw-SoftGlow($g, $cx, $cy, $radius, $color) {
    $steps = 18
    for ($s = $steps; $s -ge 1; $s--) {
        $r = $radius * ($s / $steps)
        $alpha = [int](255 * (1 - ($s / $steps)) * 0.18)
        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($alpha, $color))
        $g.FillEllipse($brush, ([single]($cx - $r)), ([single]($cy - $r)), ([single]($r * 2)), ([single]($r * 2)))
        $brush.Dispose()
    }
}

# ---------- 1. hero poster (1920x1080) ----------
$w = 1920; $h = 1080
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

$brushBg = New-GradientBrush $w $h $crimsonDeep $crimsonDarker 1
$g.FillRectangle($brushBg, 0, 0, $w, $h)
$brushBg.Dispose()

# Soft gold glow top-right + crimson glow bottom-left
Draw-SoftGlow $g ([single]($w * 0.85)) ([single]($h * 0.15)) 700 $goldSoft
Draw-SoftGlow $g ([single]($w * 0.15)) ([single]($h * 0.85)) 700 $crimson

# Faint big monogram
Draw-M61Mark $g ([single]($w * 0.5 - 360)) ([single]($h * 0.5 - 360)) 720 $goldSoft 28

# Wordmark "M61"
$serifFont = New-Object System.Drawing.Font 'Cormorant Garamond', 220, ([System.Drawing.FontStyle]::Italic)
Draw-TextBlock $g 'M61' 0 ([single]($h * 0.36)) $w 280 $serifFont ([System.Drawing.Color]::FromArgb(230, 232, 199, 122))
$serifFont.Dispose()

# Tagline
$sansFont = New-Object System.Drawing.Font 'Inter', 26, ([System.Drawing.FontStyle]::Regular)
Draw-TextBlock $g 'KARAHI  ·  BBQ  ·  CHINESE  ·  JUICE BAR' 0 ([single]($h * 0.62)) $w 60 $sansFont ([System.Drawing.Color]::FromArgb(180, 255, 255, 255))
$sansFont.Dispose()

# Location
$smallFont = New-Object System.Drawing.Font 'Inter', 18, ([System.Drawing.FontStyle]::Regular)
Draw-TextBlock $g 'ELITE MALL  ·  KUNWAR BLOCK  ·  TOP CITY-1  ·  ISLAMABAD' 0 ([single]($h * 0.78)) $w 60 $smallFont ([System.Drawing.Color]::FromArgb(140, 201, 163, 90))
$smallFont.Dispose()

Add-Noise $bmp 4
Save-Jpeg $bmp (Join-Path $root 'poster.jpg') 86
$g.Dispose(); $bmp.Dispose()
Write-Host "poster.jpg OK"

# ---------- 2. og-image (1200x630) ----------
$w = 1200; $h = 630
$bmp = New-Object System.Drawing.Bitmap $w, $h
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias
$brushBg = New-GradientBrush $w $h $crimson $crimsonDarker 0
$g.FillRectangle($brushBg, 0, 0, $w, $h)
$brushBg.Dispose()
Draw-SoftGlow $g ([single]($w * 0.15)) ([single]($h * 0.85)) 600 $goldSoft
Draw-M61Mark $g ([single]($w * 0.06)) ([single]($h * 0.18)) 380 $goldSoft 60
$serifFont = New-Object System.Drawing.Font 'Cormorant Garamond', 120, ([System.Drawing.FontStyle]::Italic)
Draw-TextBlock $g 'M61' ([single]($w * 0.5)) ([single]($h * 0.18)) ([single]($w * 0.45)) 180 $serifFont ([System.Drawing.Color]::FromArgb(255, 232, 199, 122))
$serifFont.Dispose()
$sansFont = New-Object System.Drawing.Font 'Inter', 22, ([System.Drawing.FontStyle]::Regular)
Draw-TextBlock $g 'Karahi · BBQ · Chinese · Juice Bar' ([single]($w * 0.5)) ([single]($h * 0.5)) ([single]($w * 0.45)) 50 $sansFont ([System.Drawing.Color]::FromArgb(220, 255, 255, 255))
$smallFont = New-Object System.Drawing.Font 'Inter', 16, ([System.Drawing.FontStyle]::Regular)
Draw-TextBlock $g 'Elite Mall, Kunwar Block, Top City-1, Islamabad' ([single]($w * 0.5)) ([single]($h * 0.62)) ([single]($w * 0.45)) 40 $smallFont ([System.Drawing.Color]::FromArgb(180, 201, 163, 90))
$sansFont.Dispose(); $smallFont.Dispose()
Add-Noise $bmp 3
Save-Jpeg $bmp (Join-Path $root 'og-image.jpg') 88
$g.Dispose(); $bmp.Dispose()
Write-Host "og-image.jpg OK"

# ---------- 3. deal images (4:3) ----------
$dealSpecs = @(
    @{ name = 'Chef Special Platter'; sub = 'rice · malai boti · seekh kabab · qalmi tikka · tandoori paratha · passion fruit mojito'; tone = 'karahi'; badge = "Chef's Pick" },
    @{ name = 'Single Handi Deal';     sub = 'chicken handi · daal tadka · arabian rice · tika boti · malai boti · seekh kabab · naan · coke'; tone = 'handi';  badge = 'Best Value' },
    @{ name = 'Single Chinese Deal';   sub = 'egg fried rice · chowmein · drum stick · manchurian · pepsi · fries · dhaka chicken'; tone = 'chinese'; badge = 'Wok Day' }
)
$dealsDir = Join-Path $root 'deals'
for ($i = 0; $i -lt $dealSpecs.Count; $i++) {
    $spec = $dealSpecs[$i]
    $w = 1200; $h = 900
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $c1 = $crimson; $c2 = $crimsonDarker
    if ($spec.tone -eq 'handi')   { $c1 = $goldDeep;    $c2 = $crimsonDeep }
    if ($spec.tone -eq 'chinese') { $c1 = $crimsonDeep; $c2 = [System.Drawing.Color]::FromArgb(255, 18, 8, 7) }
    $brush = New-GradientBrush $w $h $c1 $c2 1
    $g.FillRectangle($brush, 0, 0, $w, $h)
    $brush.Dispose()
    Draw-SoftGlow $g ([single]($w * 0.5)) ([single]($h * 0.55)) 500 $goldSoft

    # Decorative bowl
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(80, 232, 199, 122)), 4
    $g.DrawEllipse($pen, ([single]($w * 0.15)), ([single]($h * 0.42)), ([single]($w * 0.7)), ([single]($h * 0.36)))
    $g.DrawEllipse($pen, ([single]($w * 0.22)), ([single]($h * 0.5)), ([single]($w * 0.56)), ([single]($h * 0.22)))
    $pen.Dispose()

    # steam
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 232, 199, 122)), 3
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawCurve($pen, @(
        (New-Object System.Drawing.PointF ([single]($w * 0.42)), ([single]($h * 0.30))),
        (New-Object System.Drawing.PointF ([single]($w * 0.40)), ([single]($h * 0.22))),
        (New-Object System.Drawing.PointF ([single]($w * 0.44)), ([single]($h * 0.14))),
        (New-Object System.Drawing.PointF ([single]($w * 0.42)), ([single]($h * 0.08)))
    ))
    $g.DrawCurve($pen, @(
        (New-Object System.Drawing.PointF ([single]($w * 0.50)), ([single]($h * 0.30))),
        (New-Object System.Drawing.PointF ([single]($w * 0.52)), ([single]($h * 0.20))),
        (New-Object System.Drawing.PointF ([single]($w * 0.48)), ([single]($h * 0.12))),
        (New-Object System.Drawing.PointF ([single]($w * 0.50)), ([single]($h * 0.05)))
    ))
    $g.DrawCurve($pen, @(
        (New-Object System.Drawing.PointF ([single]($w * 0.58)), ([single]($h * 0.30))),
        (New-Object System.Drawing.PointF ([single]($w * 0.60)), ([single]($h * 0.22))),
        (New-Object System.Drawing.PointF ([single]($w * 0.56)), ([single]($h * 0.14))),
        (New-Object System.Drawing.PointF ([single]($w * 0.58)), ([single]($h * 0.08)))
    ))
    $pen.Dispose()

    Draw-M61Mark $g ([single]($w * 0.5 - 220)) ([single]($h * 0.5 - 220)) 440 $goldSoft 18

    # badge pill (rounded rectangle)
    $badgePath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $badgePath.AddArc(40, 40, 60, 60, 180, 90)
    $badgePath.AddArc(40 + 280 - 60, 40, 60, 60, 270, 90)
    $badgePath.AddArc(40 + 280 - 60, 40 + 60 - 60, 60, 60, 0, 90)
    $badgePath.AddArc(40, 40 + 60 - 60, 60, 60, 90, 90)
    $badgePath.CloseFigure()
    $badgeBrush = New-Object System.Drawing.SolidBrush $gold
    $g.FillPath($badgeBrush, $badgePath)
    $badgeBrush.Dispose()
    $badgeFont = New-Object System.Drawing.Font 'Inter', 18, ([System.Drawing.FontStyle]::Bold)
    Draw-TextBlock $g $spec.badge 40 40 280 60 $badgeFont $crimsonDeep
    $badgeFont.Dispose()
    $badgePath.Dispose()

    Add-Noise $bmp 3
    Save-Png $bmp (Join-Path $dealsDir ("deal-" + ($i + 1) + ".png"))
    $g.Dispose(); $bmp.Dispose()
    Write-Host ("deal-" + ($i + 1) + ".png OK")
}

# ---------- 4. gallery images (3:2) ----------
$galleryDir = Join-Path $root 'gallery'
$gallerySpecs = @(
    @{ name = 'Signature Karahi'; tone = 'karahi' },
    @{ name = 'Handi & Boti';     tone = 'handi'  },
    @{ name = 'Wok & Rice';       tone = 'chinese'},
    @{ name = 'The Room';         tone = 'room'   },
    @{ name = 'The Bar';          tone = 'bar'    },
    @{ name = 'Tandoor';          tone = 'bbq'    }
)
foreach ($i in 0..($gallerySpecs.Count - 1)) {
    $spec = $gallerySpecs[$i]
    $w = 900; $h = 600
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $c1 = $crimson; $c2 = $crimsonDarker
    if ($spec.tone -eq 'handi')   { $c1 = $goldDeep; $c2 = $crimsonDeep }
    if ($spec.tone -eq 'chinese') { $c1 = $crimsonDeep; $c2 = [System.Drawing.Color]::FromArgb(255, 18, 8, 7) }
    if ($spec.tone -eq 'room')    { $c1 = $crimsonDeep; $c2 = $crimsonDarker }
    if ($spec.tone -eq 'bar')     { $c1 = $goldDeep; $c2 = $crimson }
    if ($spec.tone -eq 'bbq')     { $c1 = $crimson; $c2 = [System.Drawing.Color]::FromArgb(255, 18, 8, 7) }
    $brush = New-GradientBrush $w $h $c1 $c2 2
    $g.FillRectangle($brush, 0, 0, $w, $h)
    $brush.Dispose()
    Draw-SoftGlow $g ([single]($w * 0.85)) ([single]($h * 0.15)) 400 $goldSoft
    Draw-M61Mark $g ([single]($w * 0.5 - 180)) ([single]($h * 0.45 - 180)) 360 $goldSoft 22

    $serifFont = New-Object System.Drawing.Font 'Cormorant Garamond', 38, ([System.Drawing.FontStyle]::Italic)
    Draw-TextBlock $g $spec.name 0 ([single]($h * 0.78)) $w 60 $serifFont ([System.Drawing.Color]::FromArgb(240, 232, 199, 122))
    $serifFont.Dispose()
    $smallFont = New-Object System.Drawing.Font 'Inter', 11, ([System.Drawing.FontStyle]::Regular)
    Draw-TextBlock $g 'M61 · ELITE MALL' 0 ([single]($h * 0.92)) $w 30 $smallFont ([System.Drawing.Color]::FromArgb(150, 201, 163, 90))
    $smallFont.Dispose()

    Add-Noise $bmp 3
    Save-Jpeg $bmp (Join-Path $galleryDir ("gal-" + ($i + 1) + ".jpg")) 84
    $g.Dispose(); $bmp.Dispose()
    Write-Host ("gal-" + ($i + 1) + ".jpg OK")
}

# ---------- 5. menu page scans (3:4) ----------
$menuDir = Join-Path $root 'menu'
$menuSpecs = @(
    @{ num = 1; title = 'Karahi · Handi · Starters'; rows = @(
        @{ n = 'M61 Special Karahi';      p = 'Rs. 2,599 / 1,325' },
        @{ n = 'Chicken Karahi';          p = 'Rs. 2,199 / 1,125' },
        @{ n = 'Mutton Karahi';           p = 'Rs. 2,499 / 1,275' },
        @{ n = 'Chicken Handi';           p = 'Rs. 2,099 / 1,075' },
        @{ n = 'M61 Special Handi';       p = 'Rs. 2,499 / 1,275' },
        @{ n = 'Chicken Shinwari Karahi'; p = 'Rs. 2,199 / 1,125' },
        @{ n = 'Afghani Karahi';          p = 'Rs. 2,199 / 1,125' },
        @{ n = 'Paneer Karahi';           p = 'Rs. 1,499 / 775'   },
        @{ n = 'Chicken Seekh Kabab';     p = 'Rs. 1,150'         },
        @{ n = 'Malai Boti';              p = 'Rs. 1,250'         }
    )},
    @{ num = 2; title = 'Chinese · Rice · Traditional'; rows = @(
        @{ n = 'Chicken Chilli Dry';      p = 'Rs. 2,150' },
        @{ n = 'Sesame Chicken';          p = 'Rs. 1,875' },
        @{ n = 'M61 Special Rice';        p = 'Rs. 1,499' },
        @{ n = 'Chilli Fried Rice';       p = 'Rs. 1,375' },
        @{ n = 'Chicken Biryani';         p = 'Rs. 1,350' },
        @{ n = 'Mutton Biryani';          p = 'Rs. 1,650' },
        @{ n = 'Haleem';                  p = 'Rs. 1,099' },
        @{ n = 'Nihari';                  p = 'Rs. 1,399' },
        @{ n = 'Paya';                    p = 'Rs. 1,499' },
        @{ n = 'Daal Makhani';            p = 'Rs. 999'   }
    )},
    @{ num = 3; title = 'BBQ · Tandoor · Naan'; rows = @(
        @{ n = 'Chicken Tikka';           p = 'Rs. 1,150' },
        @{ n = 'Malai Boti';              p = 'Rs. 1,250' },
        @{ n = 'Hariyali Boti';           p = 'Rs. 1,250' },
        @{ n = 'Seekh Kabab';             p = 'Rs. 1,100' },
        @{ n = 'Reshmi Kabab';            p = 'Rs. 1,200' },
        @{ n = 'Chapli Kabab';            p = 'Rs. 1,250' },
        @{ n = 'Tandoori Chicken (Full)'; p = 'Rs. 1,999' },
        @{ n = 'Naan';                    p = 'Rs. 90'    },
        @{ n = 'Garlic Naan';             p = 'Rs. 140'   },
        @{ n = 'Tandoori Paratha';        p = 'Rs. 160'   }
    )},
    @{ num = 4; title = 'Sweets · Cold · Juice Bar'; rows = @(
        @{ n = 'Gulab Jamun';             p = 'Rs. 350'   },
        @{ n = 'Kulfi Falooda';           p = 'Rs. 499'   },
        @{ n = 'Mango Lassi';             p = 'Rs. 399'   },
        @{ n = 'Fresh Lime Soda';         p = 'Rs. 299'   },
        @{ n = 'Passion Fruit Mojito';    p = 'Rs. 549'   },
        @{ n = 'Strawberry Smoothie';     p = 'Rs. 699'   },
        @{ n = 'Mango Slush';             p = 'Rs. 399'   },
        @{ n = 'Oreo Shake';              p = 'Rs. 649'   },
        @{ n = 'Lime Iced Tea';           p = 'Rs. 339'   },
        @{ n = 'Peach Iced Tea';          p = 'Rs. 429'   }
    )}
)
foreach ($spec in $menuSpecs) {
    $w = 800; $h = 1100
    $bmp = New-Object System.Drawing.Bitmap $w, $h
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAlias

    $bg = New-Object System.Drawing.SolidBrush $cream
    $g.FillRectangle($bg, 0, 0, $w, $h)
    $bg.Dispose()

    # header band
    $headerH = 220
    $headerBrush = New-Object System.Drawing.SolidBrush $crimson
    $g.FillRectangle($headerBrush, 0, 0, $w, $headerH)
    $headerBrush.Dispose()
    Draw-M61Mark $g 60 50 120 ([System.Drawing.Color]::FromArgb(255, 232, 199, 122)) 220

    $serifFont = New-Object System.Drawing.Font 'Cormorant Garamond', 64, ([System.Drawing.FontStyle]::Italic)
    Draw-TextBlockNear $g 'M61' 200 60 400 90 $serifFont ([System.Drawing.Color]::FromArgb(255, 232, 199, 122))
    $serifFont.Dispose()
    $sansFont = New-Object System.Drawing.Font 'Inter', 11, ([System.Drawing.FontStyle]::Regular)
    Draw-TextBlockNear $g 'RESTAURANT  ·  ELITE MALL' 200 130 500 30 $sansFont ([System.Drawing.Color]::FromArgb(200, 232, 199, 122))
    $sansFont.Dispose()

    $bigFont = New-Object System.Drawing.Font 'Cormorant Garamond', 28, ([System.Drawing.FontStyle]::Italic)
    Draw-TextBlockNear $g ('Page ' + $spec.num) 60 150 200 50 $bigFont ([System.Drawing.Color]::FromArgb(220, 201, 163, 90))
    $bigFont.Dispose()

    $catFont = New-Object System.Drawing.Font 'Cormorant Garamond', 38, ([System.Drawing.FontStyle]::Bold)
    Draw-TextBlock $g $spec.title 0 250 $w 70 $catFont $crimson
    $catFont.Dispose()

    $rule = New-Object System.Drawing.Pen $gold, 3
    $g.DrawLine($rule, 0, 340, $w, 340)
    $rule.Dispose()

    $rowFont = New-Object System.Drawing.Font 'Inter', 16, ([System.Drawing.FontStyle]::Regular)
    $rowPriceFont = New-Object System.Drawing.Font 'Inter', 14, ([System.Drawing.FontStyle]::Regular)
    $linePen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 26, 26, 26)), 1
    $y = 380
    foreach ($r in $spec.rows) {
        $g.DrawString($r.n, $rowFont, [System.Drawing.Brushes]::Black, 60, $y)
        $priceSize = $g.MeasureString($r.p, $rowPriceFont)
        $priceBrush = New-Object System.Drawing.SolidBrush $crimson
        $g.DrawString($r.p, $rowPriceFont, $priceBrush, ([single]($w - 60 - $priceSize.Width)), ([single]$y))
        $priceBrush.Dispose()
        $nameSize = $g.MeasureString($r.n, $rowFont)
        $leaderY = [single]($y + 22)
        $leaderStart = [single](60 + $nameSize.Width + 8)
        $leaderEnd = [single]($w - 60 - $priceSize.Width - 8)
        for ($lx = $leaderStart; $lx -lt $leaderEnd; $lx += 6) {
            $g.DrawLine($linePen, $lx, $leaderY, ([single]($lx + 3)), $leaderY)
        }
        $y += 56
    }
    $rowFont.Dispose(); $rowPriceFont.Dispose(); $linePen.Dispose()

    $footFont = New-Object System.Drawing.Font 'Inter', 11, ([System.Drawing.FontStyle]::Regular)
    Draw-TextBlock $g ('All prices in PKR · ' + (Get-Date -Format 'yyyy') + ' · Subject to market availability') 0 ($h - 60) $w 40 $footFont ([System.Drawing.Color]::FromArgb(140, 26, 26, 26))
    $footFont.Dispose()

    Add-Noise $bmp 2
    Save-Jpeg $bmp (Join-Path $menuDir ("menu-page-" + $spec.num + ".jpg")) 86
    $g.Dispose(); $bmp.Dispose()
    Write-Host ("menu-page-" + $spec.num + ".jpg OK")
}

Write-Host "All assets generated."
