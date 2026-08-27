<<<<<<< HEAD
import React, { useCallback, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  Text,
  View,
=======
import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Dimensions,
  ActivityIndicator,
  Pressable,
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
} from "react-native";
import {
  useCameraDevice,
  useCameraPermission,
<<<<<<< HEAD
  usePhotoOutput,
} from "react-native-vision-camera";
import type { Photo } from "react-native-vision-camera";
import { Camera, Face } from "react-native-vision-camera-face-detector";
import { useRouter } from "expo-router";
import Ionicons from "@react-native-vector-icons/ionicons";

=======
} from "react-native-vision-camera";
import { Camera, Face } from "react-native-vision-camera-face-detector";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
import type { FaceBounds } from "@/types/schema";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

export default function FaceDetectionScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState<"front" | "back">(
    "front",
  );
  const device = useCameraDevice(cameraPosition);
<<<<<<< HEAD
  const photoOutput = usePhotoOutput({
    targetResolution: { width: 1920, height: 1080 },
    containerFormat: "jpeg",
    quality: 0.9,
    qualityPrioritization: "balanced",
  });
  const outputs = useMemo(() => [photoOutput], [photoOutput]);

  const [faceBox, setFaceBox] = useState<FaceBounds | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);

  const isCapturingRef = useRef(false);
  const photoRef = useRef<Photo | null>(null);
  const previewPathRef = useRef<string | null>(null);

  const handleFacesDetected = useCallback((faces: Face[]) => {
    if (isCapturingRef.current) return;
=======
  const [faceBox, setFaceBox] = useState<FaceBounds | null>(null);
  const handleFacesDetected = useCallback((faces: Face[]) => {
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
    if (faces.length > 0) {
      setFaceBox(faces[0].bounds);
    } else {
      setFaceBox(null);
    }
  }, []);

  const handleFlipCamera = useCallback(() => {
    setCameraPosition((prev) => (prev === "front" ? "back" : "front"));
    setFaceBox(null);
  }, []);

<<<<<<< HEAD
  const handleCapture = useCallback(async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    try {
      const photo = await photoOutput.capturePhoto({}, {});
      const filePath = await photo.saveToTemporaryFileAsync();
      photoRef.current = photo;
      previewPathRef.current = filePath;
      setPreviewUri("file://" + filePath);
    } catch (error) {
      console.error("Failed to capture photo:", error);
      isCapturingRef.current = false;
    }
  }, [photoOutput]);

  const handleRetake = useCallback(() => {
    if (photoRef.current) {
      photoRef.current.dispose();
      photoRef.current = null;
    }
    previewPathRef.current = null;
    setPreviewUri(null);
    isCapturingRef.current = false;
  }, []);

  const handleConfirm = useCallback(() => {
    const filePath = previewPathRef.current;
    if (!filePath) return;
    if (photoRef.current) {
      photoRef.current.dispose();
      photoRef.current = null;
    }
    previewPathRef.current = null;
    setPreviewUri(null);
    isCapturingRef.current = false;
    router.push({
      pathname: "/(modules)/analyzing",
      params: {
        imageUri: "file://" + filePath,
        sourceType: "camera",
      },
    });
  }, [router]);

  React.useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);

=======
  React.useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
  if (!hasPermission) {
    return (
      <View className="flex-1 items-center justify-center bg-black">
        <Text className="mt-3 text-base text-white">
          Camera permission required
        </Text>
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
<<<<<<< HEAD

  const isPreview = previewUri !== null;

=======
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
  return (
    <View className="flex-1 bg-black">
      <Camera
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        device={device}
<<<<<<< HEAD
        isActive={!isPreview}
=======
        isActive={true}
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
        performanceMode="fast"
        autoMode
        windowWidth={SCREEN_WIDTH}
        windowHeight={SCREEN_HEIGHT}
        onFacesDetected={handleFacesDetected}
        onError={(error) => console.error("Camera error:", error)}
<<<<<<< HEAD
        outputs={outputs}
      />

      {isPreview && (
        <Image
          source={{ uri: previewUri }}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          resizeMode="cover"
        />
      )}

      <View className="absolute top-0 left-0 right-0 bg-black py-4">
        <View className="mt-8 px-6 flex-row items-center justify-between">
          <Pressable
            onPress={isPreview ? handleRetake : () => router.back()}
            className="items-center flex-row gap-1"
          >
            <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
            <Text className="text-white font-semibold">
              {isPreview ? "Retake" : "Back"}
            </Text>
=======
      />
      <View className="absolute top-0 left-0 right-0 bg-black py-4">
        <View className="mt-8 px-6 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="items-center flex-row gap-1"
          >
            <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
            <Text className="text-white font-semibold">Back</Text>
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
          </Pressable>
          <Pressable className="w-6 h-6 bg-white rounded-full items-center justify-center">
            <Ionicons name="alert" size={16} />
          </Pressable>
        </View>
      </View>
<<<<<<< HEAD

      {!isPreview && faceBox && (
=======
      {faceBox && (
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
        <View
          pointerEvents="none"
          className="absolute rounded-xl border-[3px] border-[#00FF88]"
          style={{
            left: faceBox.x,
            top: faceBox.y,
            width: faceBox.width,
            height: faceBox.height,
          }}
        />
      )}
<<<<<<< HEAD

      {!isPreview && !faceBox && (
=======
      {!faceBox && (
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
        <View
          pointerEvents="none"
          className="absolute inset-0 items-center justify-center"
        >
          <View style={{ width: 200, height: 200 }}>
            <View
              className="absolute top-0 left-0 border-white"
              style={{
                width: 28,
                height: 28,
                borderTopWidth: 4,
                borderLeftWidth: 4,
              }}
            />
            <View
              className="absolute top-0 right-0 border-white"
              style={{
                width: 28,
                height: 28,
                borderTopWidth: 4,
                borderRightWidth: 4,
              }}
            />
            <View
              className="absolute bottom-0 left-0 border-white"
              style={{
                width: 28,
                height: 28,
                borderBottomWidth: 4,
                borderLeftWidth: 4,
              }}
            />
<<<<<<< HEAD
=======
            {/* bottom-right */}
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
            <View
              className="absolute bottom-0 right-0 border-white"
              style={{
                width: 28,
                height: 28,
                borderBottomWidth: 4,
                borderRightWidth: 4,
              }}
            />
<<<<<<< HEAD
=======
            {/* center dot */}
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
            <View
              className="absolute self-center top-0 bottom-0 justify-center items-center"
              style={{ width: 90 }}
            >
              <View className="w-2.5 h-2.5 rounded-full bg-white" />
            </View>
          </View>
        </View>
      )}
<<<<<<< HEAD

      {!isPreview && (
        <View
          pointerEvents="none"
          className="absolute self-center items-center"
          style={{ bottom: 145 }}
        >
          <View className="bg-black/50 px-3 py-1.5 rounded-full">
            <View className="bg-white/50 p-2 rounded-xl flex-row items-center gap-1">
              <Ionicons name="scan" size={16} color="white" />
              <Text className="font-semibold text-white">
                {faceBox ? "Face detected" : "Looking for face"}
              </Text>
            </View>
          </View>
        </View>
      )}

      {!isPreview ? (
        <View
          className="absolute bottom-0 left-0 right-0 bg-black flex-row items-center justify-center"
          style={{ height: 130 }}
        >
          <Pressable
            onPress={handleCapture}
            disabled={!faceBox}
            className={`w-20 h-20 rounded-full border-2 ${faceBox ? "border-white" : "border-gray-400"} items-center justify-center`}
          >
            <View
              className={`w-15 h-15 rounded-full ${faceBox ? "bg-white" : "bg-gray-400"} items-center justify-center`}
            >
              <Ionicons
                name="camera"
                size={28}
                color={faceBox ? "#15803D" : "#374151"}
              />
            </View>
          </Pressable>
          <Pressable
            onPress={handleFlipCamera}
            className="absolute right-8 w-12 h-12 rounded-full bg-black/40 items-center justify-center"
          >
            <Ionicons name="camera-reverse" size={34} color="#FFFFFF" />
          </Pressable>
        </View>
      ) : (
        <View
          className="absolute bottom-0 left-0 right-0 bg-black flex-row items-center justify-around"
          style={{ height: 130 }}
        >
          <Pressable
            onPress={handleRetake}
            className="w-20 h-20 rounded-full border-2 border-white items-center justify-center"
          >
            <Ionicons name="refresh" size={32} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={handleConfirm}
            className="w-20 h-20 rounded-full bg-[#15803D] items-center justify-center"
          >
            <Ionicons name="checkmark" size={32} color="#FFFFFF" />
          </Pressable>
        </View>
      )}
=======
      <View
        pointerEvents="none"
        className="absolute self-center items-center"
        style={{ bottom: 145 }}
      >
        <View className="bg-black/50 px-3 py-1.5 rounded-full">
          <View className="bg-white/50 p-2 rounded-xl flex-row items-center gap-1">
            <Ionicons name="scan" size={16} color="white" />
            <Text className="font-semibold text-white">
              {faceBox ? "Face detected" : "Looking for face"}
            </Text>
          </View>
        </View>
      </View>
      <View
        className="absolute bottom-0 left-0 right-0 bg-black flex-row items-center justify-center"
        style={{ height: 130 }}
      >
        <Pressable
          className={`w-20 h-20 rounded-full border-2 ${faceBox ? "border-white" : "border-gray-400"} items-center justify-center`}
        >
          <View
            className={`w-15 h-15 rounded-full ${faceBox ? "bg-white" : "bg-gray-400"} items-center justify-center`}
          >
            <Ionicons
              name="camera"
              size={28}
              color={faceBox ? "#15803D" : "#374151"}
            />
          </View>
        </Pressable>
        <Pressable
          onPress={handleFlipCamera}
          className="absolute right-8 w-12 h-12 rounded-full bg-black/40 items-center justify-center"
        >
          <Ionicons name="camera-reverse" size={34} color="#FFFFFF" />
        </Pressable>
      </View>
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38
    </View>
  );
}
