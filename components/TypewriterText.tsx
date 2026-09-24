import { useEffect, useRef, useState } from "react";
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
  const [prevText, setPrevText] = useState(text);
  // Reset during render (React-endorsed "adjust state during render" pattern)
  // instead of setState-in-effect, so a new text restarts the animation.
  if (prevText !== text) {
    setPrevText(text);
    setVisibleCount(0);
  }
  // Latest-ref pattern (updated in an effect, never during render): a new
  // parent onDone closure must not restart the typing timer.
  const onDoneRef = useRef(onDone);
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (visibleCount >= text.length) {
      onDoneRef.current?.();
      return;
    }
    const timeout = setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + 2, text.length));
    }, 18);
    return () => clearTimeout(timeout);
  }, [visibleCount, text]);
  return <Text className={className}>{text.slice(0, visibleCount)}</Text>;
}