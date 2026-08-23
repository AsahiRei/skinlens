import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  Dimensions,
  ActivityIndicator,
  Pressable,
} from "react-native";
import {
  useCameraDevice,
  useCameraPermission,
} from "react-native-vision-camera";
import { Camera, Face } from "react-native-vision-camera-face-detector";
import Ionicons from "@react-native-vector-icons/ionicons";
import { useRouter } from "expo-router";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type FaceBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export default function FaceDetectionScreen() {
  const router = useRouter();
  const { hasPermission, requestPermission } = useCameraPermission();
  const [cameraPosition, setCameraPosition] = useState<"front" | "back">("front");
  const device = useCameraDevice(cameraPosition);
  const [faceBox, setFaceBox] = useState<FaceBounds | null>(null);
  const handleFacesDetected = useCallback((faces: Face[]) => {
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

  React.useEffect(() => {
    if (!hasPermission) requestPermission();
  }, [hasPermission]);
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
  return (
    <View className="flex-1 bg-black">
      <Camera
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
        device={device}
        isActive={true}
        performanceMode="fast"
        autoMode
        windowWidth={SCREEN_WIDTH}
        windowHeight={SCREEN_HEIGHT}
        onFacesDetected={handleFacesDetected}
        onError={(error) => console.error("Camera error:", error)}
      />
      <View className="absolute top-0 left-0 right-0 bg-black py-4">
        <View className="mt-8 px-6 flex-row items-center justify-between">
          <Pressable
            onPress={() => router.back()}
            className="items-center flex-row gap-1"
          >
            <Ionicons name="chevron-back" size={18} color="#FFFFFF" />
            <Text className="text-white font-semibold">Back</Text>
          </Pressable>
          <Pressable className="w-6 h-6 bg-white rounded-full items-center justify-center">
            <Ionicons name="alert" size={16} />
          </Pressable>
        </View>
      </View>
      {faceBox && (
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
      {!faceBox && (
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
            {/* bottom-right */}
            <View
              className="absolute bottom-0 right-0 border-white"
              style={{
                width: 28,
                height: 28,
                borderBottomWidth: 4,
                borderRightWidth: 4,
              }}
            />
            {/* center dot */}
            <View
              className="absolute self-center top-0 bottom-0 justify-center items-center"
              style={{ width: 90 }}
            >
              <View className="w-2.5 h-2.5 rounded-full bg-white" />
            </View>
          </View>
        </View>
      )}
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
    </View>
  );
}