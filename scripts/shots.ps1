param(
  [string]$Base = "http://localhost:5178/word/",
  [string]$OutDir = "data\shots"
)
$edge = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$tmp = Join-Path $env:TEMP "edge-shot"

$pages = @(
  @{ name = 'home';     hash = '#/home';     size = '1280,1000' },
  @{ name = 'study';    hash = '#/study';    size = '1280,1000' },
  @{ name = 'quiz';     hash = '#/quiz';     size = '1280,1000' },
  @{ name = 'list';     hash = '#/list';     size = '1280,1000' },
  @{ name = 'stats';    hash = '#/stats';    size = '1280,1100' },
  @{ name = 'settings'; hash = '#/settings'; size = '1280,1000' },
  @{ name = 'mobile';   hash = '#/home';     size = '390,844' }
)

foreach ($p in $pages) {
  $out = Join-Path $OutDir "$($p.name).png"
  & $edge --headless=new --disable-gpu --no-sandbox --hide-scrollbars `
    --window-size=$($p.size) --screenshot="$out" --virtual-time-budget=5000 `
    --user-data-dir="$tmp" "$Base$($p.hash)" 2>$null | Out-Null
  if (Test-Path $out) { "OK  $($p.name)  {0:N0} bytes" -f (Get-Item $out).Length }
  else { "FAIL $($p.name)" }
}
