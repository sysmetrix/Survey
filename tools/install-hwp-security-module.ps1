<#
.SYNOPSIS
  한컴 공식 한글 오토메이션 보안 승인 모듈(FilePathCheckerModuleExample.dll)을 현재 사용자에 설치·등록한다.

.DESCRIPTION
  한글 COM 자동화로 파일을 열거나 저장할 때 뜨는
  "한글을 이용하여 위 파일에 접근하려는 시도…" 보안 승인 창을 없애는 한컴 공식 방식.

  출처: 한컴디벨로퍼 한글 오토메이션 개발 가이드 → 보안모듈(Automation).zip
        https://developer.hancom.com/hwpautomation
        https://github.com/hancom-io/devcenter-archive (hwp-automation/보안모듈(Automation).zip)

  수행 단계
    1) 설치된 한글(HWPFrame.HwpObject) 확인 및 비트(32/64) 확인
    2) 공식 zip 다운로드(또는 -ZipPath 로 오프라인 파일 지정) → SHA-256 검증
    3) DLL 을 %LOCALAPPDATA%\HNC\HwpAutomation\SecurityModule 에 복사(인터넷 다운로드 표시 해제)
    4) HKCU\Software\HNC\HwpAutomation\Modules 에 REG_SZ 값 등록
         이름: FilePathCheckerModuleExample   데이터: DLL 전체 경로
    5) -Test: 별도 프로세스에서 RegisterModule + 파일 열기·PDF 저장 확인

  관리자 권한이 필요 없다(현재 사용자 범위). 여러 번 실행해도 안전(멱등).
  자동화 코드에서는 HwpObject.RegisterModule("FilePathCheckDLL", "FilePathCheckerModuleExample") 을 호출한다
  (이 저장소는 tools/lib/hwp-com.ps1 의 New-HwpAutomation 이 처리).

  보안 참고: 한컴 예제 모듈의 IsAccessiblePath 는 항상 허용(TRUE)을 반환한다.
  RegisterModule 을 호출한 자동화 세션에만 적용되며, 사용자가 직접 한글을 여는 경우에는 영향이 없다.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools/install-hwp-security-module.ps1 -Test
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools/install-hwp-security-module.ps1 -ZipPath "D:\받은파일\보안모듈(Automation).zip"
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools/install-hwp-security-module.ps1 -Uninstall
#>
[CmdletBinding()]
param(
  [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "HNC\HwpAutomation\SecurityModule"),
  [string]$ModuleName = "FilePathCheckerModuleExample",
  [string]$ZipPath,
  [switch]$SkipHashCheck,
  [switch]$Test,
  [switch]$Uninstall
)
$ErrorActionPreference = "Stop"

$OfficialUrl = "https://github.com/hancom-io/devcenter-archive/raw/main/hwp-automation/%EB%B3%B4%EC%95%88%EB%AA%A8%EB%93%88(Automation).zip"
# 2026-09-14 한컴 공식 배포본 기준 해시 (배포본이 바뀌면 -SkipHashCheck 또는 값 갱신)
$ExpectedZipSha256 = "5D87292EFAFD7311CBA6D35E4B416AC8BFA78608A64DDE1656C8CB827B051BD8"
$ExpectedDllSha256 = "9AC5B97C47AC8AED1E8BCA27A3EEF39411361D8F68C262509F0C40A8F9D21BB6"
$DllName = "FilePathCheckerModuleExample.dll"
$ModulesKey = "HKCU:\Software\HNC\HwpAutomation\Modules"

function Info([string]$m) { Write-Output "[보안모듈] $m" }

function Get-PEArch([string]$path) {
  $fs = [IO.File]::OpenRead($path)
  try {
    $br = New-Object IO.BinaryReader($fs)
    $fs.Seek(0x3C, 0) | Out-Null; $pe = $br.ReadInt32()
    $fs.Seek($pe + 4, 0) | Out-Null; $machine = $br.ReadUInt16()
  } finally { $fs.Close() }
  switch ($machine) { 0x14c { "x86" } 0x8664 { "x64" } default { "0x{0:x}" -f $machine } }
}

function Get-HwpExePath {
  $clsid = (Get-ItemProperty "Registry::HKEY_CLASSES_ROOT\HWPFrame.HwpObject\CLSID" -ErrorAction SilentlyContinue).'(default)'
  if (-not $clsid) { return $null }
  foreach ($p in @("Registry::HKEY_CLASSES_ROOT\WOW6432Node\CLSID\$clsid\LocalServer32", "Registry::HKEY_CLASSES_ROOT\CLSID\$clsid\LocalServer32")) {
    $v = (Get-ItemProperty $p -ErrorAction SilentlyContinue).'(default)'
    if ($v -and $v -match '^\s*"?(.+?\.exe)') { return $Matches[1] }
  }
  return $null
}

# ───────────── 제거 ─────────────
if ($Uninstall) {
  if (Get-ItemProperty -Path $ModulesKey -Name $ModuleName -ErrorAction SilentlyContinue) {
    Remove-ItemProperty -Path $ModulesKey -Name $ModuleName
    Info "레지스트리 값 삭제: $ModulesKey\$ModuleName"
  } else { Info "레지스트리 값 없음: $ModulesKey\$ModuleName" }
  $dll = Join-Path $InstallDir $DllName
  if (Test-Path -LiteralPath $dll) {
    try { Remove-Item -LiteralPath $dll -Force; Info "DLL 삭제: $dll" }
    catch { throw "DLL 을 삭제하지 못했습니다(한글이 실행 중일 수 있음). 한글을 모두 종료한 뒤 다시 실행하세요: $dll" }
  }
  if ((Test-Path -LiteralPath $InstallDir) -and -not (Get-ChildItem -LiteralPath $InstallDir -Force)) { Remove-Item -LiteralPath $InstallDir -Force }
  Info "제거 완료"
  exit 0
}

# ───────────── 1) 한글 확인 ─────────────
$hwpExe = Get-HwpExePath
if (-not $hwpExe -or -not (Test-Path -LiteralPath $hwpExe)) { throw "한글 오토메이션(HWPFrame.HwpObject)이 설치되어 있지 않습니다." }
$hwpArch = Get-PEArch $hwpExe
Info "한글 실행 파일: $hwpExe ($hwpArch)"

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("hwp-secmodule-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  # ───────────── 2) 공식 zip 확보·검증 ─────────────
  if ($ZipPath) {
    $zip = (Resolve-Path -LiteralPath $ZipPath).Path
    Info "오프라인 zip 사용: $zip"
  } else {
    $zip = Join-Path $tmp "module.zip"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Info "한컴 공식 배포본 다운로드: $OfficialUrl"
    try { Invoke-WebRequest -Uri $OfficialUrl -OutFile $zip -UseBasicParsing }
    catch { throw "다운로드 실패($($_.Exception.Message)). 인터넷이 막힌 PC라면 한컴디벨로퍼에서 받은 zip 을 -ZipPath 로 지정하세요." }
  }
  $zipHash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
  if ($zipHash -ne $ExpectedZipSha256) {
    if ($SkipHashCheck) { Info "경고: zip 해시가 기준값과 다릅니다(-SkipHashCheck 로 계속). $zipHash" }
    else { throw "zip SHA-256 불일치: $zipHash (기준 $ExpectedZipSha256). 공식 배포본이 갱신되었는지 확인 후 -SkipHashCheck 로 다시 실행하세요." }
  } else { Info "zip SHA-256 확인" }

  Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
  $tmpDll = Join-Path $tmp $DllName
  $z = [IO.Compression.ZipFile]::OpenRead($zip)
  try {
    $entry = $z.Entries | Where-Object { $_.Name -ieq $DllName } | Select-Object -First 1
    if (-not $entry) { throw "zip 안에 $DllName 이 없습니다." }
    [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $tmpDll, $true)
  } finally { $z.Dispose() }

  $dllHash = (Get-FileHash -LiteralPath $tmpDll -Algorithm SHA256).Hash
  if ($dllHash -ne $ExpectedDllSha256 -and -not $SkipHashCheck) { throw "DLL SHA-256 불일치: $dllHash" }
  $dllArch = Get-PEArch $tmpDll
  if ($dllArch -ne $hwpArch) { throw "비트 불일치: 한글=$hwpArch, 보안모듈 DLL=$dllArch. 한글과 같은 비트의 보안 모듈이 필요합니다." }
  Info "DLL 확인: $dllArch, SHA-256 $dllHash"

  # ───────────── 3) 설치 ─────────────
  New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
  $target = Join-Path $InstallDir $DllName
  $same = (Test-Path -LiteralPath $target) -and ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $dllHash)
  if (-not $same) {
    try { Copy-Item -LiteralPath $tmpDll -Destination $target -Force }
    catch { throw "DLL 복사 실패(한글이 모듈을 사용 중일 수 있음). 한글을 모두 종료한 뒤 다시 실행하세요: $($_.Exception.Message)" }
  }
  Unblock-File -LiteralPath $target -ErrorAction SilentlyContinue
  Info "DLL 설치: $target$(if ($same) { ' (이미 최신)' })"

  # ───────────── 4) 레지스트리 등록 ─────────────
  if (-not (Test-Path $ModulesKey)) { New-Item -Path $ModulesKey -Force | Out-Null }
  New-ItemProperty -Path $ModulesKey -Name $ModuleName -Value $target -PropertyType String -Force | Out-Null
  $readBack = (Get-ItemProperty -Path $ModulesKey -Name $ModuleName).$ModuleName
  if ($readBack -ne $target) { throw "레지스트리 등록 확인 실패: $readBack" }
  Info "레지스트리 등록: HKCU\Software\HNC\HwpAutomation\Modules  [$ModuleName] = $target"
  Info "자동화 코드: HwpObject.RegisterModule(`"FilePathCheckDLL`", `"$ModuleName`")"
} finally {
  Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

# ───────────── 5) 동작 확인 ─────────────
if ($Test) {
  $repo = Split-Path -Parent $PSScriptRoot
  $blank = Join-Path $repo "templates\hwpx\blank.hwpx"
  if (-not (Test-Path -LiteralPath $blank)) { throw "테스트용 문서가 없습니다: $blank" }
  $testDir = Join-Path $repo "out\security-module-test"
  New-Item -ItemType Directory -Force -Path $testDir | Out-Null
  $testFile = Join-Path $testDir "보안모듈_확인.hwpx"
  Copy-Item -LiteralPath $blank -Destination $testFile -Force
  $opener = Join-Path $PSScriptRoot "hwp-open-one.ps1"
  $log = Join-Path $testDir "result.txt"
  $err = Join-Path $testDir "stderr.txt"
  Info "동작 확인: 별도 한글 프로세스에서 RegisterModule → 파일 열기 → PDF 저장"
  $p = Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$opener`" -Path `"$testFile`"" -PassThru -WindowStyle Hidden -RedirectStandardOutput $log -RedirectStandardError $err
  if (-not $p.WaitForExit(90000)) {
    Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
    Get-Process Hwp -ErrorAction SilentlyContinue | Stop-Process -Force
    throw "동작 확인 시간 초과 — 보안 승인 창 등 대화상자가 떴을 수 있습니다."
  }
  $res = ((Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue) -replace "\s+$", "")
  Info "결과: $res"
  if ($res -match "open=True" -and $res -match "pdf=True" -and $res -match "secmodule=True") { Info "성공: 보안 승인 창 없이 파일을 열고 저장했습니다." }
  else { throw "동작 확인 실패: $res $((Get-Content -LiteralPath $err -Raw -ErrorAction SilentlyContinue))" }
}
