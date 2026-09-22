$ErrorActionPreference = 'Stop'
# Run as the normal Windows user. No password, firewall change, or public endpoint.
$TaskName = 'Lumen (WSL)'
$Action = New-ScheduledTaskAction -Execute "$env:WINDIR\System32\wsl.exe" -Argument '-d Ubuntu -u lovea --exec /home/lovea/SkillsStudio/scripts/keep-lumen-running.sh'
$Trigger = New-ScheduledTaskTrigger -AtLogOn -User ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$Principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description 'Keep the private Lumen study server running in Ubuntu while signed into Windows.' -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Output 'Lumen starts when this Windows user signs in. Keep the computer awake; locking is fine.'
