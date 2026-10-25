# Auto-elevación a Administrador si no tiene permisos
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "Solicitando permisos de Administrador..." -ForegroundColor Yellow
    Start-Process powershell.exe -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

Write-Host "=====================================================" -ForegroundColor Cyan
Write-Host " Configurando SQL Server para permitir conexiones   " -ForegroundColor Cyan
Write-Host "=====================================================" -ForegroundColor Cyan

try {
    # 1. Habilitar protocolo TCP/IP para MSSQLSERVER
    Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL15.MSSQLSERVER\MSSQLServer\SuperSocketNetLib\Tcp' -Name Enabled -Value 1
    Write-Host "[OK] Protocolo TCP/IP habilitado." -ForegroundColor Green

    # 2. Configurar puerto 1433 en IPAll
    Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL15.MSSQLSERVER\MSSQLServer\SuperSocketNetLib\Tcp\IPAll' -Name TcpPort -Value '1433'
    Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL15.MSSQLSERVER\MSSQLServer\SuperSocketNetLib\Tcp\IPAll' -Name TcpDynamicPorts -Value ''
    Write-Host "[OK] Puerto estático 1433 configurado." -ForegroundColor Green

    # 3. Abrir puerto 1433 en el Firewall de Windows para Docker
    $fw = Get-NetFirewallRule -DisplayName "SQL Server (1433 TCP)" -ErrorAction SilentlyContinue
    if (-not $fw) {
        New-NetFirewallRule -DisplayName "SQL Server (1433 TCP)" -Direction Inbound -LocalPort 1433 -Protocol TCP -Action Allow | Out-Null
        Write-Host "[OK] Regla de Firewall para puerto 1433 creada." -ForegroundColor Green
    } else {
        Write-Host "[OK] Regla de Firewall ya existía." -ForegroundColor Green
    }

    # 4. Reiniciar el servicio de SQL Server
    Write-Host "Reiniciando servicio SQL Server (MSSQLSERVER)..." -ForegroundColor Yellow
    Restart-Service -Name MSSQLSERVER -Force
    Write-Host "[OK] Servicio SQL Server reiniciado con éxito!" -ForegroundColor Green
    Write-Host "`nTodo listo. Ya puedes cerrar esta ventana." -ForegroundColor Cyan
} catch {
    Write-Host "[ERROR] Ocurrió un problema: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`nPresiona cualquier tecla para continuar..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
