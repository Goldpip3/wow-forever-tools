# Forever XP export.
# Reads the level table the add-on keeps in each character's saved file and
# writes one .csv per character into Documents\ForeverXP, then opens that folder.
# The game writes the saved file on logout or /reload, so do one of those first
# (the add-on's "Export to Excel" menu item reloads for you).
param(
  [string]$Account = 'C:\Program Files (x86)\World of Warcraft\_classic_beta_\WTF\Account',
  [string]$Out = (Join-Path ([Environment]::GetFolderPath('MyDocuments')) 'ForeverXP'),
  [switch]$NoOpen
)

if (-not (Test-Path -LiteralPath $Account)) {
  Write-Host "Could not find the game's WTF\Account folder at:" -ForegroundColor Red
  Write-Host "  $Account"
  exit 1
}

New-Item -ItemType Directory -Force -Path $Out | Out-Null
$pattern = '\["exportCSV"\]\s*=\s*"((?:[^"\\]|\\.)*)"'
$written = 0

Get-ChildItem -LiteralPath $Account -Recurse -Filter 'ForeverXP.lua' -ErrorAction SilentlyContinue | ForEach-Object {
  $text = [System.IO.File]::ReadAllText($_.FullName)
  $m = [regex]::Match($text, $pattern, 'Singleline')
  if ($m.Success) {
    $csv = $m.Groups[1].Value
    $csv = $csv -replace '\\r', ''
    $csv = $csv -replace '\\n', "`r`n"
    $csv = $csv -replace '\\"', '"'
    $csv = $csv -replace '\\\\', '\'
    $char = $_.Directory.Parent.Name
    $realm = $_.Directory.Parent.Parent.Name
    $target = Join-Path $Out ("ForeverXP $char-$realm.csv")
    try {
      [System.IO.File]::WriteAllText($target, $csv + "`r`n", (New-Object System.Text.UTF8Encoding($true)))
      Write-Host "Wrote $target"
      $written++
    } catch {
      Write-Host "Could not write $target. If it is open in Excel, close it and run this again." -ForegroundColor Yellow
    }
  }
}

if ($written -eq 0) {
  Write-Host 'No level data found yet. In game, use the gear menu > Export to Excel (or /reload), then run this again.' -ForegroundColor Yellow
  exit 2
}
if (-not $NoOpen) { Start-Process explorer.exe $Out }
exit 0
