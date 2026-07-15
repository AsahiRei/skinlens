import { Stack } from "expo-router";
import "../global.css";

export default function _Layout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "ios_from_right",
      }}
    />
  );
}
