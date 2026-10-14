import fs from 'fs';
import path from 'path';

async function generateIcons() {
  const iconSrc = path.resolve('icon.png');
  const resDir = path.resolve('android', 'app', 'src', 'main', 'res');

  if (!fs.existsSync(iconSrc)) {
    console.error('Source icon not found:', iconSrc);
    return;
  }

  if (!fs.existsSync(resDir)) {
    console.log('Android res directory not found yet, skipping icon generation until android platform is added.');
    return;
  }

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

  // 1. App Launcher Icons (Full Color Mipmap)
  for (const item of sizes) {
    const targetFolder = path.join(resDir, item.dir);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }

    if (sharp) {
      await sharp(iconSrc)
        .resize(item.size, item.size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toFile(path.join(targetFolder, 'ic_launcher.png'));

      await sharp(iconSrc)
        .resize(item.size, item.size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
        .png()
        .toFile(path.join(targetFolder, 'ic_launcher_round.png'));

      await sharp(iconSrc)
        .resize(item.fgSize, item.fgSize, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
        .png()
        .toFile(path.join(targetFolder, 'ic_launcher_foreground.png'));
    } else {
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_launcher.png'));
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_launcher_round.png'));
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_launcher_foreground.png'));
    }
  }

  // 2. Notification Large Icon (ic_large_icon.png and ic_launcher.png in drawable)
  // Large icon displays the full-color app logo on Android notification cards
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
        .resize(item.size, item.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(targetFolder, 'ic_large_icon.png'));

      await sharp(iconSrc)
        .resize(item.size, item.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(path.join(targetFolder, 'ic_launcher.png'));
    } else {
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_large_icon.png'));
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_launcher.png'));
    }
  }

  // 3. Notification Small Silhouette Icon (ic_stat_icon.png)
  // Android status bar requires monochrome white on alpha transparency
  const smallSilhouetteSvg = `
  <svg width="96" height="96" viewBox="0 0 96 96" xmlns="http://www.w3.org/2000/svg">
    <!-- Outer Pin Shape -->
    <path fill-rule="evenodd" d="
      M48 8 
      C30 8 16 22 16 40 
      C16 62 48 88 48 88 
      C48 88 80 62 80 40 
      C80 22 66 8 48 8 Z
      M42 30 
      L45 24 
      L51 24 
      L54 30 
      Z
      M36 30
      L60 30
      C62 30 63 31 63 33
      L63 38
      C63 40 62 41 60 41
      L36 41
      C34 41 33 40 33 38
      L33 33
      C33 31 34 30 36 30
      Z
      M40 46
      C42.2 46 44 44.2 44 42
      C44 39.8 42.2 38 40 38
      C37.8 38 36 39.8 36 42
      C36 44.2 37.8 46 40 46
      Z
      M56 46
      C58.2 46 60 44.2 60 42
      C60 39.8 58.2 38 56 38
      C53.8 38 52 39.8 52 42
      C52 44.2 53.8 46 56 46
      Z
    " fill="#ffffff"/>
  </svg>
  `;

  const statIconSizes = [
    { dir: 'drawable', size: 24 },
    { dir: 'drawable-mdpi', size: 24 },
    { dir: 'drawable-hdpi', size: 36 },
    { dir: 'drawable-xhdpi', size: 48 },
    { dir: 'drawable-xxhdpi', size: 72 },
    { dir: 'drawable-xxxhdpi', size: 96 }
  ];

  for (const item of statIconSizes) {
    const targetFolder = path.join(resDir, item.dir);
    if (!fs.existsSync(targetFolder)) {
      fs.mkdirSync(targetFolder, { recursive: true });
    }
    if (sharp) {
      await sharp(Buffer.from(smallSilhouetteSvg))
        .resize(item.size, item.size)
        .png()
        .toFile(path.join(targetFolder, 'ic_stat_icon.png'));

      // Also copy to ic_stat_icon_config_sample.png as fallback
      fs.copyFileSync(
        path.join(targetFolder, 'ic_stat_icon.png'),
        path.join(targetFolder, 'ic_stat_icon_config_sample.png')
      );
    } else {
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_stat_icon.png'));
      fs.copyFileSync(iconSrc, path.join(targetFolder, 'ic_stat_icon_config_sample.png'));
    }
  }

  // 4. Splash Screen drawables
  const drawableDirs = [
    'drawable', 'drawable-land-hdpi', 'drawable-land-mdpi', 'drawable-land-xhdpi', 
    'drawable-land-xxhdpi', 'drawable-land-xxxhdpi', 'drawable-port-hdpi', 
    'drawable-port-mdpi', 'drawable-port-xhdpi', 'drawable-port-xxhdpi', 'drawable-port-xxxhdpi'
  ];
  for (const d of drawableDirs) {
    const dPath = path.join(resDir, d);
    if (fs.existsSync(dPath)) {
      fs.copyFileSync(iconSrc, path.join(dPath, 'splash.png'));
    }
  }

  console.log('✅ Android icons, largeIcon & smallIcon notification assets successfully generated!');
}

generateIcons().catch(console.error);
