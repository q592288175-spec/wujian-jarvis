# Run the wujian CLI from anywhere. Requires Node.js 22+ on PATH.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& node (Join-Path $here '..\cli.mjs') @args
exit $LASTEXITCODE
