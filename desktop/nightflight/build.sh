#!/bin/bash
set -eu
source_dir=$(cd "$(dirname "$0")" && pwd)
repo=${1:?请提供含有已构建工作台的仓库目录}
app=${2:?请提供新的 .app 输出路径}
test ! -e "$app"
test -f "$repo/apps/workbench-preview/dist/nightflight/index.html"
contents="$app/Contents"
runtime="$contents/Resources/runtime"
mkdir -p "$contents/MacOS" "$runtime/apps/workbench-preview"
swiftc -module-cache-path "${TMPDIR:-/tmp}/onepitch-swift-cache" "$source_dir/main.swift" "$source_dir/ModelSettings.swift" -o "$contents/MacOS/OnePitch"
cat > "$contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>CFBundleIdentifier</key><string>cn.onepitch.desktop</string>
<key>CFBundleName</key><string>夜航提案台</string>
<key>CFBundleExecutable</key><string>OnePitch</string>
<key>CFBundleIconFile</key><string>OnePitch.icns</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleVersion</key><string>1</string>
<key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
cp "$source_dir/OnePitch.icns" "$contents/Resources/"
for item in tools docs skills scripts package.json; do cp -Rc "$repo/$item" "$runtime/"; done
cp -Rc "$repo/apps/workbench-preview/." "$runtime/apps/workbench-preview/"
# Include the dependency trees when building from a checkout sharing its node_modules.
for folder in apps/workbench-preview/node_modules tools/workbench/node_modules; do
  if test -L "$runtime/$folder"; then
    unlink "$runtime/$folder"
    cp -Rc "$repo/$folder/." "$runtime/$folder"
  fi
done
codesign --force --sign - "$app"
