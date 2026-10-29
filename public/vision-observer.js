/* global importScripts, Vision, OffscreenCanvas */
let detector;
globalThis.onmessage = async ({ data }) => {
  if (data.kind === "init") {
    try {
      importScripts("/vision/runtime/vision_bundle.js");
      const files =
        await Vision.FilesetResolver.forVisionTasks("/vision/runtime");
      detector = await Vision.PoseLandmarker.createFromOptions(files, {
        baseOptions: {
          modelAssetPath: "/vision/pose_landmarker_lite.task",
          delegate: "CPU",
        },
        canvas: new OffscreenCanvas(256, 256),
        runningMode: "VIDEO",
        numPoses: 1,
        minPoseDetectionConfidence: 0.6,
        minPosePresenceConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      globalThis.postMessage({ kind: "ready" });
    } catch (error) {
      globalThis.postMessage({
        kind: "unavailable",
        reason: String(error).slice(0, 250),
      });
    }
  }
  if (data.kind === "frame") {
    try {
      const result = detector?.detectForVideo(data.bitmap, data.at);
      globalThis.postMessage({
        kind: "pose",
        at: data.at,
        landmarks: result?.landmarks?.[0] ?? [],
      });
    } catch {
      globalThis.postMessage({ kind: "pose", at: data.at, landmarks: [] });
    } finally {
      data.bitmap.close();
    }
  }
};
