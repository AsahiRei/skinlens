import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { supabase } from "@/utils/supabase";

type LogoutModalProps = {
  isVisible: boolean;
  setVisible: (v: boolean) => void;
};

export default function LogoutModal({
  isVisible,
  setVisible,
}: LogoutModalProps) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const logout = async () => {
    setLoading(true)
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error.message;
      router.replace("/welcome")
    } catch (err) {
      console.log(err);
    } finally {
      setLoading(false);
    }
  };
  return (
    <Modal visible={isVisible} transparent animationType="fade">
      <View className="flex-1 items-center justify-center bg-[rgba(0,0,0,0.5)] px-6">
        <View className="p-4 py-6 bg-white rounded-4xl w-full">
          <Text className="text-center text-xl font-bold text-green-700">
            Logout Confirmation
          </Text>
          <Text className="text-center mt-2 text-gray-600">
            Are you sure you want to logout?
          </Text>
          <Pressable
            className={`rounded-full ${loading ? "bg-gray-500" : "bg-red-500"} active:opacity-80 py-3 mt-4`}
            onPress={logout}
            disabled={loading}
          >
            <View className="flex-row items-center justify-center">
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text className="font-bold text-white">Confirm</Text>
              )}
            </View>
          </Pressable>
          <Pressable
            className="bg-white border border-green-700 py-3 mt-2 rounded-full active:opacity-80"
            onPress={() => setVisible(false)}
          >
            <Text className="text-center font-bold text-green-700">Cancel</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
