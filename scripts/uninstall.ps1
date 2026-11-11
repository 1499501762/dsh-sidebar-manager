<#
.SYNOPSIS
  从当前 DSH Desktop 的 profile 里移除 dsh-sidebar-manager（幂等）。

.DESCRIPTION
  删掉 <profile>/cordis.patch.yml 里本插件追加的那段 insert，并移除 node_modules 下的 junction。
  本目录里的源码不动。
#>
[CmdletBinding()]
param(
  [string]$Profile = (Join-Path $env:APPDATA "dsh-desktop\harness\profiles\web")
)

$ErrorActionPreference = "Stop"

$patchPath = Join-Path $Profile "cordis.patch.yml"
if (Test-Path $patchPath) {
  $patch = Get-Content -Raw -Encoding UTF8 $patchPath
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  Copy-Item $patchPath "$patchPath.bak-sidebar-manager-remove-$stamp"
  $pattern = "(?ms)\r?\n# dsh-sidebar-manager.*?\r?\n\s+name:\s*dsh-sidebar-manager\r?\n"
  $next = [regex]::Replace($patch, $pattern, "`n")
  if ($next -ne $patch) {
    Set-Content -Encoding UTF8 -NoNewline $patchPath $next
    Write-Host "已从 cordis.patch.yml 移除 sidebar-manager 段（备份：cordis.patch.yml.bak-sidebar-manager-remove-$stamp）"
  } else {
    Write-Host "cordis.patch.yml 里没有 sidebar-manager 段，跳过"
  }
}

$linkPath = Join-Path $Profile "node_modules\dsh-sidebar-manager"
if (Test-Path $linkPath) {
  # junction 只删链接本身，不动目标目录
  [System.IO.Directory]::Delete($linkPath)
  Write-Host "已移除 junction：$linkPath"
} else {
  Write-Host "node_modules 下没有 dsh-sidebar-manager，跳过"
}

Write-Host ""
Write-Host "完成。刷新 DSH 页面后生效。"
