import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, ToastAndroid, View } from "react-native";
import { Text } from "@/components/Text";
import { useCameraDevice, useCameraPermission, usePhotoOutput } from "react-native-vision-camera";
import type { Photo } from "react-native-vision-camera";
import { FaceCamera, type Face } from "@/components/FaceCamera";
import { useLocalSearchParams, useRouter } from "expo-router";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
} from "react-native-reanimated";
import { Camera as CameraIcon, RefreshCw, RotateCcw, Scan, ScanFace } from "lucide-react-native";

import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import { PrimaryButton } from "@/components/ui";
import { theme } from "@/lib/theme";
import { ReauthGate } from "@/components/ReauthGate";
import { getFaceIdentity, saveFaceIdentity } from "@/lib/db";
import { uploadImageToCloudinary } from "@/utils/cloudinary";
import { embeddingToJson, getVerificationEmbedding } from "@/utils/face-embeddings";
import { evaluateAlignment, getAlignmentGuidance } from "@/utils/face-quality";
import { cropToFace } from "@/utils/face-crop";
import { blocksCapture, measureImageLighting } from "@/utils/lighting";

// Module-level on purpose: usePhotoOutput memoizes on targetResolution by reference.
const PHOTO_TARGET_RESOLUTION = { width: 720, height: 1280 };

const CAMERA_STYLE = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const;

export default function FaceEnroll() {
  const router = useRouter();
  const { healthScore, answers, mode, skipIntro } = useLocalSearchParams<{
    healthScore?: string;
    answers?: string;
    mode?: string;
    skipIntro?: string;
  }>();
  const isReenroll = mode === "reenroll";

  // Replacing an existing face requires re-authentication, whichever way this screen was reached
  // (profile, edit profile, face mismatch, or a deep link without mode=reenroll). First-time
  // enrollment during setup has no stored face, so it skips the gate.
  const [needsReauth, setNeedsReauth] = useState<boolean | null>(isReenroll ? true : null);
  const [reauthed, setReauthed] = useState(false);
  useEffect(() => {
    if (isReenroll) return;
    let cancelled = false;
    getFaceIdentity()
      .then((identity) => !cancelled && setNeedsReauth(!!identity?.face_embedding))
      .catch(() => !cancelled && setNeedsReauth(false));
    return () => {
      cancelled = true;
    };
  }, [isReenroll]);
  const gateOpen = needsReauth === false || reauthed;

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
  const [score, setScore] = useState(0);
  const [guidance, setGuidance] = useState("");
  const [canCapture, setCanCapture] = useState(false);
  const [saving, setSaving] = useState(false);
  // Camera opens only after the photo ask. Setup passes skipIntro=1,
  // otherwise the intro below shows first.
  const [started, setStarted] = useState(skipIntro === "1");

  const isCapturingRef = useRef(false);
  const previewPathRef = useRef<string | null>(null);
  // Same as camera.tsx — log camera errors once so LogBox never blocks the UI.
  const cameraErrorLoggedRef = useRef(false);
  const canCaptureRef = useRef(false);
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
    if (!started || hasPermission) return;
    requestPermission().catch(() => {
      // Denial is handled by the fallback UI — no unhandled rejection.
    });
  }, [started, hasPermission, requestPermission]);

  const handleStart = useCallback(async () => {
    try {
      if (!hasPermission) {
        await requestPermission();
      }
    } catch {
      // Fallback UI below covers the denied case.
    } finally {
      setStarted(true);
    }
  }, [hasPermission, requestPermission]);

  const handleFacesDetected = useCallback(
    (faces: Face[]) => {
      if (isCapturingRef.current) return;

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
        const ready = alignment.score >= 50 && alignment.isFacingFront;
        // Bucket the float score so React bails out of re-rendering when
        // nothing visible changed (only the 50/80 color bands matter).
        const banded = Math.max(1, Math.round(alignment.score / 5) * 5);
        scoreRef.current = banded;
        canCaptureRef.current = ready;
        setScore(banded);
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

  const handleCameraError = useCallback((error: Error) => {
    if (!cameraErrorLoggedRef.current) {
      cameraErrorLoggedRef.current = true;
      console.log("Enroll camera error:", error);
    }
  }, []);

  const handleFlipCamera = useCallback(() => {
    if (isCapturingRef.current) return;
    setCameraPosition((prev) => (prev === "front" ? "back" : "front"));
    // Clear the old camera's face state so the box/score don't linger.
    // eslint-disable-next-line react-hooks/immutability
    faceVisible.value = 0;
    scoreRef.current = 0;
    canCaptureRef.current = false;
    setScore(0);
    setGuidance("");
    setCanCapture(false);
  }, [faceVisible]);

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
    if (!filePath || saving || !gateOpen) return;
    setSaving(true);
    try {
      const uri = "file://" + filePath;
      // Same face-only crop the scan check compares against: a center-crop fallback here would
      // enroll an embedding that never matches at verification time.
      const embedding = await getVerificationEmbedding(uri);
      if (!embedding) {
        throw new Error("We couldn't find your face in that photo. Please retake it.");
      }
      // First-time setup also grades this photo for the starting score, so it gets the same
      // input checks as a scan: crop to the face, then refuse a near-black or blown-out frame
      // (garbage in would mean a garbage baseline).
      let gradingUri: string | null = null;
      if (!isReenroll) {
        const crop = await cropToFace(uri);
        const lighting = await measureImageLighting(crop.uri);
        if (lighting && blocksCapture(lighting.quality)) {
          throw new Error(`${lighting.message}, then retake the photo.`);
        }
        gradingUri = crop.cropped ? crop.uri : null;
      }
      const cloudUrl = await uploadImageToCloudinary(uri, 2, "skinlens/faces");
      await saveFaceIdentity({
        face_image_url: cloudUrl ?? uri,
        face_embedding: embeddingToJson(embedding),
      });
      previewPathRef.current = null;
      setPreviewUri(null);
      isCapturingRef.current = false;
      ToastAndroid.show(
        isReenroll ? "Profile picture updated" : "Skin scan saved",
        ToastAndroid.SHORT,
      );
      if (isReenroll) {
        router.back();
      } else if (!answers) {
        // Setup order: skin scan first, then the questionnaire. The graded crop rides along
        // to setup, which hands it to loading with the answers.
        router.replace({
          pathname: "/(user-setup)/setup",
          params: gradingUri ? { photoUri: gradingUri } : {},
        });
      } else {
        // Answers already collected (loading bounced back here because no face was saved).
        router.replace({
          pathname: "/(user-setup)/loading",
          params: {
            healthScore: healthScore ?? "0",
            answers: answers ?? "{}",
            // Only a real face crop is graded; without one the baseline stays answers-only.
            ...(gradingUri ? { photoUri: gradingUri } : {}),
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
  }, [answers, gateOpen, healthScore, isReenroll, router, saving]);

  if (needsReauth === null) {
    return (
      <View
        className="flex-1 items-center justify-center"
        style={{ backgroundColor: theme.colors.background }}
      >
        <ActivityIndicator color={theme.colors.primary} />
      </View>
    );
  }

  if (!gateOpen) {
    return (
      <ReauthGate
        title="Confirm it's you"
        message="Your face is used to verify that scans on this account are yours. Confirm your identity before replacing it."
        onVerified={() => setReauthed(true)}
        onCancel={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/profile"))}
      />
    );
  }

  const title = isReenroll ? "Update your profile picture" : "Scan your skin";

  // Simple intro — title, one line, button.
  if (!started) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <View className="flex-1 px-5 pt-8 pb-6">
          <Text className="font-bold text-[22px]" style={{ color: theme.colors.ink }}>
            {title}
          </Text>
          <Text className="text-sm leading-5 mt-2" style={{ color: theme.colors.muted }}>
            {isReenroll
              ? "You'll take one photo on the next screen."
              : "One photo of your face shows how your skin looks today. It's also your profile picture."}
          </Text>

          <View className="flex-1" />

          <PrimaryButton
            label={isReenroll ? "Take New Picture" : "Start Skin Scan"}
            onPress={handleStart}
          />
        </View>
      </SafeAreaView>
    );
  }

  if (!hasPermission) {
    return (
      <SafeAreaView className="flex-1 items-center justify-center bg-black px-6">
        <Text className="mt-3 text-base text-white text-center">Camera permission required</Text>
        <Text className="mt-1 text-sm text-center text-white/70">
          {isReenroll
            ? "We need camera access to take your profile picture."
            : "We need camera access to scan your skin."}
        </Text>
        <View className="mt-4 w-full">
          <PrimaryButton label="Allow Camera" onPress={handleStart} />
        </View>
      </SafeAreaView>
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
        <FaceCamera
          style={CAMERA_STYLE}
          device={device}
          cameraFacing={cameraPosition}
          isActive={!isPreview}
          performanceMode="fast"
          minFaceSize={0.2}
          onFacesDetected={handleFacesDetected}
          onError={handleCameraError}
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
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 160,
            backgroundColor: "rgba(0,0,0,0.5)",
          }}
        />

        {/* Header card */}
        <View className="absolute top-0 left-0 right-0" style={{ paddingTop: 56 }}>
          <View className="px-5">
            <View className="bg-white rounded-2xl p-4 gap-1.5">
              <View className="flex-row items-center gap-2">
                <ScanFace size={20} color={theme.colors.primary} />
                <Text className="font-bold text-gray-900 text-lg">{title}</Text>
              </View>
              <Text className="text-sm text-gray-500">
                {isPreview
                  ? "Use this photo?"
                  : isReenroll
                    ? "Look straight at the camera and fill the frame."
                    : "Face the camera in good light, no makeup or filters, and fill the frame."}
              </Text>
            </View>
          </View>
        </View>

        {/* Face box */}
        {!isPreview && (
          <Animated.View
            pointerEvents="none"
            style={[
              { position: "absolute", borderRadius: 16, borderWidth: 2.5, borderColor: scoreColor },
              faceBorderStyle,
            ]}
          />
        )}

        {/* No-face guide */}
        {!isPreview && !hasFace && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Animated.View style={guideStyle}>
              <View
                style={{ width: 200, height: 260, alignItems: "center", justifyContent: "center" }}
              >
                <View
                  style={{
                    position: "absolute",
                    width: 200,
                    height: 260,
                    borderRadius: 100,
                    borderWidth: 2,
                    borderColor: "rgba(255,255,255,0.35)",
                    borderStyle: "dashed",
                  }}
                />
                <Text
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 13,
                    fontWeight: "500",
                    textAlign: "center",
                  }}
                >
                  Center your face here{"\n"}Move closer so it fills the frame
                </Text>
              </View>
            </Animated.View>
          </View>
        )}

        {/* Alignment status */}
        {!isPreview && hasFace && (
          <View pointerEvents="none" className="absolute self-center" style={{ bottom: 200 }}>
            <View
              className="px-4 py-2 rounded-full"
              style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
            >
              <View className="flex-row items-center gap-1.5">
                <Scan size={14} color={scoreColor} />
                <Text className="text-sm font-semibold" style={{ color: scoreColor }}>
                  {score > 80 ? "Ready to capture" : guidance}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 230,
            backgroundColor: "rgba(0,0,0,0.6)",
          }}
        />

        {/* Bottom controls */}
        {!isPreview ? (
          <View
            className="absolute bottom-0 left-0 right-0 items-center justify-center gap-3"
            style={{ height: 200, paddingBottom: 20 }}
          >
            <Pressable
              onPress={handleCapture}
              disabled={!canCapture}
              accessibilityRole="button"
              accessibilityLabel={isReenroll ? "Take profile picture" : "Take skin scan photo"}
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                borderWidth: 3,
                borderColor: canCapture ? "white" : "rgba(255,255,255,0.3)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 29,
                  backgroundColor: canCapture ? "white" : "rgba(255,255,255,0.15)",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CameraIcon
                  size={26}
                  color={canCapture ? theme.colors.primary : "rgba(255,255,255,0.4)"}
                />
              </View>
            </Pressable>
            <Pressable
              onPress={handleFlipCamera}
              accessibilityRole="button"
              accessibilityLabel={
                cameraPosition === "front" ? "Switch to back camera" : "Switch to front camera"
              }
              className="absolute right-6 w-11 h-11 rounded-full items-center justify-center"
              style={{ top: (200 - 20) / 2 - 22, backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              <RotateCcw size={22} color="white" />
            </Pressable>
          </View>
        ) : (
          <View
            className="absolute bottom-0 left-0 right-0 gap-3 px-6"
            style={{ paddingBottom: 28 }}
          >
            <View className="flex-row items-center justify-around">
              <Pressable
                onPress={handleRetake}
                disabled={saving}
                className="w-16 h-16 rounded-full items-center justify-center"
                style={{
                  borderWidth: 2,
                  borderColor: "white",
                  backgroundColor: "rgba(255,255,255,0.1)",
                }}
              >
                <RefreshCw size={26} color="white" />
              </Pressable>
              <View className="flex-1 ml-4">
                <PrimaryButton
                  label={isReenroll ? "Save picture" : "Use photo"}
                  onPress={handleConfirm}
                  loading={saving}
                  disabled={saving}
                />
              </View>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
