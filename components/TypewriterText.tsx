import { useEffect, useState } from "react";
import { Text } from "react-native";

export default function TypewriterText({
  text,
  onDone,
  className,
}: {
  text: string;
  onDone?: () => void;
  className?: string;
}) {
  const [visibleCount, setVisibleCount] = useState(0);
  useEffect(() => {
    setVisibleCount(0);
  }, [text]);

  useEffect(() => {
    if (visibleCount >= text.length) {
      onDone?.();
      return;
    }
    const timeout = setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + 2, text.length));
    }, 18);
    return () => clearTimeout(timeout);
  }, [visibleCount, text, onDone]);
  return <Text className={className}>{text.slice(0, visibleCount)}</Text>;
}