import { View, Text } from "react-native";

export function Cell({
  label,
  value,
  color,
  fullWidth = false,
}: {
  label: string;
  value: string;
  color: string;
  fullWidth?: boolean;
}) {
  return (
    <View
      className={`${fullWidth ? "w-full" : "flex-1"} px-5 py-4`}
      style={fullWidth ? {} : {}}
    >
      <View className="flex-row items-center gap-2 mb-1">
        <View
          className="w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <Text className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
          {label}
        </Text>
      </View>
      <Text className="text-base font-bold text-gray-900">{value}</Text>
    </View>
  );
}