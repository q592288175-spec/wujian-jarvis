#!/bin/zsh
cd "${0:A:h}"
python3 scripts/configure-market.py
read -k 1 '?按任意键关闭'
