# 생성된 HWPX 를 설치된 한글(COM)로 열어 검증하고 PDF 로 저장한다.
# 파일마다 별도 프로세스로 실행하고, 제한시간 초과 시 화면을 캡처한 뒤 종료한다.
# 사용: powershell -ExecutionPolicy Bypass -File tools/hwp-verify.ps1 -Dir out [-TimeoutSec 60]
param([string]$Dir = "out", [int]$TimeoutSec = 60)
$root = (Resolve-Path $Dir).Path
$files = Get-ChildItem -Path $root -Filter *.hwpx -File
if (-not $files) { Write-Output "HWPX 파일 없음: $root"; exit 1 }
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$opener = Join-Path $PSScriptRoot "hwp-open-one.ps1"
. (Join-Path $PSScriptRoot "lib\hwp-com.ps1")
if (-not (Get-HwpSecurityModuleName)) {
  Write-Output "[안내] 한글 보안 승인 모듈이 등록되지 않아 파일 열기 때 승인 창이 뜰 수 있습니다. 설치: powershell -ExecutionPolicy Bypass -File tools/install-hwp-security-module.ps1 -Test"
}
$fail = 0
foreach ($f in $files) {
  $log = [IO.Path]::ChangeExtension($f.FullName, ".verify.txt")
  $p = Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$opener`" -Path `"$($f.FullName)`"" -PassThru -WindowStyle Hidden -RedirectStandardOutput $log
  if ($p.WaitForExit($TimeoutSec * 1000)) {
    $res = (Get-Content $log -Raw) -replace "\s+$", ""
    if ($res -match "open=True" -and $res -match "pdf=True") { Write-Output "OK   $($f.Name)  $res" }
    else { $fail++; Write-Output "FAIL $($f.Name)  $res" }
  } else {
    $fail++
    $shot = [IO.Path]::ChangeExtension($f.FullName, ".hang.png")
    $b = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
    $g = [System.Drawing.Graphics]::FromImage($bmp); $g.CopyFromScreen($b.Location, [System.Drawing.Point]::Empty, $b.Size); $bmp.Save($shot); $g.Dispose(); $bmp.Dispose()
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    Get-Process Hwp -ErrorAction SilentlyContinue | Stop-Process -Force
    Write-Output "HANG $($f.Name)  (화면 캡처: $shot)"
  }
  Remove-Item $log -ErrorAction SilentlyContinue
}
exit $fail
