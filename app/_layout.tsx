import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { createSessionFromUrl, supabase } from "@/utils/supabase";
import * as Linking from "expo-linking";
import "../global.css";

export default function _Layout() {
  const router = useRouter();
  useEffect(() => {
    const sub = Linking.addEventListener("url", ({ url }) => {
      createSessionFromUrl(url).catch((err) => {
        console.warn("Failed to create session from URL:", err);
      });
    });
    Linking.getInitialURL().then((url) => {
      if (url) {
        createSessionFromUrl(url).catch((err) => {
          console.warn("Failed to create session from URL:", err);
        });
      }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.push("/create-new-password");
      }
    });
    return () => {
      sub.remove();
      authListener.subscription.unsubscribe();
    };
  }, []);
  return (
    <Stack
      screenOptions={{
        animation: "ios_from_right",
        headerShown: false,
      }}
    />
  );
}