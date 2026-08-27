<<<<<<< HEAD
import { useEffect, useState } from "react";
import { Text } from "react-native";
=======
import { Text } from "react-native";
import { useEffect, useState } from "react";
>>>>>>> 45c2537b977d5138d5a295f5abba52b9f277cf38

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