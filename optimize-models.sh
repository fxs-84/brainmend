#!/bin/bash
# 批量减面 + draco 重压缩（原文件已被 git 跟踪，可随时 checkout 还原）
set -e
mkdir -p tmp-models/out
for f in models/*.glb; do
  base=$(basename "$f")
  case "$base" in
    car-harley*|car-street-prop*) RATIO=0.2; ERR=0.0005 ;;  # 近景模型保守些
    *) RATIO=0.1; ERR=0.001 ;;
  esac
  echo "== $base (ratio=$RATIO err=$ERR)"
  npx gltf-transform simplify "$f" "tmp-models/out/$base" --ratio $RATIO --error $ERR 2>/dev/null | tail -1
  npx gltf-transform draco "tmp-models/out/$base" "tmp-models/$base" 2>/dev/null | tail -1
  mv "tmp-models/$base" "$f"
done
rm -rf tmp-models/out
echo "DONE"
