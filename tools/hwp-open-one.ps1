# 한 파일을 한글로 열어 PDF 저장 (진단용 — 별도 프로세스로 실행)
# 한컴 보안 승인 모듈을 먼저 등록해 "파일에 접근하려는 시도" 창이 뜨지 않게 한다 (tools/lib/hwp-com.ps1).
param([Parameter(Mandatory = $true)][string]$Path, [switch]$Visible)
. (Join-Path $PSScriptRoot "lib\hwp-com.ps1")
$session = New-HwpAutomation -Visible:$Visible
$hwp = $session.Hwp
$hwp.SetMessageBoxMode(0x00020021) | Out-Null
$ok = $hwp.Open($Path, "HWPX", "forceopen:true")
$pages = $hwp.PageCount
$pdf = $hwp.SaveAs([IO.Path]::ChangeExtension($Path, ".pdf"), "PDF", "")
$hwp.Clear(1) | Out-Null
$hwp.Quit()
Write-Output "open=$ok pages=$pages pdf=$pdf secmodule=$($session.Registered)"
