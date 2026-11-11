import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  ToastAndroid,
  View,
} from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { FileText } from "lucide-react-native";
import Svg, { Path, Circle, Line as SvgLine, Text as SvgText } from "react-native-svg";

import { FadeItem } from "@/components/FadeItem";
import Skeleton from "@/components/Skeleton";
import TypewriterText from "@/components/TypewriterText";
import { BackHeader, ClinicalCard, EmptyState, SectionTitle } from "@/components/ui";
import { theme } from "@/lib/theme";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useFocusTrigger } from "@/hooks/useFocusTrigger";
import { getAllResults, getUserProfile, refreshAllResults } from "@/lib/db";
import { isOnlineNow } from "@/utils/network";
import type { Result } from "@/types/schema";
import { formatter } from "@/utils/formatter";
import { generateWeeklySummary, getCachedWeeklySummary } from "@/utils/weekly-summary";
import { exportSkinReport } from "@/utils/report";
import { ScreenGradient } from "@/components/ScreenGradient";

/* ---------- helpers ---------- */

// Server rows carry Postgres timestamps ("2026-11-07 10:00:00.123456+00") while offline rows use
// toISOString(); normalise both so the sort never sees NaN.
function toTime(dateStr: string): number {
  const normalized = dateStr
    ?.trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+/, "$1")
    .replace(/([+-]\d{2})$/, "$1:00");
  const t = new Date(normalized).getTime();
  return Number.isNaN(t) ? 0 : t;
}

function shortDate(dateStr: string): string {
  return new Date(toTime(dateStr)).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function isToday(dateStr: string): boolean {
  const d = new Date(toTime(dateStr));
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

// Plain-word meaning of a 0–100 skin score.
function scoreLabel(score: number): { word: string; color: string } {
  if (score >= 75) return { word: "Healthy", color: theme.colors.primary };
  if (score >= 50) return { word: "Fair", color: "#B45309" };
  return { word: "Needs care", color: theme.colors.danger };
}

// One point per calendar day (the latest scan of that day wins), oldest → newest.
function dailyScores(sortedNewestFirst: Result[], maxDays: number): Result[] {
  const seen = new Map<string, Result>();
  for (const r of sortedNewestFirst) {
    const key = new Date(toTime(r.created_at)).toDateString();
    if (!seen.has(key)) seen.set(key, r);
  }
  return [...seen.values()].slice(0, maxDays).reverse();
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function lastSevenDays(results: Result[]): Result[] {
  const weekAgo = Date.now() - WEEK_MS;
  return results.filter((r) => toTime(r.created_at) >= weekAgo);
}
const CHART_DAYS = 7;

/* ---------- Score chart: one line, numbers printed on each dot ---------- */

function ScoreChart({ points }: { points: Result[] }) {
  if (points.length < 2) {
    return (
      <Text className="text-xs py-6 text-center" style={{ color: theme.colors.muted }}>
        Scan on at least 2 different days to see your line.
      </Text>
    );
  }

  const width = 300;
  const height = 150;
  const padX = 20;
  const padTop = 24; // room for the number above each dot
  const padBottom = 24; // room for the date under the chart
  const plotW = width - padX * 2;
  const plotH = height - padTop - padBottom;

  const coords = points.map((r, i) => ({
    x: padX + (i / (points.length - 1)) * plotW,
    y: padTop + plotH - (Math.max(0, Math.min(100, r.healthscore)) / 100) * plotH,
    score: Math.round(r.healthscore),
    date: shortDate(r.created_at),
  }));
  const line = coords.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  return (
    <View className="items-center mt-2">
      <Svg width={width} height={height}>
        {/* Baseline */}
        <SvgLine
          x1={padX}
          y1={padTop + plotH}
          x2={width - padX}
          y2={padTop + plotH}
          stroke={theme.colors.cardBorder}
          strokeWidth={1}
        />
        <Path d={line} stroke={theme.colors.primary} strokeWidth={2.5} fill="none" />
        {coords.map((p, i) => (
          <Circle key={`c${i}`} cx={p.x} cy={p.y} r={4.5} fill={theme.colors.primary} />
        ))}
        {coords.map((p, i) => (
          <SvgText
            key={`v${i}`}
            x={p.x}
            y={p.y - 9}
            fontSize={11}
            fontWeight="bold"
            fill={theme.colors.ink}
            textAnchor="middle"
          >
            {p.score}
          </SvgText>
        ))}
        {coords.map((p, i) => (
          <SvgText
            key={`d${i}`}
            x={p.x}
            y={height - 6}
            fontSize={10}
            fill={theme.colors.faint}
            textAnchor="middle"
          >
            {p.date}
          </SvgText>
        ))}
      </Svg>
    </View>
  );
}

/* ---------- Screen ---------- */

export default function Progress() {
  const router = useRouter();
  const focusTrigger = useFocusTrigger();
  const [results, setResults] = useState<Result[]>([]);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [summaryLoading, setSummaryLoading] = useState(false);

  const fetchData = async () => {
    try {
      // Show cached scans immediately, then pull from the server when online.
      const [cached, profile] = await Promise.all([
        getAllResults({ backgroundRefresh: false }),
        getUserProfile().catch(() => null),
      ]);
      setResults(cached);
      setProfileImage(profile?.face_image_url ?? null);
      setLoading(false);
      if (!(await isOnlineNow())) return;
      const fresh = await refreshAllResults();
      if (
        fresh.length !== cached.length ||
        fresh.some((r, i) => r.id !== cached[i]?.id || r.image_url !== cached[i]?.image_url)
      ) {
        setResults(fresh);
      }
    } catch (err) {
      console.error("Error fetching progress data:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [focusTrigger]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  };

  const handleExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await exportSkinReport();
    } catch (err) {
      console.error("Error generating report:", err);
      ToastAndroid.show("Failed to generate report. Please try again.", ToastAndroid.SHORT);
    } finally {
      setExporting(false);
    }
  };

  /* ----- derived data ----- */
  const newestFirst = [...results].sort((a, b) => toTime(b.created_at) - toTime(a.created_at));
  const latest = newestFirst[0] ?? null;
  const first = newestFirst[newestFirst.length - 1] ?? null;
  const hasTwo = newestFirst.length >= 2 && latest && first && latest.id !== first.id;
  const change = hasTwo ? Math.round(latest.healthscore - first.healthscore) : 0;

  const weekResults = lastSevenDays(newestFirst);
  const weekKey = weekResults.map((r) => r.id).join(",");

  // Weekly AI summary (cached per set of scans, so the model only reruns when the week changes).
  useEffect(() => {
    const cached = weekResults.length === 0 ? "" : getCachedWeeklySummary(weekResults) || null;
    if (cached !== null) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setAiSummary(cached);
      setSummaryLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    let cancelled = false;
    setSummaryLoading(true);
    generateWeeklySummary(weekResults)
      .then((s) => !cancelled && setAiSummary(s))
      .catch(() => !cancelled && setAiSummary(""))
      .finally(() => !cancelled && setSummaryLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekKey]);

  // Before photo: oldest scan (not the latest) whose image loads; fall back to the enrolment photo.
  const usable = (uri?: string | null) => !!uri && !failedImages.has(uri);
  const beforeScan = [...newestFirst]
    .reverse()
    .find((r) => r.id !== latest?.id && usable(r.image_url));
  const beforeImage = beforeScan?.image_url ?? (usable(profileImage) ? profileImage : null);
  const beforeDate = beforeScan?.created_at ?? first?.created_at;
  const markFailed = (uri: string) =>
    setFailedImages((prev) => (prev.has(uri) ? prev : new Set(prev).add(uri)));

  if (loading) {
    return (
      <SafeAreaView className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        <ScreenGradient />
        <View className="px-5 pt-4 gap-4">
          <Skeleton className="h-7 w-32 rounded-lg" />
          <Skeleton className="h-40 w-full rounded-[20px]" />
          <Skeleton className="h-40 w-full rounded-[20px]" />
          <Skeleton className="h-32 w-full rounded-[20px]" />
        </View>
      </SafeAreaView>
    );
  }

  const status = latest ? scoreLabel(latest.healthscore) : null;
  const changeText = !hasTwo
    ? "Scan on another day to see your progress."
    : change > 0
      ? `Up ${change} points since ${shortDate(first.created_at)}`
      : change < 0
        ? `Down ${Math.abs(change)} points since ${shortDate(first.created_at)}`
        : `No change since ${shortDate(first.created_at)}`;

  return (
    <SafeAreaView
      edges={["top"]}
      className="flex-1"
      style={{ backgroundColor: theme.colors.background }}
    >
      <ScreenGradient />
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
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
              title="My Progress"
              onBack={() => router.back()}
              rightClassName="flex-row items-center"
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

        {!latest ? (
          <FadeItem index={1}>
            <ClinicalCard className="mt-4">
              <EmptyState
                title="No scans yet"
                copy="Take your first skin scan and your progress will show up here."
              />
            </ClinicalCard>
          </FadeItem>
        ) : (
          <>
            {/* 1. Current score + is it getting better? */}
            <FadeItem index={1}>
              <ClinicalCard className="mt-4">
                <Text className="text-sm" style={{ color: theme.colors.muted }}>
                  Your skin score today
                </Text>
                <View className="flex-row items-center justify-between mt-1">
                  <Text
                    style={{
                      fontSize: 44,
                      lineHeight: 52,
                      fontWeight: "bold",
                      color: theme.colors.ink,
                    }}
                  >
                    {Math.round(latest.healthscore)}
                    <Text style={{ fontSize: 16, fontWeight: "normal", color: theme.colors.faint }}>
                      {" / 100"}
                    </Text>
                  </Text>
                  <Text className="text-sm font-bold" style={{ color: status!.color }}>
                    {status!.word}
                  </Text>
                </View>
                <Text className="text-sm mt-2" style={{ color: theme.colors.body }}>
                  {changeText}
                </Text>
              </ClinicalCard>
            </FadeItem>

            {/* 2. Before and now photos */}
            {hasTwo && (
              <FadeItem index={2}>
                <ClinicalCard className="mt-4">
                  <SectionTitle title="Before and now" />
                  <View className="flex-row gap-3 mt-3">
                    {[
                      { label: "Before", date: beforeDate, uri: beforeImage, onError: markFailed },
                      {
                        label: isToday(latest.created_at) ? "Today" : "Latest",
                        date: latest.created_at,
                        uri: latest.image_url,
                        onError: undefined,
                      },
                    ].map((p) => (
                      <View key={p.label} className="flex-1 items-center">
                        <View
                          className="w-full aspect-square rounded-2xl overflow-hidden items-center justify-center"
                          style={{ backgroundColor: theme.colors.background }}
                        >
                          {p.uri ? (
                            <Image
                              key={p.uri}
                              source={{ uri: p.uri }}
                              onError={p.onError ? () => p.onError!(p.uri!) : undefined}
                              className="w-full h-full"
                              resizeMode="cover"
                            />
                          ) : (
                            <Text className="text-xs" style={{ color: theme.colors.faint }}>
                              No photo
                            </Text>
                          )}
                        </View>
                        <Text
                          className="text-sm font-bold mt-2"
                          style={{ color: theme.colors.ink }}
                        >
                          {p.label}
                        </Text>
                        {p.date ? (
                          <Text className="text-xs" style={{ color: theme.colors.faint }}>
                            {shortDate(p.date)}
                          </Text>
                        ) : null}
                      </View>
                    ))}
                  </View>
                </ClinicalCard>
              </FadeItem>
            )}

            {/* 3. Score over time */}
            <FadeItem index={3}>
              <ClinicalCard className="mt-4">
                <SectionTitle title="Your score over time" />
                <Text className="text-xs mt-1" style={{ color: theme.colors.muted }}>
                  Higher is better.
                </Text>
                <ScoreChart points={dailyScores(newestFirst, CHART_DAYS)} />
              </ClinicalCard>
            </FadeItem>

            {/* 4. This week, in plain words */}
            <FadeItem index={4}>
              <LinearGradient
                colors={[...theme.gradients.dark]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                className="py-4 px-4 mt-4"
                style={{ borderRadius: theme.radius.card }}
              >
                <Text className="font-bold text-white text-base">This week</Text>
                <Text className="text-xs mt-1" style={{ color: "#A7C4B2" }}>
                  {weekResults.length === 0
                    ? "You haven't scanned this week yet."
                    : `You scanned ${weekResults.length} ${weekResults.length === 1 ? "time" : "times"} in the last 7 days.`}
                </Text>
                {summaryLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" style={{ marginTop: 10 }} />
                ) : aiSummary ? (
                  <TypewriterText text={aiSummary} className="text-white text-sm mt-2 leading-5" />
                ) : null}
              </LinearGradient>
            </FadeItem>

            {/* 5. Recent scans */}
            <FadeItem index={5}>
              <ClinicalCard className="mt-4">
                <SectionTitle title="Recent scans" />
                <View className="mt-2">
                  {newestFirst.slice(0, 5).map((r, i, arr) => {
                    const s = scoreLabel(r.healthscore);
                    const confirmed = r.validation_status === "confirmed";
                    const flagged = r.validation_status === "needs_review";
                    return (
                      <View
                        key={r.id}
                        className="flex-row items-center gap-3 py-3"
                        style={{
                          borderBottomWidth: i === arr.length - 1 ? 0 : 1,
                          borderBottomColor: theme.colors.divider,
                        }}
                      >
                        <View className="flex-1">
                          <Text className="font-bold text-sm" style={{ color: theme.colors.ink }}>
                            {formatter(r.detection_label ?? r.severity)}
                          </Text>
                          <Text className="text-xs" style={{ color: theme.colors.faint }}>
                            {isToday(r.created_at) ? "Today" : shortDate(r.created_at)}
                          </Text>
                          {confirmed || flagged ? (
                            <Text
                              className="text-xs font-bold mt-0.5"
                              style={{ color: confirmed ? theme.colors.primary : "#B45309" }}
                            >
                              {confirmed ? "Checked by a doctor" : "Doctor wants a follow-up"}
                            </Text>
                          ) : null}
                          {(confirmed || flagged) && r.doctor_notes ? (
                            <Text className="text-xs mt-0.5" style={{ color: theme.colors.body }}>
                              “{r.doctor_notes}”
                            </Text>
                          ) : null}
                        </View>
                        <View className="items-end">
                          <Text className="font-bold text-base" style={{ color: theme.colors.ink }}>
                            {Math.round(r.healthscore)}
                          </Text>
                          <Text className="text-xs font-bold" style={{ color: s.color }}>
                            {s.word}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </ClinicalCard>
            </FadeItem>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
