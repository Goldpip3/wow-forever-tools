# Forever XP export.
# Reads the level table the add-on keeps in each character's saved file and
# writes one .csv per character into Documents\ForeverXP, then opens that folder.
# The game writes the saved file on logout or /reload. The scheduled task from
# "ForeverXP Auto Export Setup.bat" runs this every 15 minutes with -NoOpen.
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
$created = '\["createdText"\]\s*=\s*"((?:[^"\\]|\\.)*)"'
$written = 0
$chars = @()

# Every character folder: Account\<account>\<realm>\<character>.
Get-ChildItem -LiteralPath $Account -Directory | ForEach-Object {
  Get-ChildItem -LiteralPath $_.FullName -Directory | Where-Object { $_.Name -ne 'SavedVariables' } | ForEach-Object {
    Get-ChildItem -LiteralPath $_.FullName -Directory | ForEach-Object {
      $charDir = $_
      $addonDate = ''
      $saved = Join-Path $charDir.FullName 'SavedVariables\ForeverXP.lua'
      if (Test-Path -LiteralPath $saved) {
        $c = [regex]::Match([System.IO.File]::ReadAllText($saved), $created)
        if ($c.Success) { $addonDate = $c.Groups[1].Value }
      }
      $sortKey = $charDir.CreationTime
      if ($addonDate -match '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$') {
        $sortKey = [datetime]::ParseExact($addonDate, 'yyyy-MM-dd HH:mm', $null)
      }
      $script:chars += [pscustomobject]@{
        'Character' = $charDir.Name
        'Realm' = $charDir.Parent.Name
        'Created (Forever XP)' = $addonDate
        'Character folder created' = $charDir.CreationTime.ToString('yyyy-MM-dd HH:mm')
        'Sort' = $sortKey
      }
    }
  }
}

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

if ($chars.Count -gt 0) {
  # One list of every character, oldest first. Forever XP's date is used when it
  # knows the exact time; otherwise the date Windows made the character's folder,
  # which happens on that character's first logout.
  $list = Join-Path $Out 'ForeverXP characters.csv'
  $i = 0
  $rows = $chars | Sort-Object Sort | ForEach-Object {
    $i++
    [pscustomobject]@{
      'Order' = $i
      'Character' = $_.Character
      'Realm' = $_.Realm
      'Created (Forever XP)' = $_.'Created (Forever XP)'
      'Character folder created' = $_.'Character folder created'
    }
  }
  try {
    $rows | Export-Csv -LiteralPath $list -NoTypeInformation -Encoding UTF8
    Write-Host "Wrote $list"
  } catch {
    Write-Host "Could not write $list. If it is open in Excel, close it and run this again." -ForegroundColor Yellow
  }
}

if ($written -eq 0) {
  Write-Host 'No level data found yet. Log out or /reload in game, then run this again.' -ForegroundColor Yellow
  exit 2
}
if (-not $NoOpen) { Start-Process explorer.exe $Out }
exit 0
