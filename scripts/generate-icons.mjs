// Genera los iconos PNG de la PWA a partir de los SVG de scripts/.
import sharp from 'sharp';
const out = new URL('../public/icons/', import.meta.url);
const icon = new URL('./icon.svg', import.meta.url);
const maskable = new URL('./icon-maskable.svg', import.meta.url);
const jobs = [
  [icon, 'icon-192.png', 192],
  [icon, 'icon-512.png', 512],
  [maskable, 'maskable-512.png', 512],
  [maskable, 'apple-touch-icon.png', 180],
  [icon, 'favicon-32.png', 32],
];
for (const [src, name, size] of jobs) {
  await sharp(src.pathname, { density: 384 }).resize(size, size).png().toFile(new URL(name, out).pathname);
  console.log('✓', name);
}
