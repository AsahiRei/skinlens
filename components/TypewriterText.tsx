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
  const [blinkOn, setBlinkOn] = useState(true);
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

  const done = visibleCount >= text.length;

  useEffect(() => {
    if (done) {
      onDoneRef.current?.();
      return;
    }
    const timeout = setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + 3, text.length));
    }, 16);
    return () => clearTimeout(timeout);
  }, [visibleCount, text, done]);

  useEffect(() => {
    if (done) return;
    const blink = setInterval(() => {
      setBlinkOn((prev) => !prev);
    }, 400);
    return () => clearInterval(blink);
  }, [done]);

  return (
    <Text className={className}>
      {text.slice(0, visibleCount)}
      {!done && <Text className={className}>{blinkOn ? "▍" : " "}</Text>}
    </Text>
  );
}