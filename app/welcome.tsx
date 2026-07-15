import { View, Text, Pressable, Image, ToastAndroid } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { supabase } from "@/utils/supabase";

WebBrowser.maybeCompleteAuthSession();

const REDIRECT_URL = Linking.createURL("/");

export default function Welcome() {
  const router = useRouter();
  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      const parsed = new URL(url);
      if (parsed.pathname !== "/" ) return;
      const code = parsed.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          return;
        }
        router.replace("/");
      }
    };
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink(url);
    });
    const subscription = Linking.addEventListener("url", ({ url }) =>
      handleDeepLink(url),
    );
    return () => subscription.remove();
  }, []);
  const googleSignIn = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: REDIRECT_URL,
        skipBrowserRedirect: true,
      },
    });
    if (error) {
      return;
    }
    const result = await WebBrowser.openAuthSessionAsync(
      data.url!,
      REDIRECT_URL,
    );
    if (result.type === "success") {
      const parsed = new URL(result.url);
      const code = parsed.searchParams.get("code");
      if (code) {
        const { error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(code);
        if (exchangeError) {
          return;
        }
        router.replace("/");
      }
    }
  };
  return (
    <SafeAreaView className="bg-white flex-1">
      <View className="flex-1 justify-center items-center px-4 gap-12">
        <View className="flex-col gap-2">
          <Text className="text-5xl font-semibold text-green-700 text-center">
            SkinLens
          </Text>
          <Text className="text-gray-500 text-lg text-center">
            An AI-powered skin analysis tool and personalized skin care
            assistant
          </Text>
        </View>
        <View className="flex-col gap-4 w-full">
          <Pressable
            className="bg-green-700 active:opacity-80 py-3 rounded-full w-full"
            onPress={() => router.push("/login")}
          >
            <View className="flex-row gap-2 items-center justify-center">
              <Ionicons name="mail" size={24} color="white" />
              <Text className="font-semibold text-white">
                Continue with Email
              </Text>
            </View>
          </Pressable>
          <View className="flex-row items-center gap-2">
            <View className="flex-1 border-t border-gray-300" />
            <Text className="text-gray-400">or continue with</Text>
            <View className="flex-1 border-t border-gray-300" />
          </View>
          <Pressable
            className="border py-3 w-full border-gray-400 rounded-full active:opacity-80"
            onPress={googleSignIn}
          >
            <View className="flex-row gap-2 items-center justify-center">
              <Image
                source={require("@/assets/images/icons/1.png")}
                className="w-6 h-6"
              />
              <Text className="font-semibold text-gray-600">
                Continue with Google
              </Text>
            </View>
          </Pressable>
        </View>
      </View>
      <View className="px-4 mb-6 flex items-center justify-center">
        <View className="flex-row gap-1">
          <Text>Don{`'`}t have an account?</Text>
          <Pressable
            className="active:opacity-80"
            onPress={() => router.push("/register")}
          >
            <Text className="text-green-700">Create new account</Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}
