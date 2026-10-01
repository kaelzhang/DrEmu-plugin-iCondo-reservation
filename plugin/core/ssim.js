// Taken from the Let's Go Fishing Island plugin (plugin/core/ssim.js), unchanged.
// Structural similarity of two grayscale images of the same size.
//
// This is the mean SSIM of Wang et al. 2004, computed over 8x8 windows
// stepped by 4 pixels (the same "mssim" the gametra reference reports through
// ssim.js, with a uniform window instead of a gaussian one). 1 means
// identical; unrelated pictures land well under 0.5.
const K1 = 0.01;
const K2 = 0.03;
const L = 255;
const C1 = (K1 * L) ** 2;
const C2 = (K2 * L) ** 2;
const WINDOW = 8;
const STEP = 4;

export function ssim(a, b, width, height) {
  if (a.length !== width * height || b.length !== width * height) {
    throw new RangeError(`ssim: expected ${width * height} samples, got ${a.length} and ${b.length}`);
  }
  // A picture smaller than one window is compared as a single window.
  const w = Math.min(WINDOW, width);
  const h = Math.min(WINDOW, height);
  const n = w * h;
  let total = 0;
  let windows = 0;
  for (let y = 0; y + h <= height; y += STEP) {
    for (let x = 0; x + w <= width; x += STEP) {
      let sumA = 0, sumB = 0, sumAA = 0, sumBB = 0, sumAB = 0;
      for (let j = 0; j < h; j += 1) {
        let i = (y + j) * width + x;
        for (let k = 0; k < w; k += 1, i += 1) {
          const va = a[i];
          const vb = b[i];
          sumA += va;
          sumB += vb;
          sumAA += va * va;
          sumBB += vb * vb;
          sumAB += va * vb;
        }
      }
      const muA = sumA / n;
      const muB = sumB / n;
      const varA = sumAA / n - muA * muA;
      const varB = sumBB / n - muB * muB;
      const cov = sumAB / n - muA * muB;
      total += ((2 * muA * muB + C1) * (2 * cov + C2)) / ((muA * muA + muB * muB + C1) * (varA + varB + C2));
      windows += 1;
      if (x + w === width) break;
    }
    if (y + h === height) break;
  }
  return windows === 0 ? 0 : total / windows;
}

// 8-bit BGRA (what `nativeImage.toBitmap()` returns) → grayscale samples.
export function bgraToGray(bgra, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
    gray[i] = Math.round(0.299 * bgra[p + 2] + 0.587 * bgra[p + 1] + 0.114 * bgra[p]);
  }
  return gray;
}
