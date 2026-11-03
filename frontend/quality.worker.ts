/// <reference lib="webworker" />
const scope = self as unknown as DedicatedWorkerGlobalScope;
let previous: Uint8ClampedArray | undefined;
scope.onmessage = (
  event: MessageEvent<{
    pixels: Uint8ClampedArray;
    width: number;
    height: number;
  }>,
) => {
  const pixels = event.data.pixels;
  let brightness = 0,
    motion = 0,
    edge = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const luminance =
      0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
    brightness += luminance;
    if (previous?.length === pixels.length)
      motion += Math.abs(
        luminance -
          (0.2126 * previous[i] +
            0.7152 * previous[i + 1] +
            0.0722 * previous[i + 2]),
      );
    if (i >= 4)
      edge += Math.abs(
        luminance -
          (0.2126 * pixels[i - 4] +
            0.7152 * pixels[i - 3] +
            0.0722 * pixels[i - 2]),
      );
  }
  const count = pixels.length / 4;
  previous = pixels;
  scope.postMessage({
    brightness: brightness / count,
    motion: motion / count,
    edge: edge / count,
  });
};
export {};
