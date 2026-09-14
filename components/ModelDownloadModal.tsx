import { useEffect, useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { AlertCircle, Download } from "lucide-react-native";

import InlineProgress from "@/components/InlineProgress";
import {
  downloadModelWithNotifications,
  getModelPath,
  getSelectedModel,
} from "@/utils/llama";

type ModelDownloadModalProps = {
  visible: boolean;
  onComplete: () => void;
  onCancel: () => void;
};

export default function ModelDownloadModal({
  visible,
  onComplete,
  onCancel,
}: ModelDownloadModalProps) {
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<"downloading" | "error">("downloading");
  const [errorMessage, setErrorMessage] = useState("");
  const [modelLabel, setModelLabel] = useState("");

  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    (async () => {
      setProgress(0);
      setStatus("downloading");
      setErrorMessage("");

      try {
        const model = await getSelectedModel();
        if (!cancelled) setModelLabel(model.label);

        await getModelPath((fraction) => {
          if (!cancelled) setProgress(Math.round(fraction * 100));
        });
        if (!cancelled) onComplete();
      } catch (err) {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage(
            err instanceof Error
              ? err.message
              : "Download failed. Please try again.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  const handleRetry = () => {
    setStatus("downloading");
    setProgress(0);
    setErrorMessage("");

    (async () => {
      try {
        await getModelPath((fraction) => {
          setProgress(Math.round(fraction * 100));
        });
        onComplete();
      } catch (err) {
        setStatus("error");
        setErrorMessage(
          err instanceof Error
            ? err.message
            : "Download failed. Please try again.",
        );
      }
    })();
  };

  const handleDownloadInBackground = () => {
    downloadModelWithNotifications();
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View className="flex-1 items-center justify-center bg-[rgba(0,0,0,0.5)] px-6">
        <View className="p-6 bg-white rounded-4xl w-full items-center gap-4">
          <View className="h-14 w-14 rounded-full bg-green-100 items-center justify-center">
            <Download size={28} color="#15803D" />
          </View>
          <Text className="text-center text-xl font-bold text-green-700">
            Downloading AI Model
          </Text>
          <Text className="text-center text-gray-500 text-sm">
            {modelLabel
              ? `${modelLabel} is required for skin analysis. This may take a few minutes on first download.`
              : "The AI model is required for skin analysis. This may take a few minutes on first download."}
          </Text>

          {status === "downloading" ? (
            <View className="w-full gap-2">
              <InlineProgress
                progress={progress}
                height={8}
                color="#15803D"
              />
              <Text className="text-center text-sm font-medium text-gray-600">
                {progress}%
              </Text>
            </View>
          ) : (
            <View className="w-full items-center gap-2">
              <View className="flex-row items-center gap-2">
                <AlertCircle size={18} color="#B91C1C" />
                <Text className="text-sm text-red-600">{errorMessage}</Text>
              </View>
            </View>
          )}

          {status === "error" && (
            <Pressable
              className="rounded-full bg-green-700 active:opacity-80 py-3 w-full"
              onPress={handleRetry}
            >
              <Text className="font-bold text-white text-center">Retry</Text>
            </Pressable>
          )}
          <Pressable
            className="bg-white border border-gray-300 py-3 rounded-full active:opacity-80 w-full"
            onPress={handleDownloadInBackground}
          >
            <Text className="text-center font-bold text-gray-600">
              Download in Background
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
