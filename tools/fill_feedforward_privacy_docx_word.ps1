param(
  [Parameter(Mandatory = $true)]
  [string]$InputDocx,
  [Parameter(Mandatory = $true)]
  [string]$OutputDocx
)

$ErrorActionPreference = "Stop"
$env:PYTHONIOENCODING = "utf-8"

$replacementJson = python -c "import json, sys; sys.path.append('tools'); import fill_feedforward_privacy_docx as f; print(json.dumps({'paragraph': list(f.PARAGRAPH_REPLACEMENTS.items()), 'text': list(f.TEXT_REPLACEMENTS.items()), 'placeholder': list(f.PLACEHOLDER_REPLACEMENTS.items())}, ensure_ascii=False))"
$replacementGroups = $replacementJson | ConvertFrom-Json

function Convert-Pairs($pairs) {
  $list = New-Object System.Collections.Generic.List[object]
  foreach ($pair in $pairs) {
    $list.Add([pscustomobject]@{
      Old = [string]$pair[0]
      New = [string]$pair[1]
    })
  }
  return $list
}

$paragraphReplacements = Convert-Pairs $replacementGroups.paragraph
$textReplacements = Convert-Pairs $replacementGroups.text
$placeholderReplacements = Convert-Pairs $replacementGroups.placeholder

function Get-ReplacedText([string]$content) {
  foreach ($item in $paragraphReplacements) {
    if ($content -eq $item.Old) {
      return $item.New
    }
  }

  $updated = $content
  foreach ($item in $textReplacements) {
    $updated = $updated.Replace($item.Old, $item.New)
  }
  foreach ($item in $placeholderReplacements) {
    $updated = $updated.Replace($item.Old, $item.New)
  }
  foreach ($item in $textReplacements) {
    $updated = $updated.Replace($item.Old, $item.New)
  }
  return $updated
}

function Get-ContentLengthWithoutParagraphMarks([string]$raw) {
  $end = $raw.Length
  while ($end -gt 0) {
    $ch = $raw[$end - 1]
    if ($ch -eq [char]13 -or $ch -eq [char]7) {
      $end -= 1
    } else {
      break
    }
  }
  return $end
}

$inputPath = (Resolve-Path -LiteralPath $InputDocx).Path
$outputPath = Join-Path (Get-Location) $OutputDocx
if (Test-Path -LiteralPath $outputPath) {
  Remove-Item -LiteralPath $outputPath -Force
}
Copy-Item -LiteralPath $inputPath -Destination $outputPath -Force

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$document = $null

try {
  $document = $word.Documents.Open($outputPath, $false, $false)
  $document.TrackRevisions = $false

  $changed = 0
  for ($i = 1; $i -le $document.Paragraphs.Count; $i++) {
    $paragraph = $document.Paragraphs.Item($i)
    $raw = [string]$paragraph.Range.Text
    $contentLength = Get-ContentLengthWithoutParagraphMarks $raw
    if ($contentLength -le 0) {
      continue
    }
    $content = $raw.Substring(0, $contentLength)
    $updated = Get-ReplacedText $content
    if ($updated -ne $content) {
      $range = $paragraph.Range.Duplicate
      $range.End = $range.Start + $contentLength
      $range.Text = $updated

      $cleanRange = $paragraph.Range.Duplicate
      $cleanEnd = $cleanRange.Start + $updated.Length
      if ($cleanEnd -lt $cleanRange.End) {
        $cleanRange.End = $cleanEnd
      }
      $cleanRange.HighlightColorIndex = 0
      $changed += 1
    }
  }

  $document.Save()
  $pages = $document.ComputeStatistics(2)
  $words = $document.ComputeStatistics(0)
  $document.Close($false)
  $document = $null

  [pscustomobject]@{
    Output = $outputPath
    ChangedParagraphs = $changed
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
