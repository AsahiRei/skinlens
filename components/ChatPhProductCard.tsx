import { Pressable, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { ShoppingBag } from "lucide-react-native";

import { Text } from "@/components/Text";
import { theme } from "@/lib/theme";
import type { PhProduct } from "@/types/knowledge";
import { shopLinksFor } from "@/utils/ph-products";

/**
 * A sample product sold in the Philippines: brand, name, the ingredient
 * that matched the suggestion, approximate price, and store search links.
 */
export default function ChatPhProductCard({ product }: { product: PhProduct }) {
  const highlighted = product.matched?.length ? product.matched : product.key_ingredients;
  return (
    <View
      className="rounded-xl px-3 py-2.5 flex-col gap-2"
      style={{
        backgroundColor: theme.colors.primarySoft,
        borderWidth: 1,
        borderColor: theme.colors.cardBorder,
      }}
      accessible
      accessibilityLabel={`${product.brand} ${product.name}, ${product.product_type}, about ${product.price}`}
    >
      <View className="flex-row gap-2.5 items-start">
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 10,
            backgroundColor: theme.colors.primaryTint,
          }}
          className="items-center justify-center"
        >
          <ShoppingBag size={18} color={theme.colors.primary} />
        </View>
        <View className="flex-1 min-w-0">
          <Text
            className="text-[11px] font-bold uppercase"
            style={{ color: theme.colors.primary }}
            numberOfLines={1}
          >
            {product.brand}
          </Text>
          <Text
            className="text-[13px] font-bold"
            style={{ color: theme.colors.ink }}
            numberOfLines={2}
          >
            {product.name}
          </Text>
          <Text className="text-[11px]" style={{ color: theme.colors.muted }} numberOfLines={1}>
            {product.product_type}
            {product.size ? ` • ${product.size}` : ""} • approx. {product.price}
          </Text>
        </View>
      </View>

      {product.caution && (
        <Text className="text-[11px] leading-4" style={{ color: theme.colors.warningText }}>
          {product.caution}
        </Text>
      )}

      <View className="flex-row flex-wrap gap-1">
        {highlighted.map((ing) => (
          <View key={ing} className="rounded-full px-2 py-0.5 bg-white">
            <Text className="text-[10px] font-medium" style={{ color: theme.colors.primaryDeep }}>
              {ing}
            </Text>
          </View>
        ))}
      </View>

      <View className="flex-row gap-1.5">
        {shopLinksFor(product).map((link) => (
          <Pressable
            key={link.label}
            onPress={() => WebBrowser.openBrowserAsync(link.url)}
            className="flex-1 items-center rounded-lg py-1.5 bg-white active:opacity-70"
            style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
            accessibilityRole="link"
            accessibilityLabel={`Search ${product.brand} ${product.name} on ${link.label}`}
          >
            <Text className="text-[11px] font-semibold" style={{ color: theme.colors.primary }}>
              {link.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
