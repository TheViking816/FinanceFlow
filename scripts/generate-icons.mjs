import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';

const svgPath = path.resolve('assets/icon.svg');
const outputDir = path.resolve('public/icons');
const background = '#111827';

const createIcon = async (size, filename) => {
  const svgBuffer = await fs.readFile(svgPath);
  await sharp(svgBuffer)
    .resize(size, size, { fit: 'contain', background })
    .png()
    .toFile(path.join(outputDir, filename));
};

const createMaskable = async (size, filename, scale = 0.82) => {
  const svgBuffer = await fs.readFile(svgPath);
  const innerSize = Math.round(size * scale);
  const padding = Math.round((size - innerSize) / 2);
  const innerBuffer = await sharp(svgBuffer)
    .resize(innerSize, innerSize, { fit: 'contain', background })
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: innerBuffer, left: padding, top: padding }])
    .png()
    .toFile(path.join(outputDir, filename));
};

const run = async () => {
  await fs.mkdir(outputDir, { recursive: true });

  await createIcon(192, 'icon-192.png');
  await createIcon(512, 'icon-512.png');
  await createIcon(180, 'apple-touch-icon.png');
  await createMaskable(512, 'icon-512-maskable.png');

  console.log('PWA icons generated in public/icons.');
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
