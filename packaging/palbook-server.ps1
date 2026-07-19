# Palbook local server — serves the static app/ folder and opens the browser.
# No installation needed: this uses only built-in Windows PowerShell.
$ErrorActionPreference = "Stop"
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot "app"))

if (-not (Test-Path (Join-Path $root "index.html"))) {
    Write-Host ""
    Write-Host "  The 'app' folder is missing next to this script." -ForegroundColor Red
    Write-Host "  Make sure the WHOLE Palbook folder was extracted from the zip."
    exit 1
}

# Try a few ports in case something else on this machine owns the first one.
$ports = 8731, 8732, 8733
$listener = $null
$port = $null
foreach ($p in $ports) {
    $try = New-Object System.Net.HttpListener
    $try.Prefixes.Add("http://localhost:$p/")
    try {
        $try.Start()
        $listener = $try
        $port = $p
        break
    } catch {
        $try.Close()
    }
}
if (-not $listener) {
    # Every port is busy — almost certainly Palbook is already running.
    Start-Process "http://localhost:$($ports[0])/"
    Write-Host "  Palbook looks like it is already running - opened the browser."
    exit 0
}
$url = "http://localhost:$port/"

Start-Process $url
Write-Host ""
Write-Host "  Palbook is running at $url" -ForegroundColor Cyan
Write-Host "  Keep this window open while you use it."
Write-Host "  CLOSE THIS WINDOW to stop Palbook." -ForegroundColor Yellow
Write-Host ""

$mime = @{
    ".html" = "text/html; charset=utf-8"
    ".js"    = "text/javascript"
    ".css"   = "text/css"
    ".json"  = "application/json"
    ".webp"  = "image/webp"
    ".png"   = "image/png"
    ".jpg"   = "image/jpeg"
    ".ico"   = "image/x-icon"
    ".svg"   = "image/svg+xml"
    ".woff2" = "font/woff2"
    ".txt"   = "text/plain"
}

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
        $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart("/")
        if ($rel -eq "") { $rel = "index.html" }
        $file = [IO.Path]::GetFullPath((Join-Path $root $rel))

        if (-not $file.StartsWith($root)) {
            $ctx.Response.StatusCode = 403
        } else {
            # Next.js export emits route pages as <route>.html, but may ALSO
            # emit a <route>/ directory with payload files - so try, in order:
            # exact file, directory index, sibling .html.
            $candidates = @($file)
            if (Test-Path $file -PathType Container) {
                $candidates = @(
                    (Join-Path $file "index.html"),
                    ($file.TrimEnd("\") + ".html")
                )
            } else {
                $candidates += "$file.html"
            }
            $file = $candidates |
                Where-Object { Test-Path $_ -PathType Leaf } |
                Select-Object -First 1
            if (-not $file) {
                $ctx.Response.StatusCode = 404
                $fallback = Join-Path $root "404.html"
                if (Test-Path $fallback) { $file = $fallback } else { $file = $null }
            }
            if ($file) {
                $bytes = [IO.File]::ReadAllBytes($file)
                $ext = [IO.Path]::GetExtension($file).ToLower()
                if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
                $ctx.Response.ContentLength64 = $bytes.Length
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
            }
        }
    } catch {
        try { $ctx.Response.StatusCode = 500 } catch {}
    } finally {
        try { $ctx.Response.OutputStream.Close() } catch {}
    }
}
