param(
    [Parameter(Mandatory = $true)][string]$InputPath,
    [Parameter(Mandatory = $true)][string]$OutputPdf
)

$ErrorActionPreference = 'Stop'
$wordApp = $null
$wordDoc = $null
$sourceFile = (Resolve-Path -LiteralPath $InputPath).Path
$targetFile = [System.IO.Path]::GetFullPath($OutputPdf)
$targetDirectory = [System.IO.Path]::GetDirectoryName($targetFile)
[void][System.IO.Directory]::CreateDirectory($targetDirectory)

try {
    $wordApp = New-Object -ComObject Word.Application
    $wordApp.Visible = $false
    $wordApp.DisplayAlerts = 0
    $wordApp.AutomationSecurity = 3
    $wordDoc = $wordApp.Documents.Open($sourceFile, $false, $true, $false)
    $wordDoc.Repaginate()
    $pageCount = $wordDoc.ComputeStatistics(2)
    $wordDoc.ExportAsFixedFormat($targetFile, 17)
    [pscustomobject]@{ Input = $sourceFile; Pdf = $targetFile; Pages = $pageCount; WordVersion = $wordApp.Version } | ConvertTo-Json -Compress
}
finally {
    if ($null -ne $wordDoc) {
        $wordDoc.Close(0)
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordDoc)
    }
    if ($null -ne $wordApp) {
        $wordApp.Quit(0)
        [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($wordApp)
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}
