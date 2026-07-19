@echo off
title Palbook - Palworld Calculator

rem Guard: double-clicking the .bat from INSIDE the zip extracts only this
rem file to a temp folder, so the server script won't be next to it.
if not exist "%~dp0palbook-server.ps1" (
  echo.
  echo   It looks like Palbook was started from inside the ZIP file.
  echo   Please extract the whole folder first: right-click the zip,
  echo   choose "Extract All...", then open the extracted folder and
  echo   double-click Palbook.bat there.
  echo.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0palbook-server.ps1"

rem Keep the window open if the server failed, so the error stays readable.
if errorlevel 1 (
  echo.
  echo   Palbook could not start - the message above has the details.
  echo.
  pause
)
