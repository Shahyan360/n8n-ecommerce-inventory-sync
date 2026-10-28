param([string]$OutputDirectory = 'backups')
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
foreach ($database in @('commerce', 'n8n')) {
    $destination = Join-Path (Resolve-Path -LiteralPath $OutputDirectory) "$database.dump"
    & docker compose exec -T postgres pg_dump -U commerce_owner -d $database -Fc -f "/tmp/$database.dump"
    if ($LASTEXITCODE -ne 0) { throw "Backup failed for $database" }
    & docker compose cp "postgres:/tmp/$database.dump" $destination
    if ($LASTEXITCODE -ne 0) { throw "Copy failed for $database" }
}
Write-Host 'Database backups created. Securely preserve the n8n encryption key separately.'
