param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$InputPath,

  [Parameter(Position = 1)]
  [string]$EnvName = "X_YT_DLP_COOKIES_CONTENT"
)

if (-not (Test-Path -LiteralPath $InputPath -PathType Leaf)) {
  Write-Error "Cookie file not found: $InputPath"
  exit 1
}

$content = [IO.File]::ReadAllText((Resolve-Path -LiteralPath $InputPath))
$content = $content -replace "`r`n", "`n" -replace "`r", "`n"
$escaped = $content -replace "\\", "\\" -replace '"', '\"' -replace "`t", "\t" -replace "`n", "\n"

"$EnvName=`"$escaped`""
