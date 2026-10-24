import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function generateAssets() {
  const masterLogoPath = path.resolve('public', 'assets', 'aistudio', 'IMG-20261024-WA0125_4a3e8485.jpg');

  if (!fs.existsSync(masterLogoPath)) {
    console.error('Master logo not found at:', masterLogoPath);
    return;
  }

  const targets = ['public', 'dist', 'assets', '.'];

  for (const dir of targets) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    // 1. Full Master Logo (512x512 PNG)
    await sharp(masterLogoPath)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(dir, 'icon-512.png'));

    await sharp(masterLogoPath)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(dir, 'icon.png'));

    await sharp(masterLogoPath)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(dir, 'logo.png'));

    await sharp(masterLogoPath)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(dir, 'icon-only.png'));

    // 2. 192x192 PNG
    await sharp(masterLogoPath)
      .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(dir, 'icon-192.png'));

    // 3. Foreground PNG for Adaptive Android Icons
    await sharp(masterLogoPath)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(dir, 'icon-foreground.png'));

    // 4. Background PNG
    await sharp({
      create: {
        width: 512,
        height: 512,
        channels: 4,
        background: { r: 15, g: 23, b: 42, alpha: 1 }
      }
    })
    .png()
    .toFile(path.join(dir, 'icon-background.png'));

    // 5. Maskable Icons (Safe Zone Padding)
    await sharp(masterLogoPath)
      .resize(430, 430, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .extend({
        top: 41,
        bottom: 41,
        left: 41,
        right: 41,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(path.join(dir, 'icon-maskable.png'));

    await sharp(masterLogoPath)
      .resize(160, 160, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .extend({
        top: 16,
        bottom: 16,
        left: 16,
        right: 16,
        background: { r: 255, g: 255, b: 255, alpha: 1 }
      })
      .png()
      .toFile(path.join(dir, 'icon-192-maskable.png'));
  }

  // Create android subfolder inside assets for @capacitor/assets
  const androidAssetsDir = path.join('assets', 'android');
  if (!fs.existsSync(androidAssetsDir)) fs.mkdirSync(androidAssetsDir, { recursive: true });
  await sharp(masterLogoPath).resize(512, 512, { fit: 'contain' }).png().toFile(path.join(androidAssetsDir, 'icon-foreground.png'));

  console.log('✅ All icons generated from official master logo image!');
}

generateAssets().catch(console.error);
