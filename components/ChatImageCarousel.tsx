import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { ImageOff } from "lucide-react-native";
import PagerView from "react-native-pager-view";

import type { ChatImage } from "@/types/chat";

/**
 * Swipeable image carousel. Built on react-native-pager-view (native
 * paging) instead of a nested horizontal ScrollView, so horizontal swipes
 * never trap the outer chat scroll on Android.
 */
export default function ChatImageCarousel({
  images,
}: {
  images: ChatImage[];
}) {
  const [page, setPage] = useState(0);
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  if (images.length === 1) {
    const img = images[0];
    return (
      <Pressable
        onPress={() => WebBrowser.openBrowserAsync(img.sourceUrl)}
        className="mt-1 rounded-xl border border-gray-100 overflow-hidden bg-gray-50 active:opacity-80"
      >
        {!failed[img.id] ? (
          <Image
            source={{ uri: img.imageUrl }}
            style={{ width: "100%", height: 190, backgroundColor: "#F3F4F6" }}
            resizeMode="cover"
            accessibilityLabel={img.title}
            onError={() => setFailed((p) => ({ ...p, [img.id]: true }))}
          />
        ) : (
          <View
            style={{ width: "100%", height: 120 }}
            className="items-center justify-center bg-gray-100 flex-col gap-1"
          >
            <ImageOff size={20} color="#9CA3AF" />
            <Text className="text-[10px] text-gray-400">
              Preview unavailable
            </Text>
          </View>
        )}
        <View className="px-2.5 py-1.5">
          <Text className="text-[11px] font-bold text-gray-900" numberOfLines={1}>
            {img.title}
          </Text>
          <Text className="text-[10px] text-gray-500" numberOfLines={1}>
            {img.sourceName} • tap for source
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <View className="mt-1 flex-col gap-1.5">
      <PagerView
        style={{ width: "100%", height: 240 }}
        initialPage={0}
        onPageSelected={(e) => setPage(e.nativeEvent.position)}
      >
        {images.map((img) => (
          <View key={img.id} collapsable={false} style={{ paddingHorizontal: 1 }}>
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync(img.sourceUrl)}
              className="flex-1 rounded-xl border border-gray-100 overflow-hidden bg-gray-50 active:opacity-80"
            >
              {!failed[img.id] ? (
                <Image
                  source={{ uri: img.imageUrl }}
                  style={{ width: "100%", height: 190, backgroundColor: "#F3F4F6" }}
                  resizeMode="cover"
                  accessibilityLabel={img.title}
                  onError={() => setFailed((p) => ({ ...p, [img.id]: true }))}
                />
              ) : (
                <View
                  style={{ width: "100%", height: 190 }}
                  className="items-center justify-center bg-gray-100 flex-col gap-1"
                >
                  <ImageOff size={22} color="#9CA3AF" />
                  <Text className="text-[10px] text-gray-400">
                    Preview unavailable
                  </Text>
                </View>
              )}
              <View className="px-2.5 py-1.5 flex-row items-center gap-2">
                <View className="flex-1">
                  <Text
                    className="text-[11px] font-bold text-gray-900"
                    numberOfLines={1}
                  >
                    {img.title}
                  </Text>
                  <Text className="text-[10px] text-gray-500" numberOfLines={1}>
                    {img.sourceName} • tap for source
                  </Text>
                </View>
                <Text className="text-[10px] font-bold text-green-700">
                  {images.indexOf(img) + 1}/{images.length}
                </Text>
              </View>
            </Pressable>
          </View>
        ))}
      </PagerView>
      <View
        style={{ flexDirection: "row", justifyContent: "center", gap: 6 }}
      >
        {images.map((img, i) => (
          <View
            key={img.id}
            style={{
              width: i === page ? 18 : 6,
              height: 6,
              borderRadius: 3,
              backgroundColor: i === page ? "#15803D" : "#D1D5DB",
            }}
          />
        ))}
      </View>
    </View>
  );
}
