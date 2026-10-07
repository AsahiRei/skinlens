import { useEffect, useRef, useState } from "react";
import {
  Keyboard,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Send,
  MessageSquare,
  MapPin,
  Navigation,
  Download,
} from "lucide-react-native";

import TypewriterText from "@/components/TypewriterText";
import TypingDots from "@/components/TypingDots";
import { KeyboardAvoidingWrapper } from "@/components/KeyboardAwareView";
import ChatImageCarousel from "@/components/ChatImageCarousel";
import ChatProductCard from "@/components/ChatProductCard";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { IconBadge, UiModal } from "@/components/ui";
import { theme } from "@/lib/theme";
import { useChatUserContext } from "@/hooks/useChatUserContext";
import type { ChatMessage, ChatTurn } from "@/types/chat";
import { generateChatReply } from "@/utils/chat-assistant";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  findNearbyDermatologists,
  formatClinicsForChat,
  isNearbyClinicIntent,
} from "@/utils/nearby-derma";
import {
  attachProductImages,
  findIngredientImages,
  formatImagesForChat,
  getProductsForConcern,
  getRecommendedProducts,
  getRelatedProducts,
  isIngredientImageIntent,
  isProductListIntent,
} from "@/utils/ingredient-images";

const INITIAL_MESSAGES: ChatMessage[] = [];

export default function Chatbot() {
  const router = useRouter();
  const { userContext } = useChatUserContext();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("Thinking");
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const downloadToastShown = useRef(false);

  const showDownloadNotice = (message: string) => {
    if (Platform.OS === "android") {
      ToastAndroid.show(message, ToastAndroid.LONG);
    } else {
      setDownloadNotice(message);
    }
  };
  const msgCountRef = useRef(0);
  const hasStarted = messages.length > 0;
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
  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isThinking) return;
    setInput("");
    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: trimmed,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setIsThinking(true);
    try {
      // Fast path: nearby hospital/clinic requests reuse the same
      // Geoapify lookup as the Derma tab (no LLM hallucinations).
      if (isNearbyClinicIntent(trimmed)) {
        setThinkingLabel("Locating");
        try {
          const { clinics } = await findNearbyDermatologists(5);
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-assistant`,
              role: "assistant",
              content: formatClinicsForChat(clinics),
              clinics,
              animate: clinics.length === 0,
            },
          ]);
        } catch (err) {
          console.error("Nearby lookup from chat failed:", err);
          const msg =
            err instanceof Error &&
            err.message.includes("permission")
              ? "I need your location to find nearby hospitals. Please allow location access, then ask again — or tap Derma to search manually."
              : "Sorry, I couldn't fetch nearby hospitals right now. Please try again, or open the Derma tab for the full map.";
          setMessages((prev) => [
            ...prev,
            {
              id: `${Date.now()}-error`,
              role: "assistant",
              content: msg,
              animate: true,
            },
          ]);
        } finally {
          setThinkingLabel("Thinking");
        }
        return;
      }
      const history: ChatTurn[] = nextMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      // Live ingredient/product visuals load in parallel with the on-device
      // LLM so text latency is unchanged. Images are UI attachments — the
      // text-only model never sees them.
      const wantsImages = isIngredientImageIntent(trimmed);
      const wantsProductList = isProductListIntent(trimmed);
      const showVisuals = wantsImages || wantsProductList;
      if (showVisuals) setThinkingLabel("Finding images");
      const imagesPromise = wantsImages
        ? findIngredientImages(trimmed, 4)
        : Promise.resolve([]);
      const productsPromise = showVisuals
        ? (async () => {
            const seen = new Set<string>();
            // "Recommendation / product list" shows ONLY the user's own
            // recommended products — no hardcoded-catalog filler. A
            // specific-ingredient question scopes to that ingredient instead.
            const candidates =
              wantsProductList && !wantsImages
                ? userContext
                  ? getRecommendedProducts(userContext, 3)
                  : []
                : [
                    ...getRelatedProducts(trimmed, 3),
                    ...getProductsForConcern(trimmed, 3),
                  ];
            const base = candidates
              .filter((p) =>
                seen.has(p.product_type)
                  ? false
                  : (seen.add(p.product_type), true),
              )
              .slice(0, 3);
            return attachProductImages(base);
          })()
        : Promise.resolve([]);
      const reply = await generateChatReply(history, userContext ?? undefined, (fraction) => {
        if (fraction < 0.1 && !downloadToastShown.current) {
          downloadToastShown.current = true;
          showDownloadNotice(
            "AI model is downloading. This may take a moment...",
          );
        }
      });
      const images = await imagesPromise;
      const relatedProducts = await productsPromise;
      setThinkingLabel("Thinking");
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content:
            images.length > 0
              ? `${reply}\n\n${formatImagesForChat(images)}`
              : reply,
          animate: true,
          images: images.length > 0 ? images : undefined,
          relatedProducts:
            relatedProducts.length > 0 ? relatedProducts : undefined,
        },
      ]);
    } catch (error) {
      console.error("Chat generation failed:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-error`,
          role: "assistant",
          content:
            "Sorry, I ran into a problem answering that. Please try again.",
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
  const BackButton = (
    <Pressable
      onPress={() => router.back()}
      hitSlop={8}
      className="h-9 w-9 items-center justify-center rounded-full bg-white"
      style={{ borderWidth: 1, borderColor: "#E5EDE8" }}
    >
      <ArrowLeft size={18} color="#15803D" />
    </Pressable>
  );

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
        onSubmitEditing={sendMessage}
      />
      <Pressable
        onPress={sendMessage}
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
        style={{ borderWidth: 1, borderColor: "#E5EDE8" }}
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
        {message.images && message.images.length > 0 && (
          <ChatImageCarousel images={message.images} />
        )}
        {message.relatedProducts && message.relatedProducts.length > 0 && (
          <View className="flex-col gap-2 mt-1">
            {message.relatedProducts.map((p) => (
              <ChatProductCard key={p.product_type} product={p} />
            ))}
          </View>
        )}
        {message.clinics && message.clinics.length > 0 && (
          <View className="flex-col gap-2 mt-1">
            {message.clinics.map((c) => (
              <View
                key={c.id}
                className="px-3 py-2.5 flex-col gap-1"
                style={{
                  backgroundColor: theme.colors.background,
                  borderRadius: theme.radius.card,
                  borderWidth: 1,
                  borderColor: theme.colors.cardBorder,
                }}
              >
                <View className="flex-row items-center gap-1.5">
                  <MapPin size={13} color={theme.colors.primary} />
                  <Text
                    className="font-bold text-[13px] flex-1"
                    style={{ color: theme.colors.ink }}
                    numberOfLines={1}
                  >
                    {c.name}
                  </Text>
                </View>
                <Text
                  className="text-[11px]"
                  style={{ color: theme.colors.muted }}
                  numberOfLines={2}
                >
                  {c.specialty} •{" "}
                  {c.distanceKm > 0
                    ? `${c.distanceKm.toFixed(1)} km away`
                    : "Nearby"}
                </Text>
                <Text
                  className="text-[11px]"
                  style={{ color: theme.colors.muted }}
                  numberOfLines={1}
                >
                  {c.address}
                </Text>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/derma-info/[id]",
                      params: {
                        id: c.id,
                        name: c.name,
                        specialty: c.specialty,
                        clinic: c.clinic,
                        address: c.address,
                        distanceKm: String(c.distanceKm),
                        rating: String(c.rating),
                        availableToday: String(c.availableToday),
                      },
                    })
                  }
                  className="rounded-full mt-1 self-start active:opacity-80"
                  style={{ borderRadius: 999, overflow: "hidden" }}
                >
                  <LinearGradient
                    colors={[...theme.gradients.dark]}
                    start={{ x: 0, y: 0.5 }}
                    end={{ x: 1, y: 0.5 }}
                    className="px-3 py-1.5"
                  >
                    <Text className="text-[11px] text-white font-bold">
                      View more
                    </Text>
                  </LinearGradient>
                </Pressable>
              </View>
            ))}
            <Pressable
              onPress={() => router.push("/(tabs)/derma")}
              className="flex-row items-center justify-center gap-1.5 rounded-full bg-white px-3 py-2 mt-1 active:opacity-80"
              style={{ borderWidth: 1.5, borderColor: theme.colors.primary }}
            >
              <Navigation size={13} color={theme.colors.primary} />
              <Text className="text-[12px] font-bold" style={{ color: theme.colors.primary }}>
                Open full map
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  if (!hasStarted) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
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
              <IconBadge icon={MessageSquare} size="lg" tone="soft" />
              <Text className="font-bold text-[24px]" style={{ color: "#10241A" }}>
                Chat
              </Text>
              <Text className="text-center" style={{ color: "#6B7280" }}>
                Ask about your skin and routine
              </Text>
            </View>
            <View className="w-full">{InputBar}</View>
          </View>
        </KeyboardAvoidingWrapper>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1" style={{ backgroundColor: "#F4F7F5" }}>
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
          <View className="flex-row items-center gap-3">
            {BackButton}
            <View className="flex-col flex-1">
              <Text className="font-bold text-[20px]" style={{ color: "#10241A" }}>
                Chat
              </Text>
              <Text className="text-[13px]" style={{ color: "#6B7280" }}>
                Ask about your skin and routine
              </Text>
            </View>
          </View>
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
                style={{ borderWidth: 1, borderColor: "#E5EDE8" }}
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