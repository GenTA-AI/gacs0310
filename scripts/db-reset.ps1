# Wipe Postgres data and reapply db/init/* from scratch (Windows / PowerShell).

$ErrorActionPreference = "Stop"

Set-Location (Join-Path $PSScriptRoot "..")

Write-Host "Stopping containers..."
docker compose down

Write-Host "Removing Postgres volume..."
docker volume rm gacs0310_postgres_data 2>$null

Write-Host "Bringing containers back up..."
docker compose up -d

Write-Host "Waiting for Postgres to be ready..."
$ready = $false
for ($i = 0; $i -lt 30; $i++) {
    $check = docker compose exec -T postgres pg_isready -U "gacs" 2>$null
    if ($LASTEXITCODE -eq 0) {
        $ready = $true
        break
    }
    Start-Sleep -Seconds 1
}

if ($ready) {
    Write-Host "Postgres ready."
} else {
    Write-Host "Postgres did not become ready in 30s — check 'docker compose logs postgres'."
    exit 1
}
