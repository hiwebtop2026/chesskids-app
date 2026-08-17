$port = 3002
$prefix = "http://127.0.0.1:$port/"
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($prefix)
$distDir = 'i:\trae_projects\chesskids-app\dist'

try {
    $listener.Start()
    Write-Host "HttpListener started on $prefix" -ForegroundColor Green

    while ($listener.IsListening) {
        $ctx = $listener.GetContext()
        $req = $ctx.Request
        $res = $ctx.Response

        $localPath = $req.Url.LocalPath
        if ($localPath -eq '/') { $localPath = '/index.html' }

        $filePath = Join-Path $distDir $localPath.TrimStart('/')

        # Prevent path traversal
        $fullPath = [System.IO.Path]::GetFullPath($filePath)
        $distFull = [System.IO.Path]::GetFullPath($distDir)
        if (-not $fullPath.StartsWith($distFull)) {
            $res.StatusCode = 403
            $res.Close()
            continue
        }

        if (Test-Path $filePath -PathType Leaf) {
            $bytes = [System.IO.File]::ReadAllBytes($filePath)
            $ext = [System.IO.Path]::GetExtension($filePath).ToLower()

            $mime = switch ($ext) {
                '.html' { 'text/html; charset=utf-8' }
                '.js'   { 'text/javascript; charset=utf-8' }
                '.mjs'  { 'text/javascript; charset=utf-8' }
                '.css'  { 'text/css; charset=utf-8' }
                '.svg'  { 'image/svg+xml' }
                '.json' { 'application/json' }
                '.png'  { 'image/png' }
                '.ico'  { 'image/x-icon' }
                '.woff' { 'font/woff' }
                '.woff2'{ 'font/woff2' }
                default { 'application/octet-stream' }
            }

            $res.ContentType = $mime
            $res.ContentLength64 = $bytes.Length
            $res.OutputStream.Write($bytes, 0, $bytes.Length)
            Write-Host "200 $localPath ($($bytes.Length) bytes)" -ForegroundColor Cyan
        } else {
            $res.StatusCode = 404
            $body = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $localPath")
            $res.ContentType = 'text/plain'
            $res.ContentLength64 = $body.Length
            $res.OutputStream.Write($body, 0, $body.Length)
            Write-Host "404 $localPath" -ForegroundColor Red
        }

        $res.Close()
    }
} catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
} finally {
    if ($listener.IsListening) {
        $listener.Stop()
    }
}
