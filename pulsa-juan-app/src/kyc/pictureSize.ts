import { CameraView } from 'expo-camera';

// Without a pictureSize, expo-camera takes the largest size the camera lists.
// That can be a huge "maximum resolution" mode (6048×4024 on the emulator,
// 50 MP on some phones): slow, heavy uploads, and on the emulator a black
// photo. We pick a normal size from the camera's own list instead.

function parse(size: string) {
  const m = /^(\d+)x(\d+)$/.exec(size.trim());
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return { size, long: Math.max(w, h), short: Math.min(w, h) };
}

/**
 * The listed size closest to `targetLong` on its long side, preferring 4:3
 * (the sensor's own shape, so nothing is cropped). Falls back to the closest
 * size of any shape; undefined when the list is empty or unreadable.
 */
export function pickPictureSize(sizes: string[], targetLong: number): string | undefined {
  const parsed = sizes.map(parse).filter((s): s is NonNullable<ReturnType<typeof parse>> => !!s);
  if (!parsed.length) return undefined;
  const byDistance = (a: { long: number }, b: { long: number }) => Math.abs(a.long - targetLong) - Math.abs(b.long - targetLong);
  const fourThree = parsed.filter((s) => Math.abs(s.long / s.short - 4 / 3) < 0.02);
  return [...(fourThree.length ? fourThree : parsed)].sort(byDistance)[0]?.size;
}

/** Reads the camera's sizes once it is ready; never throws. */
export async function choosePictureSize(camera: CameraView | null, targetLong: number) {
  try {
    const sizes = (await camera?.getAvailablePictureSizesAsync()) ?? [];
    return pickPictureSize(sizes, targetLong);
  } catch {
    return undefined;
  }
}
