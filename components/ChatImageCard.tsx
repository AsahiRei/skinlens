import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { ImageOff } from "lucide-react-native";

import type { ChatImage } from "@/types/chat";

/**
 * Single ingredient/product image card.
 * Remote hosts (Flickr, random CC uploads) die or hotlink-block often —
 * instead of rendering a blank box that looks like a broken link, fall
 * back to a titled placeholder that still opens the source page.
 */
export default function ChatImageCard({ image }: { image: ChatImage }) {
  const [failed, setFailed] = useState(false);

  return (
    <Pressable
      onPress={() => WebBrowser.openBrowserAsync(image.sourceUrl)}
      className="w-36 bg-gray-50 rounded-xl border border-gray-100 overflow-hidden active:opacity-80"
    >
      {failed ? (
        <View
          style={{ width: 144, height: 108 }}
          className="items-center justify-center bg-gray-100 flex-col gap-1"
        >
          <ImageOff size={20} color="#9CA3AF" />
          <Text className="text-[10px] text-gray-400 px-2 text-center">
            Preview unavailable
          </Text>
        </View>
      ) : (
        <Image
          source={{ uri: image.imageUrl }}
          style={{ width: 144, height: 108, backgroundColor: "#F3F4F6" }}
          resizeMode="cover"
          accessibilityLabel={image.title}
          onError={() => setFailed(true)}
        />
      )}
      <View className="px-2 py-1.5 flex-col gap-0.5">
        <Text
          className="text-[11px] font-bold text-gray-900"
          numberOfLines={1}
        >
          {image.title}
        </Text>
        <Text className="text-[10px] text-gray-500" numberOfLines={1}>
          {image.sourceName} • tap for source
        </Text>
      </View>
    </Pressable>
  );
}
