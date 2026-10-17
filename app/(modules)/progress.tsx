import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { TrendingUp, Calendar, FileText, ArrowRight, Check } from "lucide-react-native";
import Svg, { Path, Circle, Line as SvgLine } from "react-native-svg";

import { FadeItem } from "@/components/FadeItem";
import Skeleton from "@/components/Skeleton";
import TypewriterText from "@/components/TypewriterText";
import { BackHeader, ClinicalCard, EmptyState, IconBadge, Pill, SectionTitle } from "@/components/ui";
import { theme } from "@/lib/theme";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useFocusTrigger } from "@/hooks/useFocusTrigger";
import { getAllResults, getThisWeekResults } from "@/lib/db";
import type { Result } from "@/types/schema";
import { formatter } from "@/utils/formatter";
import { generateWeeklySummary } from "@/utils/weekly-summary";
import { exportSkinReport } from "@/utils/report";
import { ScreenGradient } from "@/components/ScreenGradient";

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

// Trends update at most once per calendar day: if the user scans multiple
// times on the same day, keep only the latest scan for that day so the
// Confidence and Symptom charts don't gain extra points intraday.
// Input is newest-first (ORDER BY created_at DESC), so the first row seen
// per day is the latest scan of that day.
function dedupeDailyResults(results: Result[]): Result[] {
  const seen = new Map<string, Result>();
  for (const r of results) {
    const d = new Date(r.created_at);
    if (Number.isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()];
}

// Simple line chart using SVG
function ConfidenceTrendChart({ results }: { results: Result[] }) {
  const reversed = [...results].reverse();
  if (reversed.length < 2) {
    return (
      <View className="items-center py-6">
        <Text className="text-xs" style={{ color: theme.colors.faint }}>
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
              stroke={theme.colors.cardBorder}
              strokeWidth={0.5}
              strokeDasharray="4,4"
            />
          );
        })}

        {/* Area fill */}
        <Path d={areaD} fill={theme.colors.primaryTint} opacity={0.5} />

        {/* Line */}
        <Path d={pathD} stroke={theme.colors.primary} strokeWidth={2.5} fill="none" />

        {/* Dots */}
        {points.map((p, i) => (
          <Circle key={i} cx={p.x} cy={p.y} r={4} fill={theme.colors.primary} />
        ))}
      </Svg>

      {/* X-axis labels */}
      <View
        style={{ width: chartWidth, paddingHorizontal: padding }}
        className="flex-row justify-between mt-1"
      >
        {visibleLabels.map((label, i) => (
          <Text key={i} className="text-[10px]" style={{ width: 30, textAlign: "center", color: theme.colors.faint }}>
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
        <Text className="text-xs" style={{ color: theme.colors.faint }}>No data yet</Text>
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

      if (type === "dry") {
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

      if (type === "oily") {
        const severity =
          answers.severity === "severe" ? 1
          : answers.severity === "moderate" ? 0.7
          : answers.severity === "mild" ? 0.4
          : 0;
        const duration =
          answers.breakouts === "frequently" ? 1
          : answers.breakouts === "sometimes" ? 0.6
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
              style={{ backgroundColor: i === 0 ? theme.colors.primary : theme.colors.primaryTint }}
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
                      backgroundColor: symIndex === 0 ? theme.colors.primary : theme.colors.primaryTint,
                      borderRadius: 3,
                      marginLeft: symIndex > 0 ? 2 : 0,
                    }}
                  />
                );
              })}
            </View>
            <Text className="text-[10px]" style={{ color: theme.colors.faint, marginTop: 1 }}>
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
  const [exporting, setExporting] = useState(false);
  const focusTrigger = useFocusTrigger();

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportSkinReport();
    } catch (err) {
      console.error("Error generating report:", err);
      ToastAndroid.show(
        "Failed to generate report. Please try again.",
        ToastAndroid.SHORT,
      );
    } finally {
      setExporting(false);
    }
  };

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
    // Fetch-on-focus effect: setState happens in async continuations after
    // awaits, not synchronously — the extra render pass is inherent to loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
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

  // One point per day for the trend charts (latest scan wins intraday).
  const trendResults = dedupeDailyResults(allResults);

  if (loading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <View className="px-5 pt-4 gap-4">
          <Skeleton className="h-7 w-32 rounded-lg" />
          <Skeleton className="h-32 w-full rounded-[20px]" />
          <Skeleton className="h-40 w-full rounded-[20px]" />
          <Skeleton className="h-40 w-full rounded-[20px]" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 32 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Header */}
        <FadeItem index={0}>
          <View className="mb-1 mt-2">
            <BackHeader
              title="Progress"
              onBack={() => router.back()}
              rightClassName="flex-row items-center gap-1.5"
              right={
                <Pressable
                  onPress={handleExport}
                  disabled={exporting}
                  className="flex-row items-center gap-1.5 rounded-full border px-3.5 py-2 bg-white active:opacity-70"
                  style={{ borderColor: theme.colors.cardBorder, opacity: exporting ? 0.7 : 1 }}
                >
                  {exporting ? (
                    <ActivityIndicator size="small" color={theme.colors.primary} />
                  ) : (
                    <FileText size={14} color={theme.colors.primary} />
                  )}
                  <Text className="text-sm font-bold" style={{ color: theme.colors.primary }}>
                    {exporting ? "Generating…" : "Export PDF"}
                  </Text>
                </Pressable>
              }
            />
          </View>
        </FadeItem>

        {/* Overall Improvement */}
        <FadeItem index={1}>
          <ClinicalCard className="mt-4 flex-row items-center justify-between">
            <View className="flex-col">
              <Text className="text-sm" style={{ color: theme.colors.muted }}>Overall Improvement</Text>
              <Text className="font-bold text-3xl mt-1" style={{ color: theme.colors.ink }}>
                {isImproving ? "+" : ""}
                {improvement.toFixed(1)}%
              </Text>
              <Text className="text-xs mt-1" style={{ color: theme.colors.faint }}>
                Since {mondayStr} · {weekScans} scans
              </Text>
            </View>
            <View className="items-end gap-2">
              <IconBadge icon={TrendingUp} size="lg" tone="soft" />
              {isImproving && <Pill label="Improving" />}
            </View>
          </ClinicalCard>
        </FadeItem>

        {/* Confidence Trend */}
        <FadeItem index={2}>
          <ClinicalCard className="mt-4">
            <SectionTitle title="Confidence Trend" />
            <ConfidenceTrendChart results={trendResults} />
          </ClinicalCard>
        </FadeItem>

        {/* Symptom Trend */}
        <FadeItem index={3}>
          <ClinicalCard className="mt-4">
            <SectionTitle title="Symptom Trend" />
            <View className="mt-2">
              <SymptomTrendChart results={trendResults} />
            </View>
          </ClinicalCard>
        </FadeItem>

        {/* Weekly Summary */}
        <FadeItem index={4}>
          <LinearGradient
            colors={[...theme.gradients.dark]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            className="py-4 px-4 mt-4"
            style={{ borderRadius: theme.radius.card }}
          >
            <Text className="font-bold text-white text-base">
              Weekly summary
            </Text>
            <Text className="text-xs mt-1" style={{ color: "#A7C4B2" }}>
              {weekScans} scans · Avg score: {weekAvgScore}%
            </Text>
            {summaryLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" style={{ marginTop: 10 }} />
            ) : aiSummary ? (
              <TypewriterText
                text={aiSummary}
                className="text-white text-xs mt-2 leading-5"
              />
            ) : null}
          </LinearGradient>
        </FadeItem>

        {/* Before vs. Today */}
        <FadeItem index={5}>
          {firstResult && latestResult && firstResult.id !== latestResult.id && (
            <ClinicalCard className="mt-4">
              <SectionTitle title="Before vs. Today" />
              <View className="flex-row items-center justify-between">
                {/* Before */}
                <View className="items-center flex-1">
                  <View className="w-28 h-28 rounded-2xl overflow-hidden" style={{ backgroundColor: theme.colors.background }}>
                    {firstResultWithImage.image_url ? (
                      <Image
                        source={{ uri: firstResultWithImage.image_url }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="w-full h-full items-center justify-center">
                        <Text className="text-xs" style={{ color: theme.colors.faint }}>No image</Text>
                      </View>
                    )}
                  </View>
                  <Text className="text-xs" style={{ color: theme.colors.faint, marginTop: 2 }}>
                    {formatDateFull(firstResult.created_at)}
                  </Text>
                </View>

                {/* Arrow + improvement */}
                <View className="items-center px-3 gap-1">
                  <Text
                    className="font-bold text-lg"
                    style={{ color: theme.colors.primary }}
                  >
                    {improvement > 0 ? "+" : ""}
                    {improvement.toFixed(1)}%
                  </Text>
                  <ArrowRight size={18} color={theme.colors.faint} />
                </View>

                {/* Today */}
                <View className="items-center flex-1">
                  <View className="w-28 h-28 rounded-2xl overflow-hidden" style={{ backgroundColor: theme.colors.primarySoft, borderWidth: 2, borderColor: theme.colors.primary }}>
                    {latestResult.image_url ? (
                      <Image
                        source={{ uri: latestResult.image_url }}
                        className="w-full h-full"
                        resizeMode="cover"
                      />
                    ) : (
                      <View className="w-full h-full items-center justify-center">
                        <Text className="text-xs" style={{ color: theme.colors.faint }}>No image</Text>
                      </View>
                    )}
                  </View>
                  <View className="flex-row items-center gap-1 mt-2">
                    <Text
                      className="text-xs font-bold"
                      style={{ color: theme.colors.primary }}
                    >
                      Today
                    </Text>
                    <Check size={12} color={theme.colors.primary} />
                  </View>
                </View>
              </View>
            </ClinicalCard>
          )}
        </FadeItem>

        {/* Scan History */}
        <FadeItem index={6}>
          <ClinicalCard className="mt-4">
            <SectionTitle title="Scan History" />
            {allResults.length === 0 ? (
              <EmptyState
                icon={Calendar}
                copy="No scans yet."
              />
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
                      className="flex-row items-center justify-between py-2"
                      style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}
                    >
                      <View className="flex-row items-center gap-3 flex-1">
                        <View className="h-10 w-10 items-center justify-center rounded-full" style={{ backgroundColor: theme.colors.primarySoft }}>
                          <Text className="text-xs font-bold" style={{ color: theme.colors.primaryDeep }}>
                            {result.confidence
                              ? `${Math.round(result.confidence * 100)}`
                              : "—"}
                          </Text>
                        </View>
                        <View className="flex-col">
                          <Text className="font-bold text-sm" style={{ color: theme.colors.ink }}>
                            {label} Detection · {dayLabel}
                          </Text>
                          <Text className="text-xs" style={{ color: theme.colors.faint }}>
                            Confidence: {conf}
                          </Text>
                          {result.validation_status === "confirmed" ||
                          result.validation_status === "needs_review" ? (
                            <Text
                              className="text-xs font-bold"
                              style={{
                                color:
                                  result.validation_status === "confirmed"
                                    ? theme.colors.primary
                                    : "#B45309",
                              }}
                            >
                              {result.validation_status === "confirmed"
                                ? "Dermatologist confirmed"
                                : "Flagged for follow-up"}
                            </Text>
                          ) : null}
                        </View>
                      </View>
                      <Text className="text-xs font-bold" style={{ color: theme.colors.primary }}>
                        {result.healthscore}%
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
          </ClinicalCard>
        </FadeItem>

        {/* Weekly detail cards */}
        {weekResults.length > 0 && (
          <FadeItem index={7}>
            <ClinicalCard className="mt-4">
              <SectionTitle title="This Week's Scans" />
              <View className="gap-2">
                {weekResults.slice(0, 3).map((result) => (
                  <View
                    key={result.id}
                    className="flex-row items-center gap-3 py-2"
                    style={{ borderBottomWidth: 1, borderBottomColor: theme.colors.divider }}
                  >
                    <View className="flex-1">
                      <Text className="font-bold text-sm" style={{ color: theme.colors.ink }}>
                        {formatter(result.detection_label ?? result.severity)}
                      </Text>
                      <Text className="text-xs" style={{ color: theme.colors.faint }}>
                        {formatDateFull(result.created_at)} · Score:{" "}
                        {result.healthscore}%
                      </Text>
                    </View>
                    {result.image_url && (
                      <View className="w-10 h-10 rounded-lg overflow-hidden" style={{ backgroundColor: theme.colors.background }}>
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
            </ClinicalCard>
          </FadeItem>
        )}

        <View className="h-4" />
      </ScrollView>
    </SafeAreaView>
  );
}