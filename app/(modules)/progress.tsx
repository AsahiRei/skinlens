import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { ArrowLeft, TrendingUp, Calendar } from "lucide-react-native";
import Svg, { Path, Circle, Rect, Line as SvgLine } from "react-native-svg";

import Skeleton from "@/components/Skeleton";
import TypewriterText from "@/components/TypewriterText";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useFocusTrigger } from "@/hooks/useFocusTrigger";
import { getAllResults, getThisWeekResults } from "@/lib/db";
import type { Result } from "@/types/schema";
import { formatter } from "@/utils/formatter";
import { generateWeeklySummary } from "@/utils/weekly-summary";

const CONFIDENCE_COLOR = "#15803D";
const CONFIDENCE_BG = "#DCFCE7";
const BAR_COLORS = ["#15803D", "#3B82F6", "#F59E0B", "#EF4444", "#8B5CF6"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function getDayLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

// Simple line chart using SVG
function ConfidenceTrendChart({ results }: { results: Result[] }) {
  const reversed = [...results].reverse();
  if (reversed.length < 2) {
    return (
      <View className="items-center py-6">
        <Text className="text-xs text-gray-400">
          Need at least 2 scans to show trend
        </Text>
      </View>
    );
  }

  const values = reversed.map((r) => (r.confidence ?? 0) * 100);
  const labels = reversed.map((r) => getDayLabel(r.created_at));
  const maxVal = Math.max(...values, 100);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const chartWidth = 300;
  const chartHeight = 120;
  const padding = 20;
  const plotWidth = chartWidth - padding * 2;
  const plotHeight = chartHeight - padding * 2;

  const points = values.map((v, i) => ({
    x: padding + (i / (values.length - 1)) * plotWidth,
    y: padding + plotHeight - ((v - minVal) / range) * plotHeight,
  }));

  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  // Area fill path
  const areaD = `${pathD} L ${points[points.length - 1].x} ${chartHeight - padding} L ${points[0].x} ${chartHeight - padding} Z`;

  // Show every other label to avoid overlap
  const visibleLabels = labels.map((l, i) =>
    i % Math.max(1, Math.floor(labels.length / 5)) === 0 ? l : "",
  );

  return (
    <View className="items-center">
      <Svg width={chartWidth} height={chartHeight + 16}>
        {/* Grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = padding + plotHeight - frac * plotHeight;
          return (
            <SvgLine
              key={frac}
              x1={padding}
              y1={y}
              x2={chartWidth - padding}
              y2={y}
              stroke="#E5E7EB"
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          );
        })}

        {/* Area fill */}
        <Path d={areaD} fill={CONFIDENCE_BG} opacity={0.5} />

        {/* Line */}
        <Path d={pathD} stroke={CONFIDENCE_COLOR} strokeWidth={2.5} fill="none" />

        {/* Dots */}
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={4} fill={CONFIDENCE_COLOR} />
        ))}
      </Svg>

      {/* X-axis labels */}
      <View
        style={{ width: chartWidth, paddingHorizontal: padding }}
        className="flex-row justify-between mt-1"
      >
        {visibleLabels.map((label, i) => (
          <Text key={i} className="text-[10px] text-gray-400" style={{ width: 30, textAlign: "center" }}>
            {label}
          </Text>
        ))}
      </View>
    </View>
  );
}

// Simple bar chart using View components
function SymptomTrendChart({ results }: { results: Result[] }) {
  const reversed = [...results].reverse();
  if (reversed.length === 0) {
    return (
      <View className="items-center py-6">
        <Text className="text-xs text-gray-400">No data yet</Text>
      </View>
    );
  }

  const labels = reversed.map((r) => getDayLabel(r.created_at));
  const maxBarHeight = 80;
  const barWidth = reversed.length > 5 ? 14 : 20;
  const groupWidth = barWidth * 2 + 4;

  const metricLabels = ["Severity", "Duration"];

  const metricData = reversed.map((r) => {
    if (!r.survey_answers) return { severity: 0, duration: 0 };
    try {
      const answers = JSON.parse(r.survey_answers);
      const type = r.detection_label ?? "normal";

      if (type === "acne") {
        const severity =
          answers.severity === "severe" ? 1
          : answers.severity === "moderate" ? 0.7
          : answers.severity === "mild" ? 0.4
          : 0;
        const duration =
          answers.duration === "more_than_6_months" ? 1
          : answers.duration === "3_to_6_months" ? 0.75
          : answers.duration === "1_to_3_months" ? 0.5
          : 0.25;
        return { severity, duration };
      }

      if (type === "eczema") {
        const severity =
          answers.itch_level === "very_itchy" ? 1
          : answers.itch_level === "moderate" ? 0.7
          : answers.itch_level === "mild" ? 0.4
          : 0;
        const duration =
          answers.coverage === "large_area" ? 1
          : answers.coverage === "medium_area" ? 0.6
          : 0.3;
        return { severity, duration };
      }

      if (type === "psoriasis") {
        const severity =
          answers.flare_frequency === "weekly" ? 1
          : answers.flare_frequency === "monthly" ? 0.6
          : 0.2;
        const duration =
          answers.coverage === "extensive" ? 1
          : answers.coverage === "moderate" ? 0.6
          : 0.3;
        return { severity, duration };
      }

      const severity =
        answers.concern === "sensitivity" ? 0.8
        : answers.concern === "dryness" ? 0.6
        : answers.concern === "oiliness" ? 0.5
        : 0;
      const duration =
        answers.routine === "no" ? 1
        : answers.routine === "sometimes" ? 0.5
        : 0;
      return { severity, duration };
    } catch {
      return { severity: 0, duration: 0 };
    }
  });

  return (
    <View>
      {/* Legend */}
      <View className="flex-row items-center gap-4 mb-3">
        {metricLabels.map((label, i) => (
          <View key={label} className="flex-row items-center gap-1.5">
            <View
              style={{ backgroundColor: BAR_COLORS[i] }}
              className="h-2.5 w-2.5 rounded-full"
            />
            <Text className="text-xs text-gray-500">{label}</Text>
          </View>
        ))}
      </View>

      {/* Bars */}
      <View className="flex-row items-end justify-between" style={{ height: maxBarHeight + 20 }}>
        {metricData.map((data, dayIndex) => (
          <View key={dayIndex} className="items-center" style={{ width: groupWidth + 8 }}>
            <View className="flex-row items-end" style={{ height: maxBarHeight }}>
              {[data.severity, data.duration].map((val, symIndex) => {
                const barH = Math.max(val * maxBarHeight, 2);
                return (
                  <View
                    key={symIndex}
                    style={{
                      height: barH,
                      width: barWidth,
                      backgroundColor: BAR_COLORS[symIndex],
                      borderRadius: 3,
                      marginLeft: symIndex > 0 ? 2 : 0,
                    }}
                  />
                );
              })}
            </View>
            <Text className="text-[10px] text-gray-400 mt-1">
              {labels[dayIndex]}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function Progress() {
  const router = useRouter();
  const [allResults, setAllResults] = useState<Result[]>([]);
  const [weekResults, setWeekResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);
  const focusTrigger = useFocusTrigger();

  const fetchData = async () => {
    try {
      const [all, week] = await Promise.all([
        getAllResults(),
        getThisWeekResults(),
      ]);
      setAllResults(all);
      setWeekResults(week);
    } catch (err) {
      console.error("Error fetching progress data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const timer = setTimeout(() => fetchData(), 2000);
    return () => clearTimeout(timer);
  }, [focusTrigger]);

  useEffect(() => {
    if (weekResults.length === 0) return;
    let cancelled = false;
    const run = async () => {
      setSummaryLoading(true);
      try {
        const summary = await generateWeeklySummary(weekResults);
        if (!cancelled) setAiSummary(summary);
      } catch {
        if (!cancelled) setAiSummary("");
      } finally {
        if (!cancelled) setSummaryLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [weekResults]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  // Calculate overall improvement
  const sortedByDate = [...allResults].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  const firstScore = sortedByDate[0]?.healthscore ?? 0;
  const latestScore = sortedByDate[sortedByDate.length - 1]?.healthscore ?? 0;
  const improvement =
    sortedByDate.length >= 2
      ? Math.round((latestScore - firstScore) * 10) / 10
      : 0;
  const isImproving = improvement > 0;

  // Weekly summary
  const weekScans = weekResults.length;
  const weekAvgScore =
    weekResults.length > 0
      ? Math.round(
          weekResults.reduce((sum, r) => sum + r.healthscore, 0) /
            weekResults.length,
        )
      : 0;

  // Get first day of current week (Monday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const mondayStr = monday.toLocaleDateString("en-US", { weekday: "long" });

  // Before vs Today
  const firstResult = sortedByDate[0] ?? null;
  const firstResultWithImage = sortedByDate.find((r) => r.image_url) ?? firstResult;
  const latestResult = sortedByDate[sortedByDate.length - 1] ?? null;

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-gray-50">
        <View className="px-6 pt-4 gap-4">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-gray-50">
      <ScrollView
        className="flex-1 px-6"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor="#15803D"
            colors={["#15803D"]}
          />
        }
      >
        {/* Header */}
        <View className="flex-row items-center gap-3 mb-1">
          <Pressable
            onPress={() => router.back()}
            className="h-9 w-9 items-center justify-center rounded-full bg-white active:opacity-70"
          >
            <ArrowLeft size={18} color="#15803D" />
          </Pressable>
          <Text className="font-bold text-green-700 text-2xl">Progress</Text>
        </View>

        {/* Overall Improvement */}
        <View className="bg-white rounded-xl border border-gray-100 py-4 px-4 mt-4 flex-row items-center justify-between">
          <View className="flex-col">
            <Text className="text-gray-500 text-sm">Overall Improvement</Text>
            <Text className="font-bold text-green-700 text-3xl mt-1">
              {isImproving ? "+" : ""}
              {improvement.toFixed(1)}%
            </Text>
            <Text className="text-xs text-gray-400 mt-1">
              Since {mondayStr} · {weekScans} scans
            </Text>
          </View>
          <View className="items-end gap-2">
            <View className="bg-green-50 h-12 w-12 items-center justify-center rounded-2xl">
              <TrendingUp size={22} color="#15803D" />
            </View>
            {isImproving && (
              <View className="bg-green-50 rounded-full px-3 py-1">
                <Text className="text-xs font-bold text-green-700">
                  Improving ↑
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* AI Confidence Trend */}
        <View className="bg-white rounded-xl border border-gray-100 py-4 px-4 mt-4">
          <Text className="font-bold text-gray-900 text-[15px] mb-3">
            AI Confidence Trend
          </Text>
          <ConfidenceTrendChart results={allResults} />
        </View>

        {/* Symptom Trend */}
        <View className="bg-white rounded-xl border border-gray-100 py-4 px-4 mt-4">
          <Text className="font-bold text-gray-900 text-[15px]">
            Symptom Trend
          </Text>
          <View className="mt-2">
            <SymptomTrendChart results={allResults} />
          </View>
        </View>

        {/* Before vs. Today */}
        {firstResult && latestResult && firstResult.id !== latestResult.id && (
          <View className="bg-white rounded-xl border border-gray-100 py-4 px-4 mt-4">
            <Text className="font-bold text-gray-900 text-[15px] mb-3">
              Before vs. Today
            </Text>
            <View className="flex-row items-center justify-between">
              {/* Before */}
              <View className="items-center flex-1">
                <View className="w-28 h-28 rounded-2xl overflow-hidden bg-gray-100">
                  {firstResultWithImage.image_url ? (
                    <Image
                      source={{ uri: firstResultWithImage.image_url }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="w-full h-full items-center justify-center">
                      <Text className="text-xs text-gray-400">No image</Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs text-gray-400 mt-2">
                  {formatDateFull(firstResult.created_at)}
                </Text>
              </View>

              {/* Arrow + improvement */}
              <View className="items-center px-3">
                <Text className="text-green-700 font-bold text-lg">
                  {improvement > 0 ? "+" : ""}
                  {improvement.toFixed(1)}%
                </Text>
                <Text className="text-gray-400 text-lg">→</Text>
              </View>

              {/* Today */}
              <View className="items-center flex-1">
                <View className="w-28 h-28 rounded-2xl overflow-hidden bg-green-50 border-2 border-green-200">
                  {latestResult.image_url ? (
                    <Image
                      source={{ uri: latestResult.image_url }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="w-full h-full items-center justify-center">
                      <Text className="text-xs text-gray-400">No image</Text>
                    </View>
                  )}
                </View>
                <Text className="text-xs text-green-700 font-bold mt-2">
                  Today ✓
                </Text>
              </View>
            </View>
          </View>
        )}

        {/* Scan History */}
        <View className="bg-white rounded-xl border border-gray-100 py-4 px-4 mt-4">
          <Text className="font-bold text-gray-900 text-[15px] mb-3">
            Scan History
          </Text>
          {allResults.length === 0 ? (
            <View className="items-center py-6">
              <Calendar size={28} color="#D1D5DB" />
              <Text className="text-xs text-gray-400 mt-2">
                No scans yet. Start scanning to track your progress.
              </Text>
            </View>
          ) : (
            <View className="gap-3">
              {allResults.slice(0, 3).map((result) => {
                const label = formatter(result.detection_label ?? result.severity);
                const dayLabel = formatDate(result.created_at);
                const conf = result.confidence
                  ? `${(result.confidence * 100).toFixed(0)}%`
                  : "—";
                return (
                  <View
                    key={result.id}
                    className="flex-row items-center justify-between py-2 border-b border-gray-50 last:border-b-0"
                  >
                    <View className="flex-row items-center gap-3 flex-1">
                      <View className="h-10 w-10 items-center justify-center rounded-full bg-green-50">
                        <Text className="text-green-700 text-xs font-bold">
                          {result.confidence
                            ? `${Math.round(result.confidence * 100)}`
                            : "—"}
                        </Text>
                      </View>
                      <View className="flex-col">
                        <Text className="font-bold text-gray-900 text-sm">
                          {label} Detection · {dayLabel}
                        </Text>
                        <Text className="text-xs text-gray-400">
                          Confidence: {conf}
                        </Text>
                      </View>
                    </View>
                    <Text className="text-sm font-bold text-green-700">
                      {result.healthscore}%
                    </Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Weekly Summary */}
        <View className="bg-green-700 rounded-xl py-4 px-4 mt-4">
          <Text className="font-bold text-white text-base">
            WEEKLY SUMMARY
          </Text>
          <Text className="text-green-100 text-xs mt-1">
            {weekScans} scans · Avg score: {weekAvgScore}%
          </Text>
          {summaryLoading ? (
            <ActivityIndicator size="small" color="#BBF7D0" style={{ marginTop: 10 }} />
          ) : aiSummary ? (
            <TypewriterText
              text={aiSummary}
              className="text-green-200 text-xs mt-2 leading-5"
            />
          ) : null}
        </View>

        {/* Weekly detail cards */}
        {weekResults.length > 0 && (
          <View className="bg-white rounded-xl border border-gray-100 py-4 px-4 mt-4">
            <Text className="font-bold text-gray-900 text-[15px] mb-3">
              This Week's Scans
            </Text>
            <View className="gap-2">
              {weekResults.slice(0, 3).map((result) => (
                <View
                  key={result.id}
                  className="flex-row items-center gap-3 py-2 border-b border-gray-50 last:border-b-0"
                >
                  <View className="flex-1">
                    <Text className="font-bold text-gray-900 text-sm">
                      {formatter(result.detection_label ?? result.severity)}
                    </Text>
                    <Text className="text-xs text-gray-400">
                      {formatDateFull(result.created_at)} · Score:{" "}
                      {result.healthscore}%
                    </Text>
                  </View>
                  {result.image_url && (
                    <View className="w-10 h-10 rounded-lg overflow-hidden bg-gray-100">
                      <Image
                        source={{ uri: result.image_url }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    </View>
                  )}
                </View>
              ))}
            </View>
          </View>
        )}

        <View className="h-4" />
      </ScrollView>
    </SafeAreaView>
  );
}
