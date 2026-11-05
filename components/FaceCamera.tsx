import React, { useCallback, useEffect, useMemo, useRef } from "react";
import { Camera as VisionCamera } from "react-native-vision-camera";
import type { CameraOutput, CameraRef, CameraViewProps } from "react-native-vision-camera";
import {
  createFaceDetectorOutput,
  transformFacesToPreviewCoordinates,
} from "react-native-vision-camera-face-detector";
import type { Face } from "react-native-vision-camera-face-detector";

/**
 * Drop-in replacement for `Camera` from `react-native-vision-camera-face-detector`.
 *
 * Why this exists: the library wrapper (v2.1.0) memoizes its native detector
 * output on a rest-spread `options` object, which is a NEW object every render.
 * Every parent re-render therefore created a fresh ML Kit detector AND made
 * VisionCamera re-run `session.configure()`. Our screens re-render several
 * times a second while a face is in frame (live guidance), so the session was
 * rebuilt constantly and the preview progressively lagged.
 *
 * Here the detector output is created once per (facing, performance options)
 * combination, callbacks go through refs, and the outputs array is stable — so
 * re-rendering the parent never touches the camera session.
 *
 * Detection callbacks are also throttled BEFORE the preview-coordinate
 * transform (4 synchronous native calls per face), not after it.
 */
type Props = Omit<CameraViewProps, "onError" | "outputs"> & {
  cameraFacing?: "front" | "back";
  performanceMode?: "fast" | "accurate";
  /** Smallest face, as a fraction of the frame width, ML Kit looks for. */
  minFaceSize?: number;
  /** Minimum ms between `onFacesDetected` deliveries to JS. */
  throttleMs?: number;
  onFacesDetected: (faces: Face[]) => void;
  onError?: (error: Error) => void;
  outputs?: CameraOutput[];
};

export function FaceCamera({
  cameraFacing = "front",
  performanceMode = "fast",
  minFaceSize = 0.15,
  throttleMs = 100,
  onFacesDetected,
  onError,
  outputs,
  ...cameraProps
}: Props) {
  const cameraRef = useRef<CameraRef | null>(null);
  const onFacesRef = useRef(onFacesDetected);
  const onErrorRef = useRef(onError);
  const throttleRef = useRef(throttleMs);
  const lastDeliveryRef = useRef(0);
  const hadFacesRef = useRef(false);

  useEffect(() => {
    onFacesRef.current = onFacesDetected;
    onErrorRef.current = onError;
    throttleRef.current = throttleMs;
  });

  const handleFaces = useCallback((faces: Face[]) => {
    const hasFaces = faces.length > 0;
    const now = performance.now();
    // Always deliver the face-appeared/face-lost transition immediately so the
    // UI never waits a throttle window to react; otherwise rate-limit.
    if (hasFaces === hadFacesRef.current && now - lastDeliveryRef.current < throttleRef.current) {
      return;
    }
    lastDeliveryRef.current = now;
    hadFacesRef.current = hasFaces;

    if (!hasFaces) {
      onFacesRef.current(faces);
      return;
    }
    const camera = cameraRef.current;
    if (camera?.preview == null) return;
    onFacesRef.current(transformFacesToPreviewCoordinates(faces, camera));
  }, []);

  const handleError = useCallback((e: Error) => onErrorRef.current?.(e), []);

  const detectorOutput = useMemo(
    () =>
      // The callbacks read refs only when native code invokes them (off
      // render); the compiler can't see through the external factory call.
      // eslint-disable-next-line react-hooks/refs
      createFaceDetectorOutput({
        onFacesDetected: handleFaces,
        onError: handleError,
        outputResolution: "preview",
        cameraFacing,
        autoMode: true,
        performanceMode,
        minFaceSize,
        runLandmarks: false,
        runContours: false,
        runClassifications: false,
        trackingEnabled: false,
      }),
    [handleFaces, handleError, cameraFacing, performanceMode, minFaceSize],
  );

  const allOutputs = useMemo(
    () => [detectorOutput, ...(outputs ?? [])],
    [detectorOutput, outputs],
  );

  return (
    <VisionCamera
      {...cameraProps}
      ref={cameraRef}
      outputs={allOutputs}
      onError={handleError}
    />
  );
}

export type { Face };
export default FaceCamera;
