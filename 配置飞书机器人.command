#!/bin/zsh
cd -- "$(dirname -- "$0")" || exit 1
python3 scripts/configure-feishu.py
read '?按回车关闭…'
