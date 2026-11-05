import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import {
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from "react-native-vision-camera";
import type { Photo } from "react-native-vision-camera";
import { FaceCamera, type Face } from "@/components/FaceCamera";
import { useRouter } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import {
  ChevronLeft,
  Scan,
  Camera as CameraIcon,
  RotateCcw,
  RefreshCw,
  Check,
  Sun,
  Moon,
  Contrast,
  TriangleAlert,
  Timer,
} from "lucide-react-native";

import type { FaceBounds, LightingQuality, ScanAngle } from "@/types/schema";
import {
  evaluateLighting,
  evaluateAlignment,
  getAlignmentGuidance,
} from "@/utils/face-quality";
import {
  blocksCapture,
  measureImageLighting,
  type ImageLighting,
} from "@/utils/lighting";
import { theme } from "@/lib/theme";
import { cropToFace } from "@/utils/face-crop";

// Module-level on purpose: usePhotoOutput memoizes on targetResolution by
// reference. An inline object literal is new every render, which recreated the
// photo output and re-ran session.configure() on each re-render. A capture in
// flight then failed with "ImageCaptureException: Camera is closed".
const PHOTO_TARGET_RESOLUTION = { width: 720, height: 1280 };

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

const CAMERA_STYLE = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;
const FACE_BOX_TIMING = { duration: 100, easing: Easing.linear };

// ── Auto-capture ──
// The shutter fires on its own once the pose has been "ready" (aligned, lit,
// steady) for AUTO_HOLD_MS without interruption. Detections arrive ~10x/s,
// so the countdown is driven by the detection callback itself — no timers.
const AUTO_HOLD_MS = 2000;
// Lower bar than "perfect": side angles lose points for yaw by design, so 70
// still means "clearly on target" for them (manual capture unlocks at 50).
const AUTO_MIN_SCORE = 70;
// Face centre / size may drift at most this fraction of the face size between
// two detections and still count as "holding still".
const AUTO_STEADY_DRIFT = 0.06;
// Grace period after a retake / angle change so the camera doesn't snap the
// next photo before the user has even looked back at the screen.
const AUTO_COOLDOWN_MS = 1500;

const INITIAL_QS: QualityStatus = {
  lighting: { quality: "good", message: "", icon: "sun" },
  alignmentScore: 0,
  alignmentMessage: "",
  canCapture: false,
};

type QualityStatus = {
  lighting: { quality: LightingQuality; message: string; icon: "sun" | "moon" | "contrast" };
  alignmentScore: number;
  alignmentMessage: string;
  canCapture: boolean;
};

const ANGLE_GUIDE: Record<ScanAngle, { label: string; shortLabel: string; instruction: string }> = {
  front: { label: "Front", shortLabel: "Front", instruction: "Look straight at the camera" },
  left: { label: "Left cheek", shortLabel: "Left", instruction: "Turn your head to your right" },
  right: { label: "Right cheek", shortLabel: "Right", instruction: "Turn your head to your left" },
};

const GuidanceCard = React.memo(function GuidanceCard({
  score, message, hasFace, lighting, lightingMessage, isMulti, currentAngle,
  autoCapture, countdown, steady,
}: {
  score: number; message: string; hasFace: boolean;
  lighting: LightingQuality; lightingMessage: string;
  isMulti: boolean; currentAngle: ScanAngle;
  autoCapture: boolean; countdown: number | null; steady: boolean;
}) {
  const color =
    score > 80 ? "#4ADE80" : score > 50 ? theme.colors.star : theme.colors.danger;
  const statusLabel = !hasFace
    ? "Position your face in the frame"
    : countdown !== null
      ? `Hold still — capturing in ${countdown}`
      : autoCapture && score >= AUTO_MIN_SCORE && !steady
        ? "Hold still…"
        : score > 80
          ? autoCapture ? "Hold still — ready" : "Ready — tap to capture"
          : message;
  const lightingGood = lighting === "good";
  const LightingIcon = lightingGood ? Sun : lighting === "dim" ? Moon : Contrast;
  const lightingColor = lightingGood ? "#4ADE80" : theme.colors.star;
  return (
    <View
      pointerEvents="none"
      className="absolute self-center items-center"
      style={{ bottom: 128, left: 24, right: 24 }}
    >
      <View
        className="px-4 pt-2.5 pb-3 rounded-2xl items-center"
        style={{ backgroundColor: "rgba(0,0,0,0.55)", maxWidth: 340 }}
      >
        {isMulti && (
          <Text className="text-[11px] font-bold tracking-widest" style={{ color: "#4ADE80" }}>
            {ANGLE_GUIDE[currentAngle].label.toUpperCase()}
          </Text>
        )}
        {isMulti && (
          <Text className="text-[13px] font-semibold text-white text-center" style={{ marginTop: 1 }}>
            {ANGLE_GUIDE[currentAngle].instruction}
          </Text>
        )}
        <View className="flex-row items-center justify-center" style={{ marginTop: isMulti ? 6 : 0, flexWrap: "wrap" }}>
          <LightingIcon size={12} color={lightingColor} />
          <Text className="text-[11px] font-medium" style={{ color: lightingColor, marginLeft: 4 }}>
            {lightingGood ? "Good light" : lightingMessage}
          </Text>
          <Text className="text-[11px]" style={{ color: "rgba(255,255,255,0.35)", marginHorizontal: 6 }}>•</Text>
          <Scan size={12} color={hasFace ? color : "rgba(255,255,255,0.6)"} />
          <Text
            className="text-[11px] font-semibold"
            style={{ color: hasFace ? color : "rgba(255,255,255,0.6)", marginLeft: 4 }}
          >
            {statusLabel}
          </Text>
        </View>
      </View>
    </View>
  );
});

const CaptureButton = React.memo(function CaptureButton({
  canCapture, onPress,
}: { canCapture: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!canCapture}
      style={{
        width: 72, height: 72, borderRadius: 36,
        borderWidth: 3,
        borderColor: canCapture ? "white" : "rgba(255,255,255,0.3)",
        alignItems: "center", justifyContent: "center",
      }}
    >
      <View
        style={{
          width: 58, height: 58, borderRadius: 29,
          backgroundColor: canCapture ? "white" : "rgba(255,255,255,0.15)",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <CameraIcon size={26} color={canCapture ? theme.colors.primary : "rgba(255,255,255,0.4)"} />
      </View>
    </Pressable>
  );
});

const AutoCountdown = React.memo(function AutoCountdown({ value }: { value: number }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" }}
    >
      <View
        accessibilityLiveRegion="polite"
        accessibilityLabel={`Capturing in ${value}`}
        style={{
          width: 96, height: 96, borderRadius: 48,
          backgroundColor: "rgba(0,0,0,0.45)",
          borderWidth: 3, borderColor: "#4ADE80",
          alignItems: "center", justifyContent: "center",
        }}
      >
        <Text style={{ color: "white", fontSize: 44, fontWeight: "800" }}>{value}</Text>
      </View>
    </View>
  );
});

const ANGLES: ScanAngle[] = ["front", "left", "right"];

const MultiAngleStepper = React.memo(function MultiAngleStepper({
  currentAngle, capturedAngles,
}: {
  currentAngle: ScanAngle;
  capturedAngles: Record<ScanAngle, string | null>;
}) {
  const currentIdx = ANGLES.indexOf(currentAngle);
  return (
    <View
      pointerEvents="none"
      className="absolute self-center"
      style={{ top: 102 }}
    >
      <View
        className="flex-row items-center px-3.5 py-2 rounded-full"
        style={{
          backgroundColor: "rgba(0,0,0,0.55)",
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
        }}
      >
        {ANGLES.map((angle, i) => {
          const captured = capturedAngles[angle] !== null;
          const current = currentAngle === angle;
          const filled = captured || i < currentIdx;
          return (
            <React.Fragment key={angle}>
              <View className="flex-row items-center">
                <View
                  className="items-center justify-center"
                  style={{
                    width: 22, height: 22, borderRadius: 11,
                    backgroundColor: captured
                      ? theme.colors.primary
                      : current
                        ? "white"
                        : "rgba(255,255,255,0.15)",
                  }}
                >
                  {captured ? (
                    <Check size={12} color="white" strokeWidth={3.5} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 11, fontWeight: "800",
                        color: current ? theme.colors.primary : "rgba(255,255,255,0.5)",
                      }}
                    >
                      {i + 1}
                    </Text>
                  )}
                </View>
                <Text
                  style={{
                    marginLeft: 5, fontSize: 11,
                    fontWeight: current ? "700" : "500",
                    color: current || captured ? "white" : "rgba(255,255,255,0.45)",
                  }}
                >
                  {ANGLE_GUIDE[angle].shortLabel}
                </Text>
              </View>
              {i < ANGLES.length - 1 && (
                <View
                  style={{
                    width: 14, height: 2, borderRadius: 1, marginHorizontal: 8,
                    backgroundColor: filled ? theme.colors.primary : "rgba(255,255,255,0.18)",
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </View>
    </View>
  );
});

export default function FaceDetectionScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState<"front" | "back">("front");
  const device = useCameraDevice(cameraPosition);
  const photoOutput = usePhotoOutput({
    targetResolution: PHOTO_TARGET_RESOLUTION,
    containerFormat: "jpeg",
    quality: 0.85,
    qualityPrioritization: "balanced",
  });
  const outputs = useMemo(() => [photoOutput], [photoOutput]);

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  // True once previewUri is the square face crop rather than the full photo.
  const [previewCropped, setPreviewCropped] = useState(false);
  const [qs, setQs] = useState<QualityStatus>(INITIAL_QS);

  // Pixel-based lighting verdict for the frame in preview (checked in the
  // background right after capture — blocks only dark/glare, fails open).
  const [photoLighting, setPhotoLighting] = useState<ImageLighting | null>(null);
  const [photoChecking, setPhotoChecking] = useState(false);
  const lightingSeqRef = useRef(0);
  const photoLightingRef = useRef<ImageLighting | null>(null);
  const photoCheckingRef = useRef(false);

  const [isMultiAngle, setIsMultiAngle] = useState(false);
  const [capturedAngles, setCapturedAngles] = useState<Record<ScanAngle, string | null>>({
    front: null, left: null, right: null,
  });
  const [currentAngle, setCurrentAngle] = useState<ScanAngle>("front");

  const isCapturingRef = useRef(false);
  const photoRef = useRef<Photo | null>(null);
  // Camera errors are logged once per mount: console.error inside onError
  // raises a full-screen LogBox overlay in dev that blocks touches (e.g. the
  // "Use Camera" button), and CameraX keeps re-firing the same error.
  const cameraErrorLoggedRef = useRef(false);
  // file:// URIs. previewUriRef is the face crop once it's ready (what the
  // skin model analyzes); originalUriRef is the full photo, kept for face
  // verification, which does its own cropping.
  const previewUriRef = useRef<string | null>(null);
  const originalUriRef = useRef<string | null>(null);
  const capturedOriginalsRef = useRef<Record<ScanAngle, string | null>>({ front: null, left: null, right: null });
  const currentAngleRef = useRef<ScanAngle>("front");
  const isMultiAngleRef = useRef(false);
  const capturedAnglesRef = useRef<Record<ScanAngle, string | null>>({ front: null, left: null, right: null });
  const cameraPositionRef = useRef<"front" | "back">("front");
  const qsRef = useRef<QualityStatus>(INITIAL_QS);

  // Auto-capture. readySinceRef marks when the pose last became ready;
  // countdown is the whole seconds left (null = not counting).
  const [autoCapture, setAutoCapture] = useState(true);
  const autoCaptureRef = useRef(true);
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownRef = useRef<number | null>(null);
  const [steady, setSteady] = useState(false);
  const steadyRef = useRef(false);
  const readySinceRef = useRef<number | null>(null);
  const lastCenterRef = useRef<{ x: number; y: number; size: number } | null>(null);
  const autoBlockedUntilRef = useRef(0);
  const handleCaptureRef = useRef<() => void>(() => {});

  const faceX = useSharedValue(0);
  const faceY = useSharedValue(0);
  const faceW = useSharedValue(0);
  const faceH = useSharedValue(0);
  const faceVisible = useSharedValue(0);
  const guidePulse = useSharedValue(0.5);

  useEffect(() => { currentAngleRef.current = currentAngle; }, [currentAngle]);
  useEffect(() => { isMultiAngleRef.current = isMultiAngle; }, [isMultiAngle]);
  useEffect(() => { capturedAnglesRef.current = capturedAngles; }, [capturedAngles]);
  useEffect(() => { cameraPositionRef.current = cameraPosition; }, [cameraPosition]);
  useEffect(() => { autoCaptureRef.current = autoCapture; }, [autoCapture]);

  const setCountdownIfChanged = useCallback((value: number | null) => {
    if (countdownRef.current === value) return;
    countdownRef.current = value;
    setCountdown(value);
  }, []);

  const setSteadyIfChanged = useCallback((value: boolean) => {
    if (steadyRef.current === value) return;
    steadyRef.current = value;
    setSteady(value);
  }, []);

  /** Stops any running countdown; `cooldown` also delays the next one. */
  const resetAutoCapture = useCallback((cooldown: boolean) => {
    readySinceRef.current = null;
    lastCenterRef.current = null;
    setCountdownIfChanged(null);
    setSteadyIfChanged(false);
    if (cooldown) autoBlockedUntilRef.current = Date.now() + AUTO_COOLDOWN_MS;
  }, [setCountdownIfChanged, setSteadyIfChanged]);

  useEffect(() => {
    guidePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false,
    );
  }, [guidePulse]);

  const guideStyle = useAnimatedStyle(() => ({ opacity: guidePulse.value }));

  const faceBorderStyle = useAnimatedStyle(() => ({
    left: faceX.value,
    top: faceY.value,
    width: faceW.value,
    height: faceH.value,
    opacity: faceVisible.value,
  }));

  const estimateBrightness = useCallback((face: FaceBounds) => {
    const centerX = face.x + face.width / 2;
    const centerY = face.y + face.height / 2;
    const screenArea = SCREEN_WIDTH * SCREEN_HEIGHT;
    const faceArea = face.width * face.height;
    const faceRatio = faceArea / screenArea;
    const sizeScore = Math.min(1, faceRatio * 8);
    const centerDist = Math.sqrt(
      Math.pow((centerX / SCREEN_WIDTH) - 0.5, 2) +
      Math.pow((centerY / SCREEN_HEIGHT) - 0.5, 2),
    );
    const exposureScore = Math.max(0.3, 1 - centerDist);
    return Math.min(255, Math.max(0, 60 + (sizeScore * 40) + (exposureScore * 60)));
  }, []);

  // Throttling now lives in <FaceCamera> (before the native coordinate
  // transform), so this only runs ~10x/s instead of every camera frame.
  const handleFacesDetected = useCallback((faces: Face[]) => {
    if (isCapturingRef.current) return;

    if (faces.length > 0) {
      const f = faces[0];
      // Reanimated shared values are mutable by design; the react-compiler
      // immutability rule can't see that, hence the disables below.
      // Detections arrive ~every 100ms: glide between them on the UI thread
      // instead of jumping, but snap into place when the face first appears.
      if (faceVisible.value === 0) {
        // eslint-disable-next-line react-hooks/immutability
        faceX.value = f.bounds.x;
        // eslint-disable-next-line react-hooks/immutability
        faceY.value = f.bounds.y;
        // eslint-disable-next-line react-hooks/immutability
        faceW.value = f.bounds.width;
        // eslint-disable-next-line react-hooks/immutability
        faceH.value = f.bounds.height;
      } else {
         
        faceX.value = withTiming(f.bounds.x, FACE_BOX_TIMING);
         
        faceY.value = withTiming(f.bounds.y, FACE_BOX_TIMING);
         
        faceW.value = withTiming(f.bounds.width, FACE_BOX_TIMING);
         
        faceH.value = withTiming(f.bounds.height, FACE_BOX_TIMING);
      }
      // eslint-disable-next-line react-hooks/immutability
      faceVisible.value = 1;

      const bounds: FaceBounds = {
        x: f.bounds.x, y: f.bounds.y,
        width: f.bounds.width, height: f.bounds.height,
        pitchAngle: f.pitchAngle, rollAngle: f.rollAngle,
        // ML Kit reports yaw in sensor coordinates (unmirrored) while the
        // front-camera preview — and the face-box bounds, which the native
        // plugin mirrors for FRONT — are mirrored. Without this negation the
        // left/right steps feel swapped: doing the on-screen "left" action
        // yields a positive raw yaw, which is the "right" target.
        yawAngle: cameraPositionRef.current === "front" ? -(f.yawAngle ?? 0) : (f.yawAngle ?? 0),
        leftEyeOpenProbability: f.leftEyeOpenProbability,
        rightEyeOpenProbability: f.rightEyeOpenProbability,
        smilingProbability: f.smilingProbability,
        frameWidth: f.frameWidth, frameHeight: f.frameHeight,
      };

      const estBrightness = estimateBrightness(bounds);
      const lighting = evaluateLighting(estBrightness, 50);
      const target = isMultiAngleRef.current ? currentAngleRef.current : undefined;
      const alignment = evaluateAlignment(bounds, target);
      const msg = getAlignmentGuidance(alignment, bounds, target);

      const next: QualityStatus = {
        lighting,
        // The raw score is a float that changes on nearly every detection,
        // which re-rendered the whole screen ~10x/s. The UI only needs bands
        // (color thresholds at 50/80), so bucket it to steps of 5; keep >= 1
        // so "face present" (score > 0) stays true.
        alignmentScore: Math.max(1, Math.round(alignment.score / 5) * 5),
        alignmentMessage: msg,
        // Belt-and-suspenders: score is already hard-gated to <=45 when the
        // yaw is outside the target window, but also require the yaw flag
        // directly so a front face can never unlock a side-angle capture.
        canCapture: alignment.score >= 50 && alignment.isFacingFront,
      };
      // ── Auto-capture: aligned + usable light + steady for AUTO_HOLD_MS ──
      const center = {
        x: bounds.x + bounds.width / 2,
        y: bounds.y + bounds.height / 2,
        size: Math.max(bounds.width, bounds.height, 1),
      };
      const last = lastCenterRef.current;
      lastCenterRef.current = center;
      const isSteady =
        last !== null &&
        Math.abs(center.x - last.x) / center.size < AUTO_STEADY_DRIFT &&
        Math.abs(center.y - last.y) / center.size < AUTO_STEADY_DRIFT &&
        Math.abs(center.size - last.size) / center.size < AUTO_STEADY_DRIFT;
      setSteadyIfChanged(isSteady);
      const nowMs = Date.now();
      const autoReady =
        autoCaptureRef.current &&
        nowMs >= autoBlockedUntilRef.current &&
        next.canCapture &&
        alignment.score >= AUTO_MIN_SCORE &&
        !blocksCapture(lighting.quality) &&
        isSteady;
      let fireAuto = false;
      if (autoReady) {
        if (readySinceRef.current === null) readySinceRef.current = nowMs;
        const remaining = AUTO_HOLD_MS - (nowMs - readySinceRef.current);
        if (remaining <= 0) {
          fireAuto = true;
        } else {
          setCountdownIfChanged(Math.ceil(remaining / 1000));
        }
      } else {
        readySinceRef.current = null;
        setCountdownIfChanged(null);
      }

      const prev = qsRef.current;
      if (
        prev.alignmentScore !== next.alignmentScore ||
        prev.alignmentMessage !== next.alignmentMessage ||
        prev.lighting.quality !== next.lighting.quality ||
        prev.lighting.message !== next.lighting.message ||
        prev.canCapture !== next.canCapture
      ) {
        qsRef.current = next;
        setQs(next);
      }
      if (fireAuto) {
        console.log(`[SkinLens][Camera] ${new Date().toISOString()} auto-capture fired angle=`, currentAngleRef.current);
        resetAutoCapture(false);
        handleCaptureRef.current();
      }
    } else {
      faceVisible.value = 0;
      readySinceRef.current = null;
      lastCenterRef.current = null;
      setCountdownIfChanged(null);
      setSteadyIfChanged(false);
      const prev = qsRef.current;
      if (prev.alignmentScore !== 0 || prev.canCapture) {
        const next = { ...prev, alignmentScore: 0, alignmentMessage: "", canCapture: false };
        qsRef.current = next;
        setQs(next);
      }
    }
  }, [estimateBrightness, faceX, faceY, faceW, faceH, faceVisible, setCountdownIfChanged, setSteadyIfChanged, resetAutoCapture]);

  const handleFlipCamera = useCallback(() => {
    resetAutoCapture(true);
    setCameraPosition((prev) => (prev === "front" ? "back" : "front"));
    // eslint-disable-next-line react-hooks/immutability
    faceVisible.value = 0;
  }, [faceVisible, resetAutoCapture]);

  const toggleAutoCapture = useCallback(() => {
    resetAutoCapture(false);
    setAutoCapture((p) => !p);
  }, [resetAutoCapture]);

  const handleCapture = useCallback(async () => {
    if (isCapturingRef.current || !qsRef.current.canCapture) {
      console.log(`[SkinLens][Camera] ${new Date().toISOString()} capture blocked capturing=`, isCapturingRef.current, `canCapture=`, qsRef.current.canCapture);
      return;
    }
    console.log(`[SkinLens][Camera] ${new Date().toISOString()} capture start angle=`, currentAngleRef.current);
    isCapturingRef.current = true;
    try {
      const photo = await photoOutput.capturePhoto({}, {});
      const filePath = await photo.saveToTemporaryFileAsync();
      const originalUri = "file://" + filePath;
      photoRef.current = photo;
      originalUriRef.current = originalUri;
      // Not confirmable until the crop exists (Confirm is also gated on
      // photoChecking, which covers crop + lighting).
      previewUriRef.current = null;
      console.log(`[SkinLens][Camera] ${new Date().toISOString()} capture success path=`, filePath.slice(-60));
      // Show the full photo instantly, then swap in the face crop.
      setPreviewUri(originalUri);
      setPreviewCropped(false);
      const seq = ++lightingSeqRef.current;
      photoLightingRef.current = null;
      photoCheckingRef.current = true;
      setPhotoLighting(null);
      setPhotoChecking(true);
      if (isMultiAngleRef.current) {
        setCapturedAngles((prev) => ({ ...prev, [currentAngleRef.current]: originalUri }));
      }
      // Crop to the face (detected on the still photo, never throws — falls
      // back to the full photo), then measure lighting on the crop so a
      // bright window or dark room behind the user doesn't skew the verdict.
      cropToFace(originalUri)
        .then(async (crop) => {
          if (lightingSeqRef.current !== seq) return; // superseded (retake)
          previewUriRef.current = crop.uri;
          setPreviewUri(crop.uri);
          setPreviewCropped(crop.cropped);
          if (isMultiAngleRef.current) {
            setCapturedAngles((prev) => ({ ...prev, [currentAngleRef.current]: crop.uri }));
          }
          const verdict = await measureImageLighting(crop.uri);
          if (lightingSeqRef.current !== seq) return;
          photoLightingRef.current = verdict;
          photoCheckingRef.current = false;
          setPhotoLighting(verdict);
          setPhotoChecking(false);
        })
        .catch((err) => {
          if (lightingSeqRef.current !== seq) return;
          photoCheckingRef.current = false;
          setPhotoChecking(false);
          console.warn("[Camera] lighting check failed, allowing photo:", err);
        });
    } catch (error) {
      console.log(`[SkinLens][Camera] ${new Date().toISOString()} capture failed:`, error);
      console.error("Failed to capture photo:", error);
      isCapturingRef.current = false;
    }
  }, [photoOutput]);
  useEffect(() => { handleCaptureRef.current = () => { void handleCapture(); }; }, [handleCapture]);

  const handleRetake = useCallback(() => {
    resetAutoCapture(true);
    lightingSeqRef.current++; // invalidate any check still in flight
    photoLightingRef.current = null;
    photoCheckingRef.current = false;
    setPhotoLighting(null);
    setPhotoChecking(false);
    if (photoRef.current) { photoRef.current.dispose(); photoRef.current = null; }
    previewUriRef.current = null;
    originalUriRef.current = null;
    setPreviewUri(null);
    setPreviewCropped(false);
    isCapturingRef.current = false;
    if (isMultiAngleRef.current) {
      setCapturedAngles((prev) => ({ ...prev, [currentAngleRef.current]: null }));
    }
  }, [resetAutoCapture]);

  const handleConfirm = useCallback(() => {
    const uri = previewUriRef.current;
    const originalUri = originalUriRef.current ?? uri;
    console.log(`[SkinLens][Camera] ${new Date().toISOString()} confirm angle=`, currentAngleRef.current, `multi=`, isMultiAngleRef.current, `hasFile=`, !!uri);
    if (!uri || !originalUri) return;
    // Gate: dark / glare frames must be retaken; while the check runs the
    // button shows a spinner instead of confirming an uninspected photo.
    const lighting = photoLightingRef.current;
    if (photoCheckingRef.current || (lighting && blocksCapture(lighting.quality))) {
      console.log(`[SkinLens][Camera] ${new Date().toISOString()} confirm blocked checking=`, photoCheckingRef.current, `quality=`, lighting?.quality);
      return;
    }
    if (photoRef.current) { photoRef.current.dispose(); photoRef.current = null; }
    previewUriRef.current = null;
    originalUriRef.current = null;
    setPreviewUri(null);
    setPreviewCropped(false);
    isCapturingRef.current = false;

    if (isMultiAngleRef.current) {
      const angles: ScanAngle[] = ["front", "left", "right"];
      const cur = currentAngleRef.current;
      const idx = angles.indexOf(cur);
      const next = angles[idx + 1];
      const allCaptures = { ...capturedAnglesRef.current, [cur]: uri };
      const allOriginals = { ...capturedOriginalsRef.current, [cur]: originalUri };

      if (next && !allCaptures[next]) {
        capturedAnglesRef.current = allCaptures;
        capturedOriginalsRef.current = allOriginals;
        setCapturedAngles(allCaptures);
        setCurrentAngle(next);
        resetAutoCapture(true);
        const resetQs: QualityStatus = { ...INITIAL_QS };
        qsRef.current = resetQs;
        setQs(resetQs);
        return;
      }

      // Keep crops and originals index-aligned per angle.
      const done = angles.filter((a) => allCaptures[a]);
      const uris = done.map((a) => allCaptures[a] as string);
      const originals = done.map((a) => allOriginals[a] ?? (allCaptures[a] as string));
      router.push({
        pathname: "/(modules)/analyzing",
        params: {
          imageUri: uris[0],
          sourceType: "camera",
          imageUris: JSON.stringify(uris),
          originalUris: JSON.stringify(originals),
        },
      });
    } else {
      router.push({
        pathname: "/(modules)/analyzing",
        params: { imageUri: uri, sourceType: "camera", originalUris: JSON.stringify([originalUri]) },
      });
    }
  }, [router, resetAutoCapture]);

  const handleCameraError = useCallback((error: Error) => {
    if (!cameraErrorLoggedRef.current) {
      cameraErrorLoggedRef.current = true;
      console.log("Camera error:", error);
    }
  }, []);

  useEffect(() => {
    console.log(`[SkinLens][Camera] ${new Date().toISOString()} permission check hasPermission=`, hasPermission);
    if (!hasPermission) {
      requestPermission()
        .then((granted) => console.log(`[SkinLens][Camera] ${new Date().toISOString()} permission result=`, granted))
        .catch((err) => {
          console.log(`[SkinLens][Camera] ${new Date().toISOString()} permission request failed:`, err);
          // Denial is handled by the fallback UI below — no unhandled rejection.
        });
    }
  }, [hasPermission, requestPermission]);

  if (!hasPermission) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Text className="mt-3 text-base text-white">Camera permission required</Text>
      </View>
    );
  }
  if (!device) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <ActivityIndicator size="large" color="#FFFFFF" />
        <Text className="mt-3 text-base text-white">Loading camera...</Text>
      </View>
    );
  }

  const isPreview = previewUri !== null;
  const confirmBlocked =
    photoLighting !== null && blocksCapture(photoLighting.quality);
  // Derived from React state (updated on every detection callback), NOT from
  // the faceVisible shared value — reading .value during render is stale
  // because it never triggers a re-render.
  const hasFace = qs.alignmentScore > 0;
  const scoreColor =
    qs.alignmentScore > 80 ? "#4ADE80" : qs.alignmentScore > 50 ? theme.colors.star : theme.colors.danger;

  return (
    <View className="flex-1 bg-black">
      <FaceCamera
        style={CAMERA_STYLE}
        device={device}
        isActive={!isPreview}
        performanceMode="fast"
        // The UI asks users to fill the frame; skipping tiny faces makes each
        // ML Kit pass cheaper.
        minFaceSize={0.2}
        cameraFacing={cameraPosition}
        onFacesDetected={handleFacesDetected}
        onError={handleCameraError}
        outputs={outputs}
      />

      {isPreview && !previewCropped && (
        <Image
          source={{ uri: previewUri }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="cover"
        />
      )}

      {/* Face crop — shown whole (not zoomed) so the user approves exactly
          what the skin model will analyze. */}
      {isPreview && previewCropped && (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "#000", alignItems: "center", justifyContent: "center" }}>
          <Image
            source={{ uri: previewUri }}
            style={{ width: SCREEN_WIDTH - 32, height: SCREEN_WIDTH - 32, borderRadius: 16 }}
            resizeMode="cover"
          />
        </View>
      )}

      {/* Top gradient */}
      <View pointerEvents="none" style={{ position: "absolute", top: 0, left: 0, right: 0, height: 160, backgroundColor: "rgba(0,0,0,0.5)" }} />

      {/* Top bar */}
      <View className="absolute top-0 left-0 right-0" style={{ paddingTop: 56 }}>
        <View className="px-5 flex-row items-center justify-between">
          <Pressable
            onPress={isPreview ? handleRetake : () => router.back()}
            className="flex-row items-center gap-1"
          >
            <ChevronLeft size={20} color="#FFFFFF" />
            <Text className="text-white font-semibold text-base">
              {isPreview ? "Retake" : "Back"}
            </Text>
          </Pressable>
          {!isPreview && (
            <View className="flex-row items-center gap-2">
              <Pressable
                onPress={toggleAutoCapture}
                accessibilityRole="switch"
                accessibilityState={{ checked: autoCapture }}
                accessibilityLabel="Auto capture"
                className="flex-row items-center gap-1 px-3 py-2 rounded-full"
                style={{ backgroundColor: autoCapture ? theme.colors.primary : "rgba(255,255,255,0.15)" }}
              >
                <Timer size={13} color="#FFFFFF" />
                <Text className="text-xs font-semibold text-white">
                  {autoCapture ? "Auto" : "Manual"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  resetAutoCapture(true);
                  setIsMultiAngle((p) => !p);
                }}
                className="px-4 py-2 rounded-full"
                style={{ backgroundColor: isMultiAngle ? theme.colors.primary : "rgba(255,255,255,0.15)" }}
              >
                <Text className="text-xs font-semibold text-white">
                  {isMultiAngle ? "Multi-Angle" : "Single Shot"}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Slim multi-angle stepper — sits inside the top gradient, never covers the face */}
      {!isPreview && isMultiAngle && (
        <MultiAngleStepper currentAngle={currentAngle} capturedAngles={capturedAngles} />
      )}

      {/* Face box — animated on UI thread, no React re-render */}
      {!isPreview && (
        <Animated.View pointerEvents="none" style={[{ position: "absolute", borderRadius: 16, borderWidth: 2.5, borderColor: scoreColor }, faceBorderStyle]}>
          <View style={{ position: "absolute", top: -1, left: -1, width: 24, height: 24, borderTopWidth: 4, borderLeftWidth: 4, borderColor: scoreColor, borderTopLeftRadius: 16 }} />
          <View style={{ position: "absolute", top: -1, right: -1, width: 24, height: 24, borderTopWidth: 4, borderRightWidth: 4, borderColor: scoreColor, borderTopRightRadius: 16 }} />
          <View style={{ position: "absolute", bottom: -1, left: -1, width: 24, height: 24, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: scoreColor, borderBottomLeftRadius: 16 }} />
          <View style={{ position: "absolute", bottom: -1, right: -1, width: 24, height: 24, borderBottomWidth: 4, borderRightWidth: 4, borderColor: scoreColor, borderBottomRightRadius: 16 }} />
        </Animated.View>
      )}

      {/* No-face guide */}
      {!isPreview && (
        <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center", opacity: hasFace ? 0 : 1 }}>
          <Animated.View style={guideStyle}>
            <View style={{ width: 200, height: 260, alignItems: "center", justifyContent: "center" }}>
              <View style={{ position: "absolute", width: 200, height: 260, borderRadius: 100, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)", borderStyle: "dashed" }} />
              <View style={{ position: "absolute", top: 30, left: 20, width: 24, height: 24, borderTopWidth: 3, borderLeftWidth: 3, borderColor: "rgba(255,255,255,0.7)" }} />
              <View style={{ position: "absolute", top: 30, right: 20, width: 24, height: 24, borderTopWidth: 3, borderRightWidth: 3, borderColor: "rgba(255,255,255,0.7)" }} />
              <View style={{ position: "absolute", bottom: 30, left: 20, width: 24, height: 24, borderBottomWidth: 3, borderLeftWidth: 3, borderColor: "rgba(255,255,255,0.7)" }} />
              <View style={{ position: "absolute", bottom: 30, right: 20, width: 24, height: 24, borderBottomWidth: 3, borderRightWidth: 3, borderColor: "rgba(255,255,255,0.7)" }} />
              <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "500", textAlign: "center" }}>
                Center your face here{"\n"}Move closer so it fills the frame
              </Text>
            </View>
          </Animated.View>
        </View>
      )}

      {/* Auto-capture countdown */}
      {!isPreview && countdown !== null && <AutoCountdown value={countdown} />}

      {/* Bottom gradient */}
      <View pointerEvents="none" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200, backgroundColor: "rgba(0,0,0,0.6)" }} />

      {/* Bottom guidance — one compact card: angle instruction + lighting + alignment */}
      {!isPreview && (
        <GuidanceCard
          score={qs.alignmentScore}
          message={qs.alignmentMessage}
          hasFace={qs.alignmentScore > 0}
          lighting={qs.lighting.quality}
          lightingMessage={qs.lighting.message}
          isMulti={isMultiAngle}
          currentAngle={currentAngle}
          autoCapture={autoCapture}
          countdown={countdown}
          steady={steady}
        />
      )}

      {/* Captured-frame lighting verdict (pixel check on the preview photo) */}
      {isPreview && (photoChecking || photoLighting) ? (
        <View className="absolute left-5 right-5" style={{ bottom: 122 }}>
          <View
            className="flex-row items-center gap-2 px-4 py-3"
            style={{
              borderRadius: 16,
              backgroundColor: confirmBlocked
                ? "rgba(153,27,27,0.95)"
                : "rgba(0,0,0,0.7)",
              borderWidth: 1,
              borderColor: confirmBlocked ? "#FCA5A5" : "rgba(255,255,255,0.2)",
            }}
          >
            {photoChecking ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : confirmBlocked ? (
              <TriangleAlert size={16} color="#FCA5A5" />
            ) : photoLighting?.quality === "good" ? (
              <Sun size={16} color="#4ADE80" />
            ) : photoLighting?.icon === "moon" ? (
              <Moon size={16} color={theme.colors.star} />
            ) : photoLighting?.icon === "contrast" ? (
              <Contrast size={16} color={theme.colors.star} />
            ) : (
              <Sun size={16} color={theme.colors.star} />
            )}
            <Text
              className="text-xs flex-1 text-white"
              style={{ fontWeight: "600" }}
            >
              {photoChecking
                ? "Checking the light in this photo…"
                : confirmBlocked
                  ? `${photoLighting?.message ?? "Bad lighting"} — retake this photo`
                  : photoLighting?.quality === "good"
                    ? "Light looks good"
                    : photoLighting?.message ?? ""}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Bottom controls */}
      {!isPreview ? (
        <View className="absolute bottom-0 left-0 right-0 flex-row items-center justify-center" style={{ height: 110, paddingBottom: 20 }}>
          <CaptureButton canCapture={qs.canCapture} onPress={handleCapture} />
          <Pressable
            onPress={handleFlipCamera}
            className="absolute right-6 w-11 h-11 rounded-full items-center justify-center"
            style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
          >
            <RotateCcw size={22} color="white" />
          </Pressable>
        </View>
      ) : (
        <View className="absolute bottom-0 left-0 right-0 flex-row items-center justify-around" style={{ height: 110, paddingBottom: 20 }}>
          <Pressable onPress={handleRetake} className="w-16 h-16 rounded-full items-center justify-center" style={{ borderWidth: 2, borderColor: "white", backgroundColor: "rgba(255,255,255,0.1)" }}>
            <RefreshCw size={26} color="white" />
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            disabled={photoChecking || confirmBlocked}
            accessibilityLabel="Use this photo"
            className="w-16 h-16 rounded-full items-center justify-center"
            style={{
              backgroundColor: confirmBlocked ? theme.colors.muted : theme.colors.primary,
              opacity: photoChecking ? 0.85 : 1,
            }}
          >
            {photoChecking ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : confirmBlocked ? (
              <TriangleAlert size={26} color="white" />
            ) : (
              <Check size={26} color="white" />
            )}
          </Pressable>
        </View>
      )}
    </View>
  );
}
