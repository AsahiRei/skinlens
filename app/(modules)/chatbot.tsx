import { useCallback, useEffect, useRef, useState } from "react";
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { useFocusEffect, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Send, Download } from "lucide-react-native";

import TypewriterText from "@/components/TypewriterText";
import TypingDots from "@/components/TypingDots";
import { KeyboardAvoidingWrapper } from "@/components/KeyboardAwareView";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { BackChip, BackHeader, UiModal } from "@/components/ui";
import ChatProductCard from "@/components/ChatProductCard";
import ChatPhProductCard from "@/components/ChatPhProductCard";
import ChatClinicCard from "@/components/ChatClinicCard";
import { theme } from "@/lib/theme";
import { useChatUserContext } from "@/hooks/useChatUserContext";
import type { ChatMessage, ChatTurn, ChatUserContext } from "@/types/chat";
import type { ProductWithImage } from "@/types/knowledge";
import { CHAT_ERROR_REPLY, generateChatReply, type ChatReply } from "@/utils/chat-assistant";
import { isNearbyClinicIntent } from "@/utils/nearby-derma";
import { ScreenGradient } from "@/components/ScreenGradient";

const INITIAL_MESSAGES: ChatMessage[] = [];

/** Starter questions tailored to what we know about the user. */
function buildSuggestions(ctx: ChatUserContext | null): string[] {
  const out: string[] = [];
  if (ctx?.scan_count && ctx.scan_count >= 2) out.push("How is my skin progress?");
  else if (ctx?.scan_count === 1) out.push("What did my last scan show?");
  if (ctx?.recommendations_summary) {
    out.push("Recommend products for me available in the Philippines");
  } else if (ctx?.main_concerns) {
    out.push(`Best products in the Philippines for ${ctx.main_concerns.split(",")[0].trim().toLowerCase()}`);
  } else {
    out.push("Best niacinamide serum in the Philippines?");
  }
  out.push("Find a dermatologist near me");
  return out.slice(0, 3);
}

export default function Chatbot() {
  const router = useRouter();
  const { userContext, refresh } = useChatUserContext();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("Thinking");
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const downloadToastShown = useRef(false);
  const msgCountRef = useRef(0);

  // Re-read profile/scan data whenever the screen regains focus so a scan
  // taken after opening chat is reflected in the next answer.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  const showDownloadNotice = (message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.LONG);
    } else {
      setDownloadNotice(message);
    }
  };
  const hasStarted = messages.length > 0;
  const suggestions = buildSuggestions(userContext);
  // Only auto-scroll when a NEW message arrives. Scrolling on every
  // isThinking/animate flag change yanks the list back while the user is
  // trying to scroll (felt like a scroll lock).
  useEffect(() => {
    if (messages.length > msgCountRef.current) {
      msgCountRef.current = messages.length;
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    } else {
      msgCountRef.current = messages.length;
    }
  }, [messages]);
  // Keep the latest messages (and the input bar) visible when the
  // keyboard opens — otherwise it covers the input on both platforms.
  useEffect(() => {
    const sub = Keyboard.addListener("keyboardDidShow", () => {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollToEnd({ animated: true });
      });
    });
    return () => sub.remove();
  }, []);
  const sendMessage = async (preset?: string) => {
    const trimmed = (preset ?? input).trim();
    if (!trimmed || isThinking) return;
    setInput("");
    setThinkingLabel(isNearbyClinicIntent(trimmed) ? "Finding clinics near you" : "Thinking");
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: trimmed,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setIsThinking(true);
    try {
      const history: ChatTurn[] = nextMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const reply: ChatReply = await generateChatReply(history, userContext ?? undefined, (fraction) => {
        if (fraction < 0.1 && !downloadToastShown.current) {
          downloadToastShown.current = true;
          showDownloadNotice(
            "AI model is downloading. This may take a moment...",
          );
        }
      });
      setThinkingLabel("Thinking");
      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: reply.text,
        animate: true,
        relatedProducts: reply.productCards as ProductWithImage[] | undefined,
        phProducts: reply.phProducts,
        clinics: reply.clinics,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat generation failed:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          role: "assistant",
          content: CHAT_ERROR_REPLY,
          animate: true,
        },
      ]);
    } finally {
      setIsThinking(false);
    }
  };
  const markAnimationDone = (id: string) => {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, animate: false } : m)),
    );
  };
  const BackButton = <BackChip onPress={() => router.back()} label="Back to chat" />;

  const InputBar = (
    <View
      className="flex-row items-end gap-2 bg-white px-2 py-2"
      style={{ borderRadius: theme.radius.card, borderWidth: 1, borderColor: theme.colors.cardBorder }}
    >
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="Ask about your skin..."
        placeholderTextColor={theme.colors.faint}
        className="flex-1 px-3 py-2 text-[15px] leading-6"
        style={{ color: theme.colors.ink }}
        multiline
        editable={!isThinking}
        onSubmitEditing={() => sendMessage()}
      />
      <Pressable
        onPress={() => sendMessage()}
        disabled={!input.trim() || isThinking}
        className="h-10 w-10 rounded-full items-center justify-center overflow-hidden active:opacity-80"
      >
        <LinearGradient
          colors={
            !input.trim() || isThinking
              ? [theme.colors.primarySoft, theme.colors.primarySoft]
              : [...theme.gradients.icon]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          className="h-10 w-10 items-center justify-center"
        >
          <Send
            size={16}
            color={!input.trim() || isThinking ? theme.colors.primary : "#FFFFFF"}
          />
        </LinearGradient>
      </Pressable>
    </View>
  );
  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === "user";
    if (isUser) {
      return (
        <LinearGradient
          key={message.id}
          colors={[...theme.gradients.dark]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`You: ${message.content}`}
          className="max-w-[80%] rounded-2xl rounded-br-[6px] px-4 py-3 self-end"
          style={{ borderRadius: theme.radius.card }}
        >
          <Text className="text-[15px] leading-6 text-white">
            {message.content}
          </Text>
        </LinearGradient>
      );
    }
    return (
      <View
        key={message.id}
        accessible
        accessibilityRole="text"
        accessibilityLabel={`Assistant: ${message.content}`}
        className="max-w-[85%] rounded-2xl rounded-bl-[6px] px-4 py-3 self-start bg-white flex-col gap-2"
        style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
      >
        {message.animate ? (
          <TypewriterText
            text={message.content}
            className="text-[15px] leading-6"
            style={{ color: theme.colors.body }}
            onDone={() => markAnimationDone(message.id)}
          />
        ) : (
          <Text className="text-[15px] leading-6" style={{ color: theme.colors.body }}>
            {message.content}
          </Text>
        )}
        {message.relatedProducts && message.relatedProducts.length > 0 && (
          <View className="flex-row flex-wrap gap-2 mt-1">
            {message.relatedProducts.map((product, idx) => (
              <ChatProductCard key={`${message.id}-product-${idx}`} product={product} />
            ))}
          </View>
        )}
        {message.phProducts && message.phProducts.length > 0 && (
          <View className="flex-col gap-2 mt-1">
            {message.phProducts.map((product) => (
              <ChatPhProductCard key={`${message.id}-ph-${product.id}`} product={product} />
            ))}
          </View>
        )}
        {message.clinics && message.clinics.length > 0 && (
          <View className="flex-col gap-2 mt-1">
            {message.clinics.map((clinic) => (
              <ChatClinicCard key={`${message.id}-clinic-${clinic.id}`} clinic={clinic} />
            ))}
            <Pressable
              onPress={() => router.push("/(tabs)/derma")}
              className="self-start py-1 active:opacity-70"
              accessibilityRole="link"
            >
              <Text className="text-[12px] font-semibold" style={{ color: theme.colors.primary }}>
                Open the full map in the Derma tab
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  if (!hasStarted) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <UiModal
          visible={downloadNotice !== null}
          onDismiss={() => setDownloadNotice(null)}
          title="Downloading model"
          message={downloadNotice ?? undefined}
          icon={Download}
          tone="soft"
          actions={[{ label: "Got it", onPress: () => setDownloadNotice(null) }]}
        />
        <View className="px-5 pt-2">{BackButton}</View>
        <KeyboardAvoidingWrapper>
          <View className="flex-1 items-center justify-center px-5 gap-6">
            <View className="items-center gap-2">
              <Image
                source={require("@/assets/images/others/6.png")}
                className="h-42 w-42 rounded-2xl"
              />
              <Text className="font-bold text-[24px]" style={{ color: theme.colors.ink }}>
                Nerma
              </Text>
              <Text className="text-center" style={{ color: theme.colors.muted }}>
                Ask about your skin and routine
              </Text>
            </View>
            <View className="w-full gap-2">
              {suggestions.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => sendMessage(s)}
                  className="self-center rounded-full px-4 py-2 bg-white active:opacity-70"
                  style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
                  accessibilityRole="button"
                >
                  <Text className="text-[13px]" style={{ color: theme.colors.body }}>
                    {s}
                  </Text>
                </Pressable>
              ))}
            </View>
            <View className="w-full">{InputBar}</View>
          </View>
        </KeyboardAvoidingWrapper>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <UiModal
        visible={downloadNotice !== null}
        onDismiss={() => setDownloadNotice(null)}
        title="Downloading model"
        message={downloadNotice ?? undefined}
        icon={Download}
        tone="soft"
        actions={[{ label: "Got it", onPress: () => setDownloadNotice(null) }]}
      />
      <KeyboardAvoidingWrapper>
        <View className="px-5 pt-2">
          <BackHeader
            title="Chat"
            subtitle="Ask about your skin and routine"
            onBack={() => router.back()}
          />
        </View>
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-5"
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 16, flexGrow: 1 }}
        >
          <View className="flex-col gap-3">
            {messages.map(renderMessage)}

            {isThinking && (
              <View
                className="self-start rounded-2xl rounded-bl-[6px] px-2 py-1 bg-white"
                style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}
              >
                <TypingDots label={thinkingLabel} />
              </View>
            )}
          </View>
        </ScrollView>
        <View className="px-5 pb-4 pt-2">{InputBar}</View>
      </KeyboardAvoidingWrapper>
    </SafeAreaView>
  );
}