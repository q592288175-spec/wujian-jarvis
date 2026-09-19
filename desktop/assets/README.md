# 五简原生应用图标

沿用五行环印，加入中央光核与深墨蓝底座。SVG为可编辑源；PNG与ICNS通过macOS AppKit和iconutil生成，包含16–1024px尺寸。

重新生成：`npm run desktop:icon`。构建脚本使用 `desktop/assets/wujian-app.icns`，已核对新包CFBundleIconFile指向的文件与源ICNS完全一致。

本次产物位于 `.runtime/desktop-build-brand/五简 JARVIS-darwin-arm64/五简 JARVIS.app`，已实际启动。旧包仍保留。本轮没有推送远端。
