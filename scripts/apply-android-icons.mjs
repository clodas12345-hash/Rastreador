import fs from 'fs';
import path from 'path';

async function generateIcons() {
  const masterLogoPath = path.resolve('public', 'assets', 'aistudio', 'IMG-20261024-WA0125_4a3e8485.jpg');
  const fallbackIcon = path.resolve('icon.png');
  const iconSrc = fs.existsSync(masterLogoPath) ? masterLogoPath : fallbackIcon;

  const resDir = path.resolve('android', 'app', 'src', 'main', 'res');

  if (!fs.existsSync(iconSrc)) {
    console.error('Source icon not found:', iconSrc);
    return;
  }

  if (!fs.existsSync(resDir)) {
    console.log('Android res directory not found yet, skipping icon generation until android platform is added.');
    return;
  }

  // Adaptive foreground sizes (108dp canvas)
  const sizes = [
    { dir: 'mipmap-mdpi', size: 48, fgSize: 108 },
    { dir: 'mipmap-hdpi', size: 72, fgSize: 162 },
    { dir: 'mipmap-xhdpi', size: 96, fgSize: 216 },
    { dir: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
    { dir: 'mipmap-xxxhdpi', size: 192, fgSize: 432 }
  ];

  let sharp;
  try {
    const sharpModule = await import('sharp');
    sharp = sharpModule.default;
  } catch (e) {
    console.log('Sharp not installed, will use fallback copying.');
  }

  const ADAPTIVE_SCALE = 0.90; // 90% scale for max logo presence

  for (const item of sizes) {
    const targetFolder = path.join(resDir, item.dir);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    if (sharp) {
      // ic_launcher.png
      await sharp(iconSrc)
        .resize(item.size, item.size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toFile(path.join(targetFolder, 'ic_launcher.png'));

      // ic_launcher_round.png
      await sharp(iconSrc)
        .resize(item.size, item.size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toFile(path.join(targetFolder, 'ic_launcher_round.png'));

      // ic_launcher_foreground.png (High-scale foreground official master logo)
      const scaledSize = Math.round(item.fgSize * ADAPTIVE_SCALE);
      const padding = Math.floor((item.fgSize - scaledSize) / 2);

      const resizedFgBuffer = await sharp(iconSrc)
        .resize(scaledSize, scaledSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .toBuffer();

      await sharp({
        create: {
          width: item.fgSize,
          height: item.fgSize,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      })
      .composite([{ input: resizedFgBuffer, top: padding, left: padding }])
      .png()
      .toFile(path.join(targetFolder, 'ic_launcher_foreground.png'));

    } else {
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_launcher.png'));
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_launcher_round.png'));
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_launcher_foreground.png'));
    }
  }

  // 2. Notification Large Icon (ic_large_icon.png and ic_launcher.png in drawable)
  const largeIconSizes = [
    { dir: 'drawable', size: 192 },
    { dir: 'drawable-mdpi', size: 48 },
    { dir: 'drawable-hdpi', size: 72 },
    { dir: 'drawable-xhdpi', size: 96 },
    { dir: 'drawable-xxhdpi', size: 144 },
    { dir: 'drawable-xxxhdpi', size: 192 }
  ];

  for (const item of largeIconSizes) {
    const targetFolder = path.join(resDir, item.dir);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }
    if (sharp) {
      await sharp(iconSrc)
        .resize(item.size, item.size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toFile(path.join(targetFolder, 'ic_large_icon.png'));

      await sharp(iconSrc)
        .resize(item.size, item.size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toFile(path.join(targetFolder, 'ic_launcher.png'));
    } else {
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_large_icon.png'));
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_launcher.png'));
    }
  }

  console.log(`✅ All Android icons generated from official GKD Mobility master logo!`);
}

generateIcons().catch(console.error);
