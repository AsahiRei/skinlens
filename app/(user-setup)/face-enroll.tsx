import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import {
  useCameraDevice,
  useCameraPermission,
  usePhotoOutput,
} from "react-native-vision-camera";
import type { Photo } from "react-native-vision-camera";
import { Camera, Face } from "react-native-vision-camera-face-detector";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import {
  Camera as CameraIcon,
  Check,
  ChevronLeft,
  RefreshCw,
  Scan,
  ScanFace,
  ShieldCheck,
} from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { saveFaceIdentity } from "@/lib/db";
import { uploadImageToCloudinary } from "@/utils/cloudinary";
import {
  embeddingToJson,
  getFaceEmbedding,
} from "@/utils/face-embeddings";
import {
  evaluateAlignment,
  getAlignmentGuidance,
} from "@/utils/face-quality";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function FaceEnroll() {
  const router = useRouter();
  const { healthScore, answers, mode } = useLocalSearchParams<{
    healthScore?: string;
    answers?: string;
    mode?: string;
  }>();
  const isReenroll = mode === "reenroll";

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice("front");
  const photoOutput = usePhotoOutput({
    targetResolution: { width: 1280, height: 720 },
    containerFormat: "jpeg",
    quality: 0.85,
    qualityPrioritization: "balanced",
  });
  const outputs = useMemo(() => [photoOutput], [photoOutput]);

  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [guidance, setGuidance] = useState("");
  const [canCapture, setCanCapture] = useState(false);
  const [saving, setSaving] = useState(false);
  const [consented, setConsented] = useState(false);

  const isCapturingRef = useRef(false);
  const previewPathRef = useRef<string | null>(null);
  const canCaptureRef = useRef(false);
  const lastFrameRef = useRef(0);
  const scoreRef = useRef(0);

  const faceX = useSharedValue(0);
  const faceY = useSharedValue(0);
  const faceW = useSharedValue(0);
  const faceH = useSharedValue(0);
  const faceVisible = useSharedValue(0);
  const guidePulse = useSharedValue(0.5);

  useEffect(() => {
    guidePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.5, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      false,
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

  useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission, requestPermission]);

  const handleFacesDetected = useCallback(
    (faces: Face[]) => {
      if (isCapturingRef.current) return;
      const now = performance.now();
      if (now - lastFrameRef.current < 120) return;
      lastFrameRef.current = now;

      if (faces.length > 0) {
        const f = faces[0];
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

        const alignment = evaluateAlignment(
          {
            x: f.bounds.x,
            y: f.bounds.y,
            width: f.bounds.width,
            height: f.bounds.height,
            pitchAngle: f.pitchAngle,
            rollAngle: f.rollAngle,
            yawAngle: f.yawAngle,
          },
          "front",
        );
        const msg = getAlignmentGuidance(
          alignment,
          {
            x: f.bounds.x,
            y: f.bounds.y,
            width: f.bounds.width,
            height: f.bounds.height,
            pitchAngle: f.pitchAngle,
            rollAngle: f.rollAngle,
            yawAngle: f.yawAngle,
          },
          "front",
        );
        const ready = alignment.score >= 50;
        scoreRef.current = alignment.score;
        canCaptureRef.current = ready;
        setScore(alignment.score);
        setGuidance(msg);
        setCanCapture(ready);
      } else {
        faceVisible.value = 0;
        if (scoreRef.current !== 0) {
          scoreRef.current = 0;
          canCaptureRef.current = false;
          setScore(0);
          setGuidance("");
          setCanCapture(false);
        }
      }
    },
    [faceX, faceY, faceW, faceH, faceVisible],
  );

  const handleCapture = useCallback(async () => {
    if (isCapturingRef.current || !canCaptureRef.current) return;
    isCapturingRef.current = true;
    try {
      const photo: Photo = await photoOutput.capturePhoto({}, {});
      const filePath = await photo.saveToTemporaryFileAsync();
      photo.dispose();
      previewPathRef.current = filePath;
      setPreviewUri("file://" + filePath);
    } catch (error) {
      console.error("Face enroll capture failed:", error);
      ToastAndroid.show("Capture failed. Try again.", ToastAndroid.SHORT);
      isCapturingRef.current = false;
    }
  }, [photoOutput]);

  const handleRetake = useCallback(() => {
    previewPathRef.current = null;
    setPreviewUri(null);
    isCapturingRef.current = false;
  }, []);

  const handleConfirm = useCallback(async () => {
    const filePath = previewPathRef.current;
    if (!filePath || saving) return;
    if (!consented) {
      ToastAndroid.show(
        "Please agree to face recognition first.",
        ToastAndroid.SHORT,
      );
      return;
    }
    setSaving(true);
    try {
      const uri = "file://" + filePath;
      // 1. On-device embedding (works offline).
      const embedding = await getFaceEmbedding(uri);
      // 2. Cloudinary upload (returns null offline — enrollment still
      //    saved locally with the embedding and synced later).
      const cloudUrl = await uploadImageToCloudinary(uri, 2, "skinlens/faces");
      // 3. Save locally + queue server sync.
      await saveFaceIdentity({
        face_image_url: cloudUrl ?? uri,
        face_embedding: embeddingToJson(embedding),
      });
      previewPathRef.current = null;
      setPreviewUri(null);
      isCapturingRef.current = false;
      ToastAndroid.show("Face enrolled successfully!", ToastAndroid.SHORT);
      if (isReenroll) {
        router.back();
      } else {
        router.replace({
          pathname: "/(user-setup)/loading",
          params: {
            healthScore: healthScore ?? "0",
            answers: answers ?? "{}",
          },
        });
      }
    } catch (error) {
      console.error("Face enroll failed:", error);
      ToastAndroid.show(
        error instanceof Error ? error.message : "Enrollment failed. Try again.",
        ToastAndroid.LONG,
      );
    } finally {
      setSaving(false);
    }
  }, [answers, consented, healthScore, isReenroll, router, saving]);

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
  const hasFace = score > 0;
  const scoreColor = score > 80 ? "#22C55E" : score > 50 ? "#FBBF24" : "#EF4444";

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-black">
      <View className="flex-1">
        <Camera
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          device={device}
          isActive={!isPreview}
          performanceMode="fast"
          autoMode
          windowWidth={SCREEN_WIDTH}
          windowHeight={SCREEN_HEIGHT}
          onFacesDetected={handleFacesDetected}
          onError={(error) => console.error("Enroll camera error:", error)}
          outputs={outputs}
        />

        {isPreview && (
          <Image
            source={{ uri: previewUri }}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
            resizeMode="cover"
          />
        )}

        <View
          pointerEvents="none"
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 160, backgroundColor: "rgba(0,0,0,0.5)" }}
        />

        {/* Header card */}
        <View className="absolute top-0 left-0 right-0" style={{ paddingTop: 56 }}>
          <View className="px-5">
            {!isReenroll && (
              <Pressable onPress={() => router.back()} className="flex-row items-center gap-1 mb-2">
                <ChevronLeft size={20} color="#FFFFFF" />
                <Text className="text-white font-semibold text-base">Back</Text>
              </Pressable>
            )}
            <View className="bg-white rounded-2xl p-4 gap-1.5">
              <View className="flex-row items-center gap-2">
                <ScanFace size={20} color="#15803D" />
                <Text className="font-bold text-gray-900 text-lg">
                  {isReenroll ? "Update your face" : "Enroll your face"}
                </Text>
              </View>
              <Text className="text-sm text-gray-500">
                {isPreview
                  ? "Is your whole face clear in this photo?"
                  : "Look straight at the camera. This saves your face for future scan verification."}
              </Text>
            </View>
          </View>
        </View>

        {/* Face box */}
        {!isPreview && (
          <Animated.View
            pointerEvents="none"
            style={[{ position: "absolute", borderRadius: 16, borderWidth: 2.5, borderColor: scoreColor }, faceBorderStyle]}
          />
        )}

        {/* No-face guide */}
        {!isPreview && !hasFace && (
          <View pointerEvents="none" style={{ position: "absolute", inset: 0, alignItems: "center", justifyContent: "center" }}>
            <Animated.View style={guideStyle}>
              <View style={{ width: 200, height: 260, alignItems: "center", justifyContent: "center" }}>
                <View style={{ position: "absolute", width: 200, height: 260, borderRadius: 100, borderWidth: 2, borderColor: "rgba(255,255,255,0.35)", borderStyle: "dashed" }} />
                <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 13, fontWeight: "500", textAlign: "center" }}>
                  Position your face here
                </Text>
              </View>
            </Animated.View>
          </View>
        )}

        {/* Alignment status */}
        {!isPreview && hasFace && (
          <View pointerEvents="none" className="absolute self-center" style={{ bottom: 200 }}>
            <View className="px-4 py-2 rounded-full" style={{ backgroundColor: "rgba(0,0,0,0.45)" }}>
              <View className="flex-row items-center gap-1.5">
                <Scan size={14} color={scoreColor} />
                <Text className="text-sm font-semibold" style={{ color: scoreColor }}>
                  {score > 80 ? "Ready to capture" : guidance}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View pointerEvents="none" style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 230, backgroundColor: "rgba(0,0,0,0.6)" }} />

        {/* Bottom controls */}
        {!isPreview ? (
          <View className="absolute bottom-0 left-0 right-0 items-center justify-center gap-3" style={{ height: 200, paddingBottom: 20 }}>
            <Pressable
              onPress={handleCapture}
              disabled={!canCapture}
              style={{
                width: 72, height: 72, borderRadius: 36, borderWidth: 3,
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
            <Pressable onPress={() => setConsented((p) => !p)} className="flex-row items-center gap-2 px-4">
              <View className={`w-5 h-5 rounded border items-center justify-center ${consented ? "bg-green-600 border-green-600" : "bg-transparent border-white"}`}>
                {consented && <Check size={14} color="white" />}
              </View>
              <Text className="text-white/80 text-xs flex-1">
                I agree to store my face for scan verification
              </Text>
            </Pressable>
          </View>
        ) : (
          <View className="absolute bottom-0 left-0 right-0 gap-3 px-6" style={{ paddingBottom: 28 }}>
            <View className="flex-row items-center gap-2 bg-white/10 rounded-2xl px-4 py-3">
              <ShieldCheck size={18} color="white" />
              <Text className="text-white/80 text-xs flex-1">
                Your face stays on this device for matching; a copy is backed up to your account.
              </Text>
            </View>
            <View className="flex-row items-center justify-around">
              <Pressable
                onPress={handleRetake}
                disabled={saving}
                className="w-16 h-16 rounded-full items-center justify-center"
                style={{ borderWidth: 2, borderColor: "white", backgroundColor: "rgba(255,255,255,0.1)" }}
              >
                <RefreshCw size={26} color="white" />
              </Pressable>
              <Pressable
                onPress={handleConfirm}
                disabled={saving}
                className="flex-1 ml-4 rounded-full items-center justify-center py-4"
                style={{ backgroundColor: saving ? "rgba(21,128,61,0.5)" : "#15803D" }}
              >
                {saving ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="font-bold text-white">
                    {isReenroll ? "Save New Face" : "Confirm & Continue"}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
