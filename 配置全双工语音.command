#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
python3 scripts/configure-live.py
read '?按回车关闭…'
