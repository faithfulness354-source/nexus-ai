Add-Type -AssemblyName System.Drawing

$fontFile = "C:\Users\faith\Downloads\nexus_roleplay\nextjs_space\_ad\fonts\Cinzel-Bold.ttf"
$outDir = "C:\Users\faith\Downloads\nexus_roleplay\nextjs_space\_ad\captions"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

$collection = New-Object System.Drawing.Text.PrivateFontCollection
$collection.AddFontFile($fontFile)
$family = $collection.Families[0]

function New-Caption {
  param(
    [string]$Path,
    [string[]]$Lines,
    [int[]]$Sizes,
    [int]$Gap = 18
  )
  $bmp = New-Object System.Drawing.Bitmap 1920, 1080
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $format = [System.Drawing.StringFormat]::GenericTypographic
  $format.FormatFlags = [System.Drawing.StringFormatFlags]::MeasureTrailingSpaces

  $prepared = @()
  $totalH = 0
  for ($i = 0; $i -lt $Lines.Count; $i++) {
    $text = $Lines[$i].ToUpperInvariant()
    $font = New-Object System.Drawing.Font($family, $Sizes[$i], [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $tracking = [Math]::Max(6, [int]($Sizes[$i] * 0.18))
    $chars = $text.ToCharArray()
    $width = 0
    $heights = @()
    foreach ($ch in $chars) {
      $measured = $g.MeasureString([string]$ch, $font, 400, $format)
      $width += $measured.Width + $tracking
      $heights += $measured.Height
    }
    if ($chars.Count -gt 0) { $width -= $tracking }
    $height = ($heights | Measure-Object -Maximum).Maximum
    $prepared += [pscustomobject]@{ Text = $text; Font = $font; Tracking = $tracking; Width = $width; Height = $height }
    $totalH += $height
  }
  if ($prepared.Count -gt 1) { $totalH += $Gap * ($prepared.Count - 1) }
  $y = 1080 - 150 - $totalH

  $top = [System.Drawing.Color]::FromArgb(255, 255, 236, 186)
  $bottom = [System.Drawing.Color]::FromArgb(255, 176, 122, 38)
  foreach ($line in $prepared) {
    $x = (1920 - $line.Width) / 2
    $rect = New-Object System.Drawing.RectangleF $x, $y, ([Math]::Max(1, $line.Width)), $line.Height
    $gold = New-Object System.Drawing.Drawing2D.LinearGradientBrush $rect, $top, $bottom, 90
    $shadow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(190, 8, 6, 2))
    $glow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(90, 90, 58, 12))
    foreach ($ch in $line.Text.ToCharArray()) {
      $measured = $g.MeasureString([string]$ch, $line.Font, 400, $format)
      foreach ($ox in -3..3) {
        foreach ($oy in -2..3) {
          if ($ox -eq 0 -and $oy -eq 0) { continue }
          $g.DrawString([string]$ch, $line.Font, $(if ([Math]::Abs($ox) + [Math]::Abs($oy) -le 2) { $glow } else { $shadow }), $x + $ox, $y + $oy + 2, $format)
        }
      }
      $g.DrawString([string]$ch, $line.Font, $gold, $x, $y, $format)
      $x += $measured.Width + $line.Tracking
    }
    $gold.Dispose()
    $shadow.Dispose()
    $glow.Dispose()
    $y += $line.Height + $Gap
    $line.Font.Dispose()
  }
  $g.Dispose()
  $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

$captions = @(
  @{ Name = "01.png"; Lines = @("Real connections."); Sizes = @(62) },
  @{ Name = "02.png"; Lines = @("Unscripted moments."); Sizes = @(62) },
  @{ Name = "03.png"; Lines = @("One more sunset."); Sizes = @(62) },
  @{ Name = "04.png"; Lines = @("Step into any world."); Sizes = @(58) },
  @{ Name = "05.png"; Lines = @("Command the unknown."); Sizes = @(62) },
  @{ Name = "06.png"; Lines = @("Run your path."); Sizes = @(62) },
  @{ Name = "07.png"; Lines = @("Stand your ground."); Sizes = @(58) },
  @{ Name = "08.png"; Lines = @("Keep climbing."); Sizes = @(62) },
  @{ Name = "09.png"; Lines = @("Infinite Adventures."); Sizes = @(58) },
  @{ Name = "10.png"; Lines = @("Worlds beyond."); Sizes = @(62) },
  @{ Name = "11.png"; Lines = @("Find your intensity."); Sizes = @(62) },
  @{ Name = "12.png"; Lines = @("Blades in the dark."); Sizes = @(58) },
  @{ Name = "13.png"; Lines = @("Own the night."); Sizes = @(62) },
  @{ Name = "14.png"; Lines = @("Your Story Begins Now.", "Download on Mobile & Web"); Sizes = @(52, 32) }
)

foreach ($caption in $captions) {
  New-Caption -Path (Join-Path $outDir $caption.Name) -Lines $caption.Lines -Sizes $caption.Sizes
  Write-Output $caption.Name
}
Write-Output "CAPTIONS"
