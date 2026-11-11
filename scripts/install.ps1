<#
.SYNOPSIS
  把 dsh-sidebar-manager 挂到当前 DSH Desktop 的 profile 里（幂等）。

.DESCRIPTION
  两件事：
   1. 在 <profile>/node_modules 下建一个指向本仓库目录的 junction（改代码即时生效）；
   2. 在 <profile>/cordis.patch.yml 末尾追加一条 insert 行（已经有就跳过）。

  做完刷新页面即可（DSH 的 patchReload=live 会热挂载 host 半边）。

.PARAMETER Profile
  profile 目录，默认 %APPDATA%\dsh-desktop\harness\profiles\web
#>
[CmdletBinding()]
param(
  [string]$Profile = (Join-Path $env:APPDATA "dsh-desktop\harness\profiles\web")
)

$ErrorActionPreference = "Stop"
$here = Split-Path -Parent (Split-Path -Parent $PSCommandPath)

if (-not (Test-Path (Join-Path $Profile "package.json"))) {
  throw "找不到 profile：$Profile（先确认 DSH Desktop 装好并启动过一次）"
}

$linkPath = Join-Path $Profile "node_modules\dsh-sidebar-manager"
if (Test-Path $linkPath) {
  $item = Get-Item $linkPath -Force
  Write-Host "[1/2] junction 已存在：$($item.Target)"
} else {
  New-Item -ItemType Junction -Path $linkPath -Target $here | Out-Null
  Write-Host "[1/2] 已创建 junction：$linkPath -> $here"
}

$patchPath = Join-Path $Profile "cordis.patch.yml"
$patch = if (Test-Path $patchPath) { Get-Content -Raw -Encoding UTF8 $patchPath } else { "" }
if ($patch -match "(?m)^\s+name:\s*dsh-sidebar-manager\s*$") {
  Write-Host "[2/2] cordis.patch.yml 里已有 sidebar-manager 行，跳过"
} else {
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item $patchPath "$patchPath.bak-sidebar-manager-$stamp"
  Add-Content -Encoding UTF8 $patchPath @"

# dsh-sidebar-manager (installed $stamp): 左侧边栏「顺序 / 是否显示」管理 + 布局守卫
- insert:
    - id: sidebar-manager
      name: dsh-sidebar-manager
"@
  Write-Host "[2/2] 已追加 insert 行（备份：cordis.patch.yml.bak-sidebar-manager-$stamp）"
}

Write-Host ""
Write-Host "完成。刷新 DSH 页面（Ctrl+R）即可看到「设置 → 侧边栏」。"
