import { useState } from "react";
import { Image, Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import * as WebBrowser from "expo-web-browser";
import { ShoppingBag, ExternalLink } from "lucide-react-native";

import type { ProductWithImage } from "@/types/knowledge";

/** Unified product type that works for both local knowledge base and web search results */
export type UnifiedProductCard = ProductWithImage & {
  sourceUrl?: string; // Direct product page URL (from web search)
  retailer?: string; // Retailer name (Lazada, Shopee, Watsons, etc.)
  price?: string; // Price if available
};

/**
 * Product card with an example photo. Photo failures fall back to an icon tile so the card always
 * renders.
 */
export default function ChatProductCard({ product }: { product: UnifiedProductCard }) {
  const [imgOk, setImgOk] = useState(!!product.imageUrl);

  // Determine the best URL to open on press: product page > image source > none
  const pressUrl = product.sourceUrl ?? product.imageSourceUrl;

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
          <ShoppingBag size={20} color="#214E36" />
        </View>
      )}
      <View className="flex-1 flex-col gap-0.5 min-w-0">
        <Text className="font-bold text-gray-900 text-[13px]" numberOfLines={1}>
          {product.product_type}
        </Text>
        <Text className="text-[11px] text-gray-500" numberOfLines={2}>
          With {product.recommended_ingredients.join(", ")}
        </Text>
        {product.retailer && (
          <Text className="text-[10px] text-blue-600 font-medium" numberOfLines={1}>
            {product.retailer} {product.price ? `• ${product.price}` : ""}
          </Text>
        )}
        {!product.retailer && product.imageSourceName ? (
          <Text className="text-[10px] text-gray-500" numberOfLines={1}>
            Photo: {product.imageSourceName}
          </Text>
        ) : null}
      </View>
    </>
  );

  if (pressUrl) {
    return (
      <Pressable
        onPress={() => WebBrowser.openBrowserAsync(pressUrl)}
        className="bg-green-50 rounded-xl border border-green-100 px-3 py-2.5 flex-row gap-2.5 items-center active:opacity-80"
        accessibilityLabel={`View ${product.product_type} on ${product.retailer || "website"}`}
      >
        {body}
        <ExternalLink size={14} color="#214E36" />
      </Pressable>
    );
  }
  return (
    <View className="bg-green-50 rounded-xl border border-green-100 px-3 py-2.5 flex-row gap-2.5 items-center">
      {body}
    </View>
  );
}
