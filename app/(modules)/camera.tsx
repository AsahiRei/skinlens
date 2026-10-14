import React, { useCallback, useMemo, useRef, useState, useEffect } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  Text,
  View,
} from "react-native";
import {
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from "react-native-vision-camera";
import type { Photo } from "react-native-vision-camera";
import { Camera, Face } from "react-native-vision-camera-face-detector";
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
} from "lucide-react-native";

import type { FaceBounds, LightingQuality, ScanAngle } from "@/types/schema";
import {
  evaluateLighting,
  evaluateAlignment,
  getAlignmentGuidance,
} from "@/utils/face-quality";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

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
}: {
  score: number; message: string; hasFace: boolean;
  lighting: LightingQuality; lightingMessage: string;
  isMulti: boolean; currentAngle: ScanAngle;
}) {
  const color =
    score > 80 ? "#4ADE80" : score > 50 ? "#F59E0B" : "#DC2626";
  const statusLabel = !hasFace
    ? "Position your face in the frame"
    : score > 80
      ? "Hold still — ready"
      : message;
  const lightingGood = lighting === "good";
  const LightingIcon = lightingGood ? Sun : lighting === "dim" ? Moon : Contrast;
  const lightingColor = lightingGood ? "#4ADE80" : "#F59E0B";
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
        <CameraIcon size={26} color={canCapture ? "#15803D" : "rgba(255,255,255,0.4)"} />
      </View>
    </Pressable>
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
                      ? "#15803D"
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
                        color: current ? "#15803D" : "rgba(255,255,255,0.5)",
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
                    backgroundColor: filled ? "#15803D" : "rgba(255,255,255,0.18)",
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
    targetResolution: { width: 720, height: 1280 },
    containerFormat: "jpeg",
    quality: 0.85,
    qualityPrioritization: "balanced",
  });
  const outputs = useMemo(() => [photoOutput], [photoOutput]);

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [qs, setQs] = useState<QualityStatus>(INITIAL_QS);

  const [isMultiAngle, setIsMultiAngle] = useState(false);
  const [capturedAngles, setCapturedAngles] = useState<Record<ScanAngle, string | null>>({
    front: null, left: null, right: null,
  });
  const [currentAngle, setCurrentAngle] = useState<ScanAngle>("front");

  const isCapturingRef = useRef(false);
  const photoRef = useRef<Photo | null>(null);
  const previewPathRef = useRef<string | null>(null);
  const currentAngleRef = useRef<ScanAngle>("front");
  const isMultiAngleRef = useRef(false);
  const capturedAnglesRef = useRef<Record<ScanAngle, string | null>>({ front: null, left: null, right: null });
  const cameraPositionRef = useRef<"front" | "back">("front");
  const qsRef = useRef<QualityStatus>(INITIAL_QS);
  const lastFrameRef = useRef(0);

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

  const handleFacesDetected = useCallback((faces: Face[]) => {
    if (isCapturingRef.current) return;

    const now = performance.now();
    if (now - lastFrameRef.current < 120) return;
    lastFrameRef.current = now;

    if (faces.length > 0) {
      const f = faces[0];
      // Reanimated shared values are mutable by design; the react-compiler
      // immutability rule can't see that, hence the disables below.
      // eslint-disable-next-line react-hooks/immutability
      faceX.value = f.bounds.x;
      // eslint-disable-next-line react-hooks/immutability
      faceY.value = f.bounds.y;
      // eslint-disable-next-line react-hooks/immutability
      faceW.value = f.bounds.width;
      // eslint-disable-next-line react-hooks/immutability
      faceH.value = f.bounds.height;
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
        alignmentScore: alignment.score,
        alignmentMessage: msg,
        // Belt-and-suspenders: score is already hard-gated to <=45 when the
        // yaw is outside the target window, but also require the yaw flag
        // directly so a front face can never unlock a side-angle capture.
        canCapture: alignment.score >= 50 && alignment.isFacingFront,
      };
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
    } else {
      faceVisible.value = 0;
      const prev = qsRef.current;
      if (prev.alignmentScore !== 0 || prev.canCapture) {
        const next = { ...prev, alignmentScore: 0, alignmentMessage: "", canCapture: false };
        qsRef.current = next;
        setQs(next);
      }
    }
  }, [estimateBrightness, faceX, faceY, faceW, faceH, faceVisible]);

  const handleFlipCamera = useCallback(() => {
    setCameraPosition((prev) => (prev === "front" ? "back" : "front"));
    // eslint-disable-next-line react-hooks/immutability
    faceVisible.value = 0;
  }, [faceVisible]);

  const handleCapture = useCallback(async () => {
    if (isCapturingRef.current || !qsRef.current.canCapture) return;
    isCapturingRef.current = true;
    try {
      const photo = await photoOutput.capturePhoto({}, {});
      const filePath = await photo.saveToTemporaryFileAsync();
      photoRef.current = photo;
      previewPathRef.current = filePath;
      setPreviewUri("file://" + filePath);
      if (isMultiAngleRef.current) {
        setCapturedAngles((prev) => ({ ...prev, [currentAngleRef.current]: filePath }));
      }
    } catch (error) {
      console.error("Failed to capture photo:", error);
      isCapturingRef.current = false;
    }
  }, [photoOutput]);

  const handleRetake = useCallback(() => {
    if (photoRef.current) { photoRef.current.dispose(); photoRef.current = null; }
    previewPathRef.current = null;
    setPreviewUri(null);
    isCapturingRef.current = false;
    if (isMultiAngleRef.current) {
      setCapturedAngles((prev) => ({ ...prev, [currentAngleRef.current]: null }));
    }
  }, []);

  const handleConfirm = useCallback(() => {
    const filePath = previewPathRef.current;
    if (!filePath) return;
    if (photoRef.current) { photoRef.current.dispose(); photoRef.current = null; }
    previewPathRef.current = null;
    setPreviewUri(null);
    isCapturingRef.current = false;

    if (isMultiAngleRef.current) {
      const angles: ScanAngle[] = ["front", "left", "right"];
      const cur = currentAngleRef.current;
      const idx = angles.indexOf(cur);
      const next = angles[idx + 1];
      const allCaptures = { ...capturedAnglesRef.current, [cur]: filePath };

      if (next && !allCaptures[next]) {
        capturedAnglesRef.current = allCaptures;
        setCapturedAngles(allCaptures);
        setCurrentAngle(next);
        lastFrameRef.current = 0;
        const resetQs: QualityStatus = { ...INITIAL_QS };
        qsRef.current = resetQs;
        setQs(resetQs);
        return;
      }

      const uris = angles.map((a) => allCaptures[a]).filter(Boolean).map((p) => "file://" + p);
      router.push({
        pathname: "/(modules)/analyzing",
        params: { imageUri: uris[0], sourceType: "camera", imageUris: JSON.stringify(uris) },
      });
    } else {
      router.push({
        pathname: "/(modules)/analyzing",
        params: { imageUri: "file://" + filePath, sourceType: "camera" },
      });
    }
  }, [router]);

  useEffect(() => {
    if (!hasPermission) {
      requestPermission().catch(() => {
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
  // Derived from React state (updated on every detection callback), NOT from
  // the faceVisible shared value — reading .value during render is stale
  // because it never triggers a re-render.
  const hasFace = qs.alignmentScore > 0;
  const scoreColor =
    qs.alignmentScore > 80 ? "#4ADE80" : qs.alignmentScore > 50 ? "#F59E0B" : "#DC2626";

  return (
    <View className="flex-1 bg-black">
      <Camera
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        device={device}
        isActive={!isPreview}
        performanceMode="fast"
        autoMode
        cameraFacing={cameraPosition}
        windowWidth={SCREEN_WIDTH}
        windowHeight={SCREEN_HEIGHT}
        onFacesDetected={handleFacesDetected}
        onError={(error) => console.error("Camera error:", error)}
        outputs={outputs}
      />

      {isPreview && (
        <Image
          source={{ uri: previewUri }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="cover"
        />
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
            <Pressable
              onPress={() => setIsMultiAngle((p) => !p)}
              className="px-4 py-2 rounded-full"
              style={{ backgroundColor: isMultiAngle ? "#15803D" : "rgba(255,255,255,0.15)" }}
            >
              <Text className="text-xs font-semibold text-white">
                {isMultiAngle ? "Multi-Angle" : "Single Shot"}
              </Text>
            </Pressable>
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
        />
      )}

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
          <Pressable onPress={handleConfirm} className="w-16 h-16 rounded-full items-center justify-center" style={{ backgroundColor: "#15803D" }}>
            <Check size={26} color="white" />
          </Pressable>
        </View>
      )}
    </View>
  );
}
