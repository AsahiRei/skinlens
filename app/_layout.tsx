import { Stack, useRouter } from "expo-router";
import { useEffect } from "react";
import { supabase } from "@/utils/supabase";
import * as Linking from "expo-linking";
import * as QueryParams from "expo-auth-session/build/QueryParams";
import "../global.css";

const createSessionFromUrl = async (url: string) => {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) throw new Error(errorCode);
  const { access_token, refresh_token } = params;
  if (!access_token) return;
  const { data, error } = await supabase.auth.setSession({
    access_token,
    refresh_token,
  });
  if (error) throw error;
  return data.session;
};

export default function _Layout() {
  const router = useRouter();
  useEffect(() => {
    // app already open, link tapped
    const sub = Linking.addEventListener("url", ({ url }) => {
      createSessionFromUrl(url);
    });
    // app was closed, opened cold via link
    Linking.getInitialURL().then((url) => {
      if (url) createSessionFromUrl(url);
    });
    // fires once setSession completes with a recovery session
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
