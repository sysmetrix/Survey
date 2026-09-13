# 한 파일을 한글로 열어 PDF 저장 (진단용 — 별도 프로세스로 실행)
param([Parameter(Mandatory = $true)][string]$Path, [switch]$Visible)
$hwp = New-Object -ComObject HWPFrame.HwpObject
try { $hwp.XHwpWindows.Item(0).Visible = [bool]$Visible } catch {}
$hwp.SetMessageBoxMode(0x00020021) | Out-Null
$ok = $hwp.Open($Path, "HWPX", "forceopen:true")
$pages = $hwp.PageCount
$pdf = $hwp.SaveAs([IO.Path]::ChangeExtension($Path, ".pdf"), "PDF", "")
$hwp.Clear(1) | Out-Null
$hwp.Quit()
Write-Output "open=$ok pages=$pages pdf=$pdf"
