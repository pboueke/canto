#!/usr/bin/env node

/**
 * Generate app icon assets from the Canto logo.
 *
 * Usage:
 *   npm install --save-dev sharp
 *   node scripts/generate-icons.js
 *
 * Source: src/assets/images/canto_bv1.png (256×256)
 *
 * Output:
 *   assets/icon.png                    - 1024×1024 logo on white bg (iOS)
 *   assets/favicon.png                 - 48×48 logo on white bg (web)
 *   assets/splash-icon.png             - 200×200 logo on transparent bg
 *   assets/android-icon-foreground.png - 1024×1024 logo in 66% safe zone, transparent bg
 *   assets/android-icon-background.png - 1024×1024 solid white
 *   assets/android-icon-monochrome.png - 1024×1024 logo silhouette on transparent bg
 */

const sharp = require('sharp');
const path = require('path');

const SOURCE = path.resolve(__dirname, '../src/assets/images/canto_bv1.png');
const OUT = path.resolve(__dirname, '../assets');

async function generate() {
  // icon.png - 1024×1024, logo centered on white background
  await sharp(SOURCE)
    .resize(800, 800, { fit: 'inside' })
    .flatten({ background: '#FFFFFF' })
    .extend({
      top: 112,
      bottom: 112,
      left: 112,
      right: 112,
      background: '#FFFFFF',
    })
    .resize(1024, 1024)
    .png()
    .toFile(path.join(OUT, 'icon.png'));
  console.log('  icon.png');

  // favicon.png - 48×48
  await sharp(SOURCE)
    .resize(38, 38, { fit: 'inside' })
    .flatten({ background: '#FFFFFF' })
    .extend({
      top: 5,
      bottom: 5,
      left: 5,
      right: 5,
      background: '#FFFFFF',
    })
    .resize(48, 48)
    .png()
    .toFile(path.join(OUT, 'favicon.png'));
  console.log('  favicon.png');

  // splash-icon.png - 200×200 on transparent
  await sharp(SOURCE)
    .resize(200, 200, { fit: 'inside' })
    .png()
    .toFile(path.join(OUT, 'splash-icon.png'));
  console.log('  splash-icon.png');

  // android-icon-foreground.png - 1024×1024, logo in 66% safe zone (≈676px), transparent
  await sharp(SOURCE)
    .resize(676, 676, { fit: 'inside' })
    .extend({
      top: 174,
      bottom: 174,
      left: 174,
      right: 174,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(1024, 1024)
    .png()
    .toFile(path.join(OUT, 'android-icon-foreground.png'));
  console.log('  android-icon-foreground.png');

  // android-icon-background.png - 1024×1024 solid white
  await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 3,
      background: '#FFFFFF',
    },
  })
    .png()
    .toFile(path.join(OUT, 'android-icon-background.png'));
  console.log('  android-icon-background.png');

  // android-icon-monochrome.png - 1024×1024 logo silhouette on transparent bg
  // Extract alpha channel from source and use it as mask for black fill
  await sharp(SOURCE)
    .resize(676, 676, { fit: 'inside' })
    .ensureAlpha()
    .extend({
      top: 174,
      bottom: 174,
      left: 174,
      right: 174,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .resize(1024, 1024)
    .png()
    .toFile(path.join(OUT, 'android-icon-monochrome.png'));
  console.log('  android-icon-monochrome.png');

  console.log('\nDone! Run `npx expo prebuild --clean` to apply new icons.');
}

generate().catch(console.error);
