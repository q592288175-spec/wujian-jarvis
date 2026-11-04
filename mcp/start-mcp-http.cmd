@echo off
setlocal
cd /d "%~dp0.."
echo 小木 MCP HTTP: http://127.0.0.1:4319/mcp
echo 需要先启动小木工作台（http://127.0.0.1:4318）。
node mcp\server.mjs --http --port 4319
pause
