param(
  [Parameter(Mandatory = $true)]
  [string]$InputDocx
)

$ErrorActionPreference = "Stop"
$docxPath = (Resolve-Path -LiteralPath $InputDocx).Path

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$document = $null

try {
  $document = $word.Documents.Open($docxPath, $false, $true)
  $pages = $document.ComputeStatistics(2)
  $words = $document.ComputeStatistics(0)
  $document.Close($false)
  $document = $null

  [pscustomobject]@{
    Opens = $true
    Pages = $pages
    Words = $words
  } | ConvertTo-Json
}
finally {
  if ($null -ne $document) {
    $document.Close($false)
  }
  $word.Quit()
}
