param(
  [Parameter(Mandatory = $true)]
  [string]$InputDocx,
  [Parameter(Mandatory = $true)]
  [string]$OutputPdf
)

$ErrorActionPreference = "Stop"
$docxPath = (Resolve-Path -LiteralPath $InputDocx).Path
$pdfPath = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputPdf))
$pdfDirectory = Split-Path -Parent $pdfPath
New-Item -ItemType Directory -Force -Path $pdfDirectory | Out-Null

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$document = $null

try {
  $document = $word.Documents.Open($docxPath, $false, $true)
  $document.SaveAs2($pdfPath, 17)
  $pages = $document.ComputeStatistics(2)
  $words = $document.ComputeStatistics(0)
  $document.Close($false)
  $document = $null

  [pscustomobject]@{
    Pages = $pages
    Words = $words
    PdfExists = Test-Path -LiteralPath $pdfPath
    PdfSize = (Get-Item -LiteralPath $pdfPath).Length
  } | ConvertTo-Json
}
finally {
  if ($null -ne $document) {
    $document.Close($false)
  }
  $word.Quit()
}
