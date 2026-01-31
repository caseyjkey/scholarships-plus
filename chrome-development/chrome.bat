@echo off
:: Check for Admin rights (Required for netsh)
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Error: Please run this script as Administrator.
    pause
    exit /b
)

:: Clear existing proxy
netsh interface portproxy delete v4tov4 listenport=9222 listenaddress=0.0.0.0 >nul 2>&1

:: Start Chrome
:: "" is the empty title, then the quoted path
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
--remote-debugging-port=9222 ^
--user-data-dir="%temp%\dev-mode-chrome" ^
--disk-cache-dir=null ^
--overscroll-history-navigation=0 ^
--disable-web-security ^
--allow-file-access-from-files ^
--remote-allow-origins=* ^
"%~dp0..\src\index.html"

timeout 3

:: Setup Port Forwarding
netsh interface portproxy add v4tov4 listenport=9222 connectaddress=127.0.0.1 connectport=9222 listenaddress=0.0.0.0

cls
echo ============================================
echo   Chrome Remote Debugging Active
echo ============================================
ipconfig | findstr "IPv4"
echo     Remote-Debug Port: 9222
echo ============================================
echo Press any key to close Chrome and stop proxy...
pause >nul

:: Cleanup
netsh interface portproxy add v4tov4 listenport=9222 listenaddress=0.0.0.0 connectport=9222 connectaddress=127.0.0.1
taskkill /F /IM chrome.exe /T
