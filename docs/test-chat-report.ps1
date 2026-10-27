$ErrorActionPreference = "Stop"
$auth = Invoke-RestMethod -Method Post -Uri http://localhost:3001/api/auth/login -ContentType 'application/json' -Body '{"correo":"admin@local.test","password":"Admin123*"}'
$headers = @{ Authorization = "Bearer $($auth.token)" }
$body = @{ messages = @(@{ role = "user"; text = "Genera un reporte de vehículos en Excel" }) } | ConvertTo-Json -Depth 5
$reply = Invoke-RestMethod -Method Post -Uri http://localhost:3005/api/asistente/chat -Headers $headers -ContentType 'application/json' -Body $body
Write-Output "respuesta=$($reply.text)"
Write-Output "reporte=$($reply.reportRequest.title) formato=$($reply.reportRequest.format) columnas=$($reply.reportRequest.columns.Count) filas=$($reply.reportRequest.rows.Count) total=$($reply.reportRequest.total)"
