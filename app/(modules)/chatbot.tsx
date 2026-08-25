import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "expo-router";
import { useChatUserContext } from "@/hooks/useChatUserContext";
import { generateChatReply } from "@/utils/chat-assistant";
import type { ChatTurn, ChatMessage } from "@/types/chat";
import TypewriterText from "@/components/TypewriterText";
import TypingDots from "@/components/TypingDots";
import Ionicons from "@react-native-vector-icons/ionicons";

const INITIAL_MESSAGES: ChatMessage[] = [];

export default function Chatbot() {
  const router = useRouter();
  const { userContext } = useChatUserContext();
  const [messages, setMessages] = useState<ChatMessage[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const hasStarted = messages.length > 0;
  useEffect(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
  }, [messages, isThinking]);
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
      const history: ChatTurn[] = nextMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const reply = await generateChatReply(history, userContext ?? undefined);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-assistant`,
          role: "assistant",
          content: reply,
          animate: true,
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
      className="h-9 w-9 items-center justify-center rounded-full bg-white shadow-sm"
    >
      <Ionicons name="arrow-back" size={18} color="#15803D" />
    </Pressable>
  );

  const InputBar = (
    <View className="flex-row items-center gap-2 bg-white rounded-full shadow-sm px-2 py-2">
      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="Type a message..."
        placeholderTextColor="#9CA3AF"
        className="flex-1 px-3 text-sm text-gray-800"
        multiline
        editable={!isThinking}
        onSubmitEditing={sendMessage}
      />
      <Pressable
        onPress={sendMessage}
        disabled={!input.trim() || isThinking}
        className={`h-10 w-10 rounded-full items-center justify-center ${
          !input.trim() || isThinking ? "bg-green-100" : "bg-green-700"
        }`}
      >
        <Ionicons
          name="send"
          size={16}
          color={!input.trim() || isThinking ? "#15803D" : "#FFFFFF"}
        />
      </Pressable>
    </View>
  );
  const renderMessage = (message: ChatMessage) => {
    const isUser = message.role === "user";
    return (
      <View
        key={message.id}
        className={`max-w-[80%] rounded-3xl px-4 py-3 ${
          isUser ? "self-end bg-green-700" : "self-start bg-white shadow-sm"
        }`}
      >
        {message.animate ? (
          <TypewriterText
            text={message.content}
            className="text-sm text-gray-800"
            onDone={() => markAnimationDone(message.id)}
          />
        ) : (
          <Text
            className={`text-sm ${isUser ? "text-white" : "text-gray-800"}`}
          >
            {message.content}
          </Text>
        )}
      </View>
    );
  };

  if (!hasStarted) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="px-6 pt-2">{BackButton}</View>
        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
        >
          <View className="flex-1 items-center justify-center px-6 gap-6">
            <View className="items-center gap-2">
              <Ionicons name="chatbubbles-outline" size={32} color="#15803D" />
              <Text className="font-bold text-green-700 text-2xl">
                Nerma AI Assistant
              </Text>
              <Text className="text-gray-500 text-center">
                Ask me anything about your skincare routine
              </Text>
            </View>
            <View className="w-full">{InputBar}</View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-gray-50">
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <View className="px-6 pt-2">
          <View className="flex-row items-center gap-3">
            {BackButton}
            <View className="flex-col flex-1">
              <Text className="font-bold text-green-700 text-2xl">
                Nerma AI
              </Text>
              <Text className="text-gray-500">
                Ask me anything about your skincare routine
              </Text>
            </View>
          </View>
        </View>
        <ScrollView
          ref={scrollRef}
          className="flex-1 px-6"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 16 }}
        >
          <View className="flex-col gap-3">
            {messages.map(renderMessage)}

            {isThinking && (
              <View className="self-start bg-white shadow-sm rounded-3xl px-3 py-2">
                <TypingDots />
              </View>
            )}
          </View>
        </ScrollView>
        <View className="px-6 pb-4 pt-2">{InputBar}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}