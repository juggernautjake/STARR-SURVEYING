# Starr CAD desktop icons

Placeholder note for cad-desktop-tauri-and-perf Slice T2.

Tauri's bundler reads icon paths from `tauri.conf.json` →
`bundle.icon`. The expected set:

- `32x32.png`
- `128x128.png`
- `128x128@2x.png`
- `icon.icns` (macOS)
- `icon.ico` (Windows)

Slice T8 (CI matrix) ships the real branded icons. For Slice T2 the
dev shell can run without them — `cargo tauri dev` works fine; the
bundler only requires them when producing distribution artifacts.

The recommended way to generate them is:
```
npx @tauri-apps/cli icon path/to/source-1024x1024.png
```
which writes all six platform variants in one shot.
