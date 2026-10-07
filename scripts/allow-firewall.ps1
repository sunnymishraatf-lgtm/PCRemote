# PC Remote — allow inbound LAN traffic through Windows Firewall.
# Run in an elevated PowerShell:  Right-click -> "Run as administrator"
#   powershell -ExecutionPolicy Bypass -File allow-firewall.ps1
# This creates ONE inbound rule for the PC Remote port on Private networks only.
# It does NOT disable the firewall.

param([int]$Port = 8080)

$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Write-Host "Please run this script as Administrator (right-click -> Run as administrator)." -ForegroundColor Red
  exit 1
}

$ruleName = "PC Remote (TCP $Port)"
if (Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue) {
  Write-Host "Rule '$ruleName' already exists." -ForegroundColor Yellow
} else {
  New-NetFirewallRule -DisplayName $ruleName `
    -Direction Inbound -Protocol TCP -LocalPort $Port `
    -Action Allow -Profile Private `
    -Description "Allow PC Remote local-network file transfer and remote control" | Out-Null
  Write-Host "Firewall rule created: $ruleName (Private profile only)." -ForegroundColor Green
}
Write-Host "Your phone must be on the same Wi-Fi (or the PC hotspot) to connect."
