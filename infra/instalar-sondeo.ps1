<#
.SYNOPSIS
  Registra (o quita) la tarea programada de Windows que despliega main en staging por sondeo.

.DESCRIPTION
  Cada 10 minutos ejecuta infra/sondear-main.sh con Git Bash en la carpeta de
  este repositorio (la del servidor): despliega main en staging y vigila que
  producción y staging sigan en marcha. Guía: docs/runbooks/despliegue.md.

  - Corre con la cuenta que lo instala y solo con la sesión iniciada: Docker
    Desktop también la necesita. Sin permisos de administrador.
  - Sin ventana: PowerShell oculto lanza Git Bash.
  - Una sola ejecución a la vez (además del cerrojo del script); se corta a la hora.
  - Si la tarea ya existe, la sustituye.

  Pausar sin quitarla:  infra/sondear-main.sh --pausar "motivo"   (o Disable-ScheduledTask)

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra\instalar-sondeo.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra\instalar-sondeo.ps1 -Quitar
#>
param(
  [string]$Nombre = 'ProcessIQ - sondeo de main a staging',
  [ValidateRange(1, 1440)][int]$Minutos = 10,
  # Ruta de bash.exe de Git for Windows; por defecto, la del git que esté en el PATH
  [string]$Bash,
  [switch]$Quitar
)
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path

if ($Quitar) {
  Unregister-ScheduledTask -TaskName $Nombre -Confirm:$false
  Write-Host "Tarea '$Nombre' borrada."
  return
}

if (-not $Bash) {
  $git = (Get-Command git.exe -ErrorAction SilentlyContinue).Source
  # git.exe esta en <Git>\cmd o <Git>\bin; bash.exe, en <Git>\bin
  $candidatos = @()
  if ($git) { $candidatos += Join-Path (Split-Path (Split-Path $git)) 'bin\bash.exe' }
  $candidatos += Join-Path $env:ProgramFiles 'Git\bin\bash.exe'
  $Bash = $candidatos | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $Bash -or -not (Test-Path $Bash)) { throw 'No encuentro bash.exe de Git for Windows: indicalo con -Bash <ruta>.' }
if (-not (Test-Path (Join-Path $repo 'infra\sondear-main.sh'))) { throw "No encuentro infra\sondear-main.sh en $repo." }

# PowerShell oculto -> Git Bash (hereda la consola oculta). El codigo de salida
# del script queda como resultado de la tarea (0 = bien; 1 = rechazo o fallo).
$argumentos = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -Command "& ''{0}'' infra/sondear-main.sh; exit $LASTEXITCODE"' -f $Bash
$accion = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $argumentos -WorkingDirectory $repo
$disparador = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $Minutos)
$ajustes = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
$descripcion = "ProcessIQ: cada $Minutos min, si origin/main avanzo respecto a staging, git pull --ff-only e infra/desplegar.sh staging; ademas vigila que produccion y staging sigan en marcha y avisa con una ventana si no. Produccion sigue siendo manual. docs/runbooks/despliegue.md"

Register-ScheduledTask -TaskName $Nombre -Action $accion -Trigger $disparador -Settings $ajustes `
  -Principal $principal -Description $descripcion -Force | Out-Null

Write-Host "Tarea '$Nombre' registrada: cada $Minutos min en $repo, con $Bash."
Write-Host ("Comprobar:  Get-ScheduledTaskInfo -TaskName '{0}'   (LastTaskResult 0 = bien)" -f $Nombre)
Write-Host 'Estado:     infra/sondear-main.sh --estado   (en Git Bash, en la carpeta del repositorio)'
