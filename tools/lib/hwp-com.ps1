# 한글(HWP) COM 자동화 공통 함수 — 한컴 공식 보안 승인 모듈(FilePathCheckerModule) 방식
# 사용: . (Join-Path $PSScriptRoot "lib\hwp-com.ps1"); $s = New-HwpAutomation; $hwp = $s.Hwp
#
# 한컴 안내(한컴디벨로퍼 https://developer.hancom.com/hwpautomation):
#   1) 보안모듈 DLL 을 설치하고
#   2) HKCU\Software\HNC\HwpAutomation\Modules 에 문자열 값(이름=모듈이름, 데이터=DLL 전체 경로)을 등록한 뒤
#   3) HwpObject.RegisterModule("FilePathCheckDLL", "모듈이름") 을 호출하면
#   "한글을 이용하여 위 파일에 접근하려는 시도…" 보안 승인 창이 나타나지 않는다.
#   ※ RegisterModule 두 번째 인자는 레지스트리 문자열 값 이름과 정확히 같아야 한다(한글 2024 포럼 답변).
# 설치·등록: tools/install-hwp-security-module.ps1

$script:HwpModulesKey = "HKCU:\Software\HNC\HwpAutomation\Modules"
$script:HwpDefaultModuleName = "FilePathCheckerModuleExample"

function Get-HwpSecurityModuleName {
  <# 레지스트리에 등록되어 있고 DLL 파일이 실제로 존재하는 보안 모듈 이름 (없으면 $null) #>
  param([string]$Preferred = $script:HwpDefaultModuleName)
  $props = Get-ItemProperty -Path $script:HwpModulesKey -ErrorAction SilentlyContinue
  if (-not $props) { return $null }
  $valid = @($props.PSObject.Properties | Where-Object {
      $_.Name -notlike "PS*" -and $_.Value -is [string] -and $_.Value -match "\.dll$" -and (Test-Path -LiteralPath $_.Value)
    })
  $hit = $valid | Where-Object { $_.Name -eq $Preferred } | Select-Object -First 1
  if (-not $hit) { $hit = $valid | Select-Object -First 1 }
  if ($hit) { return $hit.Name }
  return $null
}

function New-HwpAutomation {
  <#
  한글 COM 객체를 만들고 보안 승인 모듈을 먼저 등록한다 (파일 열기·저장 전에 호출해야 함).
  반환: [pscustomobject] @{ Hwp = HwpObject; Registered = [bool]; ModuleName = [string] }
  #>
  param([switch]$Visible, [string]$ModuleName)
  $hwp = New-Object -ComObject HWPFrame.HwpObject
  if (-not $ModuleName) { $ModuleName = Get-HwpSecurityModuleName }
  $registered = $false
  if ($ModuleName) {
    try { $registered = [bool]$hwp.RegisterModule("FilePathCheckDLL", $ModuleName) } catch { $registered = $false }
  }
  if (-not $registered) {
    [Console]::Error.WriteLine("[경고] 한글 보안 승인 모듈이 등록되지 않아 파일 접근 승인 창이 뜰 수 있습니다. 설치: powershell -ExecutionPolicy Bypass -File tools/install-hwp-security-module.ps1")
  }
  try { $hwp.XHwpWindows.Item(0).Visible = [bool]$Visible } catch {}
  return [pscustomobject]@{ Hwp = $hwp; Registered = $registered; ModuleName = $ModuleName }
}
