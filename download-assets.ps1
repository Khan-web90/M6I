$ErrorActionPreference = 'Stop'
$urls = @{
  'D:\workspace\m61-restaurant\assets\hero.mp4'  = 'https://5fh7uei4fzju1.space.minimax.io/assets/hero.mp4'
  'D:\workspace\m61-restaurant\assets\menu-item-icons.css' = 'https://5fh7uei4fzju1.space.minimax.io/assets/menu-item-icons.css'
  'D:\workspace\m61-restaurant\assets\og-image.jpg' = 'https://5fh7uei4fzju1.space.minimax.io/assets/og-image.jpg'
}
$wc = New-Object System.Net.WebClient
$wc.Headers.Add('User-Agent', 'Mozilla/5.0 (Windows NT 10.0)')
foreach ($entry in $urls.GetEnumerator()) {
  $out = $entry.Key
  $url = $entry.Value
  try {
    $wc.DownloadFile($url, $out)
    $size = (Get-Item $out).Length
    Write-Host ("OK {0} = {1} bytes" -f $out, $size)
  } catch {
    Write-Host ("FAIL {0}: {1}" -f $out, $_.Exception.Message)
  }
}
