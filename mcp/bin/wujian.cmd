@echo off
setlocal
rem Run the wujian CLI from anywhere. Requires Node.js 22+ on PATH.
node "%~dp0..\cli.mjs" %*
exit /b %ERRORLEVEL%
