import { View, Text, Pressable, TextInput } from "react-native";
import { useRef, useState } from "react";
import { useRouter } from "expo-router";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { profileSetup } from "@/data/profile-setup";
import PageView from "react-native-pager-view";

export default function ProfileSetup() {
  const pageViewRef = useRef<PageView>(null);
  const [page, setPage] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const currentPage = profileSetup[page];
  const canContinue = !!answers[currentPage.id]?.trim();
  const router = useRouter();
  console.log(answers)
  const goNext = () => {
    if (!canContinue) return;
    if (page < profileSetup.length - 1) {
      pageViewRef.current?.setPage(page + 1);
    } else {
      router.replace({
        pathname: "/(user)/processing",
        params: {
          answers: JSON.stringify(answers),
        },
      });
    }
  };
  const goBack = () => {
    if (page > 0) {
      pageViewRef.current?.setPage(page - 1);
    }
  };
  const setAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({
      ...prev,
      [id]: value,
    }));
  };
  return (
    <SafeAreaView className="flex-1 bg-white">
      <Text className="px-4 text-green-700 font-semibold">
        Step {page + 1} / {profileSetup.length}
      </Text>
      <View className="flex-row px-4 gap-2 mb-6 mt-2">
        {profileSetup.map((_, index) => (
          <View
            key={index}
            className={`${index === page ? "bg-green-700" : "bg-gray-300"} w-4 h-1.5 rounded-full flex-1`}
          />
        ))}
      </View>
      <PageView
        ref={pageViewRef}
        style={{ flex: 1 }}
        initialPage={0}
        onPageSelected={(e) => {
          setPage(e.nativeEvent.position);
        }}
      >
        {profileSetup.map((item, index) => (
          <View key={index} className="px-4 gap-4">
            <Text className="text-4xl font-semibold">{item.label}</Text>
            {item.type === "input" && (
              <View className="flex-row items-center border border-gray-400 rounded-full px-3 py-1 gap-1">
                <TextInput
                  className="flex-1"
                  placeholder={item.placeholder}
                  value={answers[item.id]}
                  onChangeText={(text) =>
                    setAnswers({ ...answers, [item.id]: text })
                  }
                  placeholderTextColor="gray"
                />
              </View>
            )}
            {item.type === "options" && (
              <View className="flex-col gap-4">
                {item.options?.map((option, index) => {
                  const isSelected = answers[item.id] === option.value;
                  return (
                    <Pressable
                      key={index}
                      className={`rounded-full py-4 ${isSelected ? "bg-green-700" : "border border-gray-400"}`}
                      onPress={() => setAnswer(item.id, option.value)}
                    >
                      <Text
                        className={`${isSelected ? "text-white" : "text-black"} text-center font-medium`}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>
        ))}
      </PageView>
      <View className="mb-4 flex-row px-4 gap-2">
        <Pressable
          className={`flex-1 border border-gray-400 rounded-full py-4 ${page === 0 ? "opacity-50" : ""}`}
          disabled={page === 0}
          onPress={goBack}
        >
          <Text className="text-center font-medium">Back</Text>
        </Pressable>
        <Pressable
          className={`flex-1 rounded-full active:opacity-80 py-4 ${!canContinue ? "bg-gray-600" : "bg-green-700"}`}
          disabled={!canContinue}
          onPress={goNext}
        >
          <Text className="text-white text-center font-medium">Next</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
