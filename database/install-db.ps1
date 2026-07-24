# Script para instalar la base de datos localmente en la instancia SQL2019
$connectionString = "Server=localhost\SQL2019;Database=master;Integrated Security=True;TrustServerCertificate=True"
$sqlFile = Join-Path $PSScriptRoot "setup.sql"

if (-not (Test-Path $sqlFile)) {
    Write-Error "No se encontro el archivo setup.sql en la ruta: $sqlFile"
    exit 1
}

Write-Host "Leyendo setup.sql..." -ForegroundColor Cyan
$sqlContent = Get-Content -Raw -Path $sqlFile -Encoding UTF8

# Separar el script por la directiva GO (insensible a mayusculas/minusculas, en lineas independientes)
# Usamos una expresion regular que captura "GO" precedido y seguido de saltos de linea o espacios
$commands = [System.Text.RegularExpressions.Regex]::Split($sqlContent, "(?mi)^\s*GO\s*$")

Write-Host "Conectando a SQL Server (instancia SQL2019)..." -ForegroundColor Cyan

try {
    # Cargar ensamblado de acceso a datos
    [System.Reflection.Assembly]::LoadWithPartialName("System.Data") | Out-Null
    
    $connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
    $connection.Open()
    
    Write-Host "Conectado con exito. Ejecutando scripts de creacion..." -ForegroundColor Green
    
    $count = 0
    foreach ($cmdText in $commands) {
        $trimmedCmd = $cmdText.Trim()
        if (-not [string]::IsNullOrEmpty($trimmedCmd)) {
            $command = $connection.CreateCommand()
            $command.CommandText = $trimmedCmd
            $command.CommandTimeout = 60
            try {
                $command.ExecuteNonQuery() | Out-Null
                $count++
            } catch {
                Write-Warning "Error al ejecutar el bloque SQL:`n$trimmedCmd`nError: $_"
            }
        }
    }
    
    $connection.Close()
    Write-Host "Base de datos creada e inicializada correctamente. Se ejecutaron $count bloques de comandos." -ForegroundColor Green
    Write-Host "¡Todo listo! Ya puedes iniciar la aplicacion." -ForegroundColor Green
} catch {
    Write-Error "Fallo la conexion o ejecucion en SQL Server: $_"
    Write-Error "Por favor verifica que la instancia SQL2019 este activa y acepte conexiones con Autenticacion de Windows."
}
