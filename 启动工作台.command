#!/bin/zsh
cd "${0:A:h}"
open http://127.0.0.1:4318
exec node --env-file-if-exists=.env server.mjs
