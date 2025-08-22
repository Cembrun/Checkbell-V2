Param(
  [string]$outDir = "backups\data_backup_$(Get-Date -Format 'yyyy-MM-dd_HHmm')"
)

Write-Host "Creating backup -> $outDir"
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
Copy-Item -Path ".\backend\data\*" -Destination "$outDir\data" -Recurse -Force
Copy-Item -Path ".\backend\uploads\*" -Destination "$outDir\uploads" -Recurse -Force
Write-Host "Backup completed"
