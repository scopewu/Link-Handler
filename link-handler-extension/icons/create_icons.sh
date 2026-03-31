#!/bin/bash
# 创建简单的 SVG 图标并转换为 PNG

# 创建 SVG 图标
cat > icon.svg << 'SVGEOF'
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#4a90d9"/>
      <stop offset="100%" style="stop-color:#357abd"/>
    </linearGradient>
  </defs>
  <rect width="128" height="128" rx="20" fill="url(#grad)"/>
  <path d="M44 40 L64 20 L84 40 L76 48 L64 36 L52 48 Z" fill="white"/>
  <path d="M44 88 L64 108 L84 88 L76 80 L64 92 L52 80 Z" fill="white"/>
  <rect x="58" y="44" width="12" height="40" fill="white"/>
</svg>
SVGEOF

# 使用 ImageMagick 转换（如果可用）
if command -v convert &> /dev/null; then
    convert -background none icon.svg -resize 16x16 icon16.png
    convert -background none icon.svg -resize 48x48 icon48.png
    convert -background none icon.svg -resize 128x128 icon128.png
    echo "Icons created with ImageMagick"
else
    echo "ImageMagick not found, creating placeholder icons..."
    # 创建占位符文件
    touch icon16.png icon48.png icon128.png
fi

rm -f icon.svg
