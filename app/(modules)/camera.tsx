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

const ANGLE_GUIDE: Record<ScanAngle, { label: string; instruction: string }> = {
  front: { label: "Front", instruction: "Face the camera straight on" },
  left: { label: "Left", instruction: "Turn head slightly to your right" },
  right: { label: "Right", instruction: "Turn head slightly to your left" },
};

const FaceOverlay = React.memo(function FaceOverlay({
  x, y, w, h, color,
}: { x: number; y: number; w: number; h: number; color: string }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: "absolute", left: x, top: y, width: w, height: h }}
    >
      <View style={{ position: "absolute", inset: 0, borderRadius: 16, borderWidth: 2.5, borderColor: color }} />
      <View style={{ position: "absolute", top: -1, left: -1, width: 24, height: 24, borderTopWidth: 4, borderLeftWidth: 4, borderColor: color, borderTopLeftRadius: 16 }} />
      <View style={{ position: "absolute", top: -1, right: -1, width: 24, height: 24, borderTopWidth: 4, borderRightWidth: 4, borderColor: color, borderTopRightRadius: 16 }} />
      <View style={{ position: "absolute", bottom: -1, left: -1, width: 24, height: 24, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: color, borderBottomLeftRadius: 16 }} />
      <View style={{ position: "absolute", bottom: -1, right: -1, width: 24, height: 24, borderBottomWidth: 4, borderRightWidth: 4, borderColor: color, borderBottomRightRadius: 16 }} />
    </View>
  );
});

const LightingBadge = React.memo(function LightingBadge({
  quality, message,
}: { quality: LightingQuality; message: string }) {
  const good = quality === "good";
  const Icon = good ? Sun : quality === "dim" ? Moon : Contrast;
  return (
    <View pointerEvents="none" className="absolute" style={{ top: 90, left: 20 }}>
      <View
        className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-full"
        style={{ backgroundColor: good ? "rgba(22,163,74,0.85)" : "rgba(217,119,6,0.85)" }}
      >
        <Icon size={12} color="white" />
        <Text className="text-xs font-medium text-white">
          {good ? "Good lighting" : message}
        </Text>
      </View>
    </View>
  );
});

const AlignmentStatus = React.memo(function AlignmentStatus({
  score, message, hasFace, isMulti,
}: { score: number; message: string; hasFace: boolean; isMulti: boolean }) {
  const color =
    score > 80 ? "#22C55E" : score > 50 ? "#FBBF24" : "#EF4444";
  const label = !hasFace
    ? "Looking for face"
    : score > 80
      ? "Ready to capture"
      : message;
  return (
    <View
      pointerEvents="none"
      className="absolute self-center"
      style={{ bottom: isMulti ? 125 : 130 }}
    >
      <View className="px-4 py-2 rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
        <View className="flex-row items-center gap-1.5">
          <Scan size={14} color={hasFace ? color : "rgba(255,255,255,0.6)"} />
          <Text
            className="text-sm font-semibold"
            style={{ color: hasFace ? color : "rgba(255,255,255,0.6)" }}
          >
            {label}
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

export default function FaceDetectionScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState<"front" | "back">("front");
  const device = useCameraDevice(cameraPosition);
  const photoOutput = usePhotoOutput({
    targetResolution: { width: 1280, height: 720 },
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

  useEffect(() => {
    guidePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1, false,
    );
  }, []);

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
      faceX.value = f.bounds.x;
      faceY.value = f.bounds.y;
      faceW.value = f.bounds.width;
      faceH.value = f.bounds.height;
      faceVisible.value = 1;

      const bounds: FaceBounds = {
        x: f.bounds.x, y: f.bounds.y,
        width: f.bounds.width, height: f.bounds.height,
        pitchAngle: f.pitchAngle, rollAngle: f.rollAngle, yawAngle: f.yawAngle,
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
        canCapture: alignment.score >= 50,
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
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

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
        <ActivityIndicator size="large" color="#00FF88" />
        <Text className="mt-3 text-base text-white">Loading camera...</Text>
      </View>
    );
  }

  const isPreview = previewUri !== null;
  const hasFace = faceVisible.value === 1;
  const scoreColor =
    qs.alignmentScore > 80 ? "#22C55E" : qs.alignmentScore > 50 ? "#FBBF24" : "#EF4444";

  return (
    <View className="flex-1 bg-black">
      <Camera
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        device={device}
        isActive={!isPreview}
        performanceMode="fast"
        autoMode
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
              className={`px-4 py-2 rounded-full ${isMultiAngle ? "bg-green-600" : "bg-white/15"}`}
            >
              <Text className={`text-xs font-semibold ${isMultiAngle ? "text-white" : "text-white/80"}`}>
                {isMultiAngle ? "Multi-Angle" : "Single Shot"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Lighting badge */}
      {!isPreview && qs.alignmentScore > 0 && (
        <LightingBadge quality={qs.lighting.quality} message={qs.lighting.message} />
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
                Position your face here
              </Text>
            </View>
          </Animated.View>
        </View>
      )}

      {/* Bottom gradient */}
      <View pointerEvents="none" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 200, backgroundColor: "rgba(0,0,0,0.6)" }} />

      {/* Multi-angle dots */}
      {!isPreview && isMultiAngle && (
        <View pointerEvents="none" className="absolute flex-row items-center justify-center gap-4" style={{ bottom: 180, left: 0, right: 0 }}>
          {(["front", "left", "right"] as ScanAngle[]).map((angle) => {
            const captured = capturedAngles[angle] !== null;
            const current = currentAngle === angle;
            return (
              <View key={angle} className="items-center gap-1.5">
                <View
                  className="w-9 h-9 rounded-full items-center justify-center"
                  style={{
                    backgroundColor: captured ? "#15803D" : current ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.08)",
                    borderWidth: current ? 1.5 : 0, borderColor: "rgba(255,255,255,0.5)",
                  }}
                >
                  {captured ? <Check size={14} color="white" /> : (
                    <Text style={{ fontSize: 12, fontWeight: "700", color: current ? "white" : "rgba(255,255,255,0.4)" }}>
                      {angle === "front" ? "F" : angle === "left" ? "L" : "R"}
                    </Text>
                  )}
                </View>
                <Text style={{ fontSize: 10, fontWeight: current ? "600" : "400", color: current ? "white" : "rgba(255,255,255,0.4)" }}>
                  {ANGLE_GUIDE[angle].label}
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Multi-angle instruction */}
      {!isPreview && isMultiAngle && qs.alignmentScore > 0 && (
        <View pointerEvents="none" className="absolute self-center" style={{ bottom: 155 }}>
          <View className="px-4 py-2 rounded-full" style={{ backgroundColor: "rgba(22,163,74,0.85)" }}>
            <Text className="text-xs font-semibold text-white text-center">
              {ANGLE_GUIDE[currentAngle].instruction}
            </Text>
          </View>
        </View>
      )}

      {/* Alignment status */}
      {!isPreview && (
        <AlignmentStatus
          score={qs.alignmentScore}
          message={qs.alignmentMessage}
          hasFace={qs.alignmentScore > 0}
          isMulti={isMultiAngle}
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
