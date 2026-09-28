import { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { ShoppingBag } from "lucide-react-native";

import type { ProductWithImage } from "@/types/knowledge";

/**
 * Product card with an example photo. Photo failures fall back to an
 * icon tile so the card always renders.
 */
export default function ChatProductCard({
  product,
}: {
  product: ProductWithImage;
}) {
  const [imgOk, setImgOk] = useState(!!product.imageUrl);

  const body = (
    <>
      {imgOk && product.imageUrl ? (
        <Image
          source={{ uri: product.imageUrl }}
          style={{
            width: 56,
            height: 56,
            borderRadius: 10,
            backgroundColor: "#D1FAE5",
          }}
          resizeMode="cover"
          accessibilityLabel={product.product_type}
          onError={() => setImgOk(false)}
        />
      ) : (
        <View
          style={{ width: 56, height: 56, borderRadius: 10 }}
          className="items-center justify-center bg-green-100"
        >
          <ShoppingBag size={20} color="#15803D" />
        </View>
      )}
      <View className="flex-1 flex-col gap-0.5">
        <Text
          className="font-bold text-gray-900 text-[13px]"
          numberOfLines={1}
        >
          {product.product_type}
        </Text>
        <Text className="text-[11px] text-gray-500" numberOfLines={2}>
          With {product.recommended_ingredients.join(", ")}
        </Text>
        {product.imageSourceName ? (
          <Text className="text-[10px] text-gray-400" numberOfLines={1}>
            Photo: {product.imageSourceName}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (product.imageSourceUrl) {
    return (
      <Pressable
        onPress={() => WebBrowser.openBrowserAsync(product.imageSourceUrl!)}
        className="bg-green-50 rounded-xl border border-green-100 px-3 py-2.5 flex-row gap-2.5 items-center active:opacity-80"
      >
        {body}
      </Pressable>
    );
  }
  return (
    <View className="bg-green-50 rounded-xl border border-green-100 px-3 py-2.5 flex-row gap-2.5 items-center">
      {body}
    </View>
  );
}
