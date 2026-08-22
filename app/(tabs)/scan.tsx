import { useState } from "react";
import { View, Text, Image, Pressable } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { classifyImage, ClassificationResult } from "@/utils/skin-prediction";

export default function ResultScreen() {
  const [imageUri, setImageUri] = useState<string | null>(null);

  const [result, setResult] = useState<ClassificationResult | null>(null);

  const [loading, setLoading] = useState(false);

  // Pick image from gallery
  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      console.log("Gallery permission denied");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });

    if (!result.canceled) {
      const uri = result.assets[0].uri;

      setImageUri(uri);
      setResult(null);

      console.log("Selected image:", uri);
    }
  };

  // Classify selected image
  const handleClassify = async () => {
    if (!imageUri) {
      console.log("Please select an image first");
      return;
    }

    try {
      setLoading(true);

      const prediction = await classifyImage(imageUri);

      setResult(prediction);

      console.log("Prediction:", prediction);
    } catch (error) {
      console.error("Classification failed:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      {/* Image */}
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{
            width: 300,
            height: 300,
          }}
        />
      ) : (
        <View
          style={{
            width: 300,
            height: 300,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text>No image selected</Text>
        </View>
      )}

      {/* Import Image */}
      <Pressable onPress={pickImage}>
        <Text>Import Image</Text>
      </Pressable>

      {/* Analyze */}
      <Pressable onPress={handleClassify} disabled={!imageUri || loading}>
        <Text>{loading ? "Analyzing..." : "Analyze Skin"}</Text>
      </Pressable>

      {/* Result */}
      {result && (
        <View>
          <Text>Condition: {result.label}</Text>

          <Text>Confidence: {(result.confidence * 100).toFixed(2)}%</Text>

          <Text>Acne: {(result.probabilities.acne * 100).toFixed(2)}%</Text>

          <Text>Eczema: {(result.probabilities.eczema * 100).toFixed(2)}%</Text>

          <Text>Normal: {(result.probabilities.normal * 100).toFixed(2)}%</Text>
        </View>
      )}
    </View>
  );
}
