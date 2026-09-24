import { useEffect, useRef } from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  runOnJS,
} from "react-native-reanimated";
import type { SharedValue } from "react-native-reanimated";

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

const ITEM_HEIGHT = 44;
const VISIBLE_COUNT = 5;
const PADDING_COUNT = Math.floor(VISIBLE_COUNT / 2);

type Props = {
  items: string[];
  selectedIndex: number;
  onValueChange: (index: number, value: string) => void;
};

function PickerItem({
  scrollY,
  label,
  dataIdx,
  containerHeight,
}: {
  scrollY: SharedValue<number>;
  label: string;
  dataIdx: number;
  containerHeight: number;
}) {
  const style = useAnimatedStyle(() => {
    const itemCenter = (dataIdx + PADDING_COUNT) * ITEM_HEIGHT + ITEM_HEIGHT / 2;
    const viewCenter = scrollY.value + containerHeight / 2;
    const dist = Math.abs(itemCenter - viewCenter);
    const isCenter = dist < ITEM_HEIGHT * 0.6;

    return {
      color: isCenter ? "#FFFFFF" : "#6B7280",
      fontWeight: isCenter ? ("700" as const) : ("500" as const),
    };
  });

  return (
    <View style={s.item}>
      <Animated.Text style={[s.text, style]}>{label}</Animated.Text>
    </View>
  );
}

export default function ScrollPicker({
  items,
  selectedIndex,
  onValueChange,
}: Props) {
  const scrollY = useSharedValue(0);
  const containerHeight = VISIBLE_COUNT * ITEM_HEIGHT;
  const scrollRef = useRef<ScrollView>(null);

  const totalSlots = PADDING_COUNT + items.length + PADDING_COUNT;

  const settle = (idx: number) => {
    onValueChange(idx, items[idx]);
  };

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
    onMomentumEnd: (e) => {
      const idx = Math.round(e.contentOffset.y / ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(items.length - 1, idx));
      runOnJS(settle)(clamped);
    },
  });

  useEffect(() => {
    // Syncs the wheel when the parent sets a value programmatically
    // (e.g. loading a saved date of birth after mount).
    const y = selectedIndex * ITEM_HEIGHT;
    scrollRef.current?.scrollTo({ y, animated: false });
    scrollY.value = y;
  }, [scrollY, selectedIndex]);

  return (
    <View style={[s.container, { height: containerHeight }]}>
      <View style={[s.highlight, { top: PADDING_COUNT * ITEM_HEIGHT }]} />
      <AnimatedScrollView
        ref={scrollRef}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        bounces={false}
      >
        {Array.from({ length: totalSlots }, (_, i) => {
          const dataIdx = i - PADDING_COUNT;
          const label =
            dataIdx >= 0 && dataIdx < items.length ? items[dataIdx] : "";
          return (
            <PickerItem
              key={i}
              scrollY={scrollY}
              label={label}
              dataIdx={dataIdx}
              containerHeight={containerHeight}
            />
          );
        })}
      </AnimatedScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { overflow: "hidden" },
  highlight: {
    position: "absolute",
    left: 0,
    right: 0,
    height: ITEM_HEIGHT,
    backgroundColor: "#15803D",
    borderRadius: 12,
    zIndex: 0,
  },
  item: {
    height: ITEM_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    fontSize: 16,
    textAlign: "center",
  },
});