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
import { ChevronDown, FileText } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import Skeleton from "@/components/Skeleton";
import { BackHeader, ClinicalCard, EmptyState, SectionTitle } from "@/components/ui";
import { theme } from "@/lib/theme";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { useFocusTrigger } from "@/hooks/useFocusTrigger";
import { getAllResults, getUserProfile, refreshAllResults } from "@/lib/db";
import { isOnlineNow } from "@/utils/network";
import type { Result } from "@/types/schema";
import type { Severity } from "@/types/health";
import { formatter } from "@/utils/formatter";
import { exportSkinReport } from "@/utils/report";
import { isPhotoBasedResult } from "@/utils/result-kind";
import { ScreenGradient } from "@/components/ScreenGradient";
import { SCORE_BANDS, bandFor, explainScore } from "@/utils/score-guide";

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
  return new Date(toTime(dateStr)).toDateString() === new Date().toDateString();
}

const AMBER = "#B45309";

// Within normal scan-to-scan noise.
const STEADY_RANGE = 2;

type Trend = "up" | "down" | "same";

function trendOf(change: number): Trend {
  if (change > STEADY_RANGE) return "up";
  if (change < -STEADY_RANGE) return "down";
  return "same";
}

const TREND_STYLE: Record<Trend, { color: string; bg: string }> = {
  up: { color: theme.colors.primary, bg: theme.colors.primarySoft },
  down: { color: theme.colors.danger, bg: "#FEE2E2" },
  same: { color: theme.colors.muted, bg: "#F3F4F6" },
};

const TREND_COPY: Record<Trend | "start", { headline: string; advice: string }> = {
  up: {
    headline: "Your skin is improving",
    advice: "Keep doing what you're doing. Your routine is working.",
  },
  down: {
    headline: "Your skin needs a bit more care",
    advice:
      "Stick to your routine and avoid new products for now. If it keeps dropping, talk to a dermatologist.",
  },
  same: {
    headline: "Your skin is holding steady",
    advice: "No big change yet. Skin takes 4–6 weeks to show results, so stay consistent.",
  },
  start: {
    headline: "This is your starting point",
    advice: "Scan again on another day and we'll show you how your skin is changing.",
  },
};

function signed(n: number): string {
  return n === 0 ? "0" : `${n > 0 ? "+" : "−"}${Math.abs(n)}`;
}

// Lowest band first so the bar reads 0 → 100.
const ZONES = [...SCORE_BANDS].reverse();
const TICKS = [0, ...ZONES.slice(1).map((z) => z.min), 100];

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  return (
    <View className="mt-4">
      <View className="h-6 justify-center">
        <View className="flex-row h-2.5 rounded-full overflow-hidden">
          {ZONES.map((z) => (
            <View
              key={z.severity}
              style={{ flex: z.max + 1 - z.min, backgroundColor: z.color, opacity: 0.3 }}
            />
          ))}
        </View>
        <View
          className="absolute h-6 w-6 rounded-full"
          style={{
            left: `${pct}%`,
            marginLeft: -12,
            backgroundColor: theme.colors.card,
            borderWidth: 4,
            borderColor: bandFor(pct).color,
          }}
        />
      </View>
      <View className="h-4 mt-1">
        {TICKS.map((t) => (
          <Text
            key={t}
            className="absolute text-[11px]"
            style={{
              color: theme.colors.faint,
              width: 28,
              left: `${t}%`,
              marginLeft: t === 0 ? 0 : t === 100 ? -28 : -14,
              textAlign: t === 0 ? "left" : t === 100 ? "right" : "center",
            }}
          >
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

function GuideList({ title, items, color }: { title: string; items: string[]; color: string }) {
  return (
    <View className="mt-3">
      <Text className="text-xs font-bold uppercase" style={{ color: theme.colors.faint }}>
        {title}
      </Text>
      {items.map((item) => (
        <View key={item} className="flex-row mt-1.5 pr-2">
          <Text className="text-sm leading-5 mr-2" style={{ color }}>
            •
          </Text>
          <Text className="text-sm leading-5 flex-1" style={{ color: theme.colors.body }}>
            {item}
          </Text>
        </View>
      ))}
    </View>
  );
}

function ScoreGuide({ score }: { score: number }) {
  const current = bandFor(score).severity;
  const [open, setOpen] = useState<Severity | null>(current);
  return (
    <View className="mt-2">
      {SCORE_BANDS.map((b, i) => {
        const isOpen = open === b.severity;
        const isYou = current === b.severity;
        return (
          <View
            key={b.severity}
            style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: theme.colors.divider }}
          >
            <Pressable
              onPress={() => setOpen(isOpen ? null : b.severity)}
              className="flex-row items-center gap-3 py-3 active:opacity-70"
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${b.min} to ${b.max}, ${b.label}${isYou ? ", your score" : ""}`}
            >
              <View
                className="rounded-full px-2.5 py-1 items-center"
                style={{ backgroundColor: b.soft, minWidth: 64 }}
              >
                <Text className="text-xs font-bold" style={{ color: b.color }}>
                  {b.min}–{b.max}
                </Text>
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold" style={{ color: b.color }}>
                  {b.label}
                  {isYou ? (
                    <Text style={{ color: theme.colors.ink }}>{"  · You are here"}</Text>
                  ) : null}
                </Text>
                <Text className="text-xs mt-0.5 leading-4" style={{ color: theme.colors.muted }}>
                  {b.meaning}
                </Text>
              </View>
              <ChevronDown
                size={18}
                color={theme.colors.faint}
                style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}
              />
            </Pressable>
            {isOpen ? (
              <View
                className="mb-3 rounded-2xl px-3.5 pb-3.5 pt-0.5"
                style={{ backgroundColor: b.soft }}
              >
                <GuideList title="What it usually looks like" items={b.looksLike} color={b.color} />
                <GuideList title="Common causes" items={b.triggers} color={b.color} />
                <GuideList title="What to do" items={b.todo} color={b.color} />
              </View>
            ) : null}
          </View>
        );
      })}
      <Text className="text-xs mt-1 leading-4" style={{ color: theme.colors.faint }}>
        Your score comes from your photo (60%) and your check-in answers (40%). It is a guide, not a
        diagnosis.
      </Text>
    </View>
  );
}

function ChangeChip({ change, since }: { change: number; since: string }) {
  const trend = trendOf(change);
  const t = TREND_STYLE[trend];
  return (
    <View className="rounded-full px-3 py-1.5 self-start" style={{ backgroundColor: t.bg }}>
      <Text className="text-xs font-bold" style={{ color: t.color }}>
        {trend === "same" ? "About the same" : `${signed(change)} points`}
        <Text style={{ fontWeight: "normal" }}>{` since ${since}`}</Text>
      </Text>
    </View>
  );
}

export default function Progress() {
  const router = useRouter();
  const focusTrigger = useFocusTrigger();
  const [results, setResults] = useState<Result[]>([]);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

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

  // Only photo-graded results form the trend: an answers-only setup score measures something else
  // and would make the first real scan look like an improvement or a decline.
  const newestFirst = results
    .filter(isPhotoBasedResult)
    .sort((a, b) => toTime(b.created_at) - toTime(a.created_at));
  const latest = newestFirst[0] ?? null;
  const first = newestFirst[newestFirst.length - 1] ?? null;
  const hasTwo = latest && first && latest.id !== first.id;
  const change = hasTwo ? Math.round(latest.healthscore - first.healthscore) : 0;

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

  const { headline, advice } = TREND_COPY[hasTwo ? trendOf(change) : "start"];
  const band = bandFor(latest?.healthscore ?? 0);
  const why = latest ? explainScore(latest.healthscore, latest.detection_label) : null;
  const photos = hasTwo
    ? [
        {
          label: "Before",
          date: beforeDate,
          uri: beforeImage,
          score: beforeScan?.healthscore ?? first.healthscore,
        },
        {
          label: isToday(latest.created_at) ? "Today" : "Now",
          date: latest.created_at,
          uri: latest.image_url,
          score: latest.healthscore,
        },
      ]
    : [];

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
            <FadeItem index={1}>
              <ClinicalCard className="mt-4">
                <Text
                  className="text-[20px] font-bold leading-7"
                  style={{ color: theme.colors.ink }}
                >
                  {headline}
                </Text>
                <Text className="text-sm mt-1 leading-5" style={{ color: theme.colors.body }}>
                  {advice}
                </Text>

                <View
                  className="mt-4 pt-4"
                  style={{ borderTopWidth: 1, borderTopColor: theme.colors.divider }}
                >
                  <Text
                    className="text-xs font-bold uppercase"
                    style={{ color: theme.colors.faint }}
                  >
                    Latest skin score
                  </Text>
                  <View className="flex-row items-end justify-between mt-1">
                    <Text
                      style={{
                        fontSize: 44,
                        lineHeight: 50,
                        fontWeight: "bold",
                        color: theme.colors.ink,
                      }}
                    >
                      {Math.round(latest.healthscore)}
                      <Text
                        style={{ fontSize: 16, fontWeight: "normal", color: theme.colors.faint }}
                      >
                        {" / 100"}
                      </Text>
                    </Text>
                    <Text className="text-base font-bold mb-2" style={{ color: band.color }}>
                      {band.label}
                    </Text>
                  </View>
                  <ScoreBar score={latest.healthscore} />
                  {why ? (
                    <Text className="text-sm mt-3 leading-5" style={{ color: theme.colors.body }}>
                      {why}
                    </Text>
                  ) : null}
                  {hasTwo ? (
                    <View className="mt-4">
                      <ChangeChip change={change} since={shortDate(first.created_at)} />
                    </View>
                  ) : null}
                </View>
              </ClinicalCard>
            </FadeItem>

            <FadeItem index={2}>
              <ClinicalCard className="mt-4">
                <SectionTitle title="What your score means" meta="Tap a range" />
                <ScoreGuide score={latest.healthscore} />
              </ClinicalCard>
            </FadeItem>

            {hasTwo && (
              <FadeItem index={3}>
                <ClinicalCard className="mt-4">
                  <SectionTitle title="Before and now" />
                  <View className="flex-row gap-3 mt-3">
                    {photos.map((p) => {
                      const b = bandFor(p.score);
                      return (
                        <View key={p.label} className="flex-1 items-center">
                          <View
                            className="w-full aspect-square rounded-2xl overflow-hidden items-center justify-center"
                            style={{ backgroundColor: theme.colors.background }}
                          >
                            {p.uri ? (
                              <Image
                                key={p.uri}
                                source={{ uri: p.uri }}
                                onError={() => markFailed(p.uri!)}
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
                            {p.date ? (
                              <Text style={{ fontWeight: "normal", color: theme.colors.faint }}>
                                {` · ${shortDate(p.date)}`}
                              </Text>
                            ) : null}
                          </Text>
                          <Text className="text-xs font-bold mt-0.5" style={{ color: b.color }}>
                            {Math.round(p.score)} · {b.label}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </ClinicalCard>
              </FadeItem>
            )}

            <FadeItem index={4}>
              <ClinicalCard className="mt-4">
                <SectionTitle title="Scan history" meta="vs. previous scan" />
                <View className="mt-2">
                  {newestFirst.slice(0, 5).map((r, i, arr) => {
                    const b = bandFor(r.healthscore);
                    const prev = newestFirst[i + 1];
                    const delta = prev ? Math.round(r.healthscore - prev.healthscore) : null;
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
                        <View
                          className="h-12 w-12 rounded-full items-center justify-center"
                          style={{ borderWidth: 3, borderColor: b.color }}
                        >
                          <Text className="font-bold text-base" style={{ color: theme.colors.ink }}>
                            {Math.round(r.healthscore)}
                          </Text>
                        </View>

                        <View className="flex-1">
                          <Text className="font-bold text-sm" style={{ color: theme.colors.ink }}>
                            {isToday(r.created_at) ? "Today" : shortDate(r.created_at)}
                            <Text
                              style={{ fontWeight: "normal", color: b.color }}
                            >{` · ${b.label}`}</Text>
                          </Text>
                          <Text className="text-xs mt-0.5" style={{ color: theme.colors.muted }}>
                            {formatter(r.detection_label ?? r.severity)}
                          </Text>
                          {confirmed || flagged ? (
                            <Text
                              className="text-xs font-bold mt-0.5"
                              style={{ color: confirmed ? theme.colors.primary : AMBER }}
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

                        {delta === null ? (
                          <Text className="text-xs" style={{ color: theme.colors.faint }}>
                            First scan
                          </Text>
                        ) : (
                          <View
                            className="rounded-full px-2.5 py-1"
                            style={{ backgroundColor: TREND_STYLE[trendOf(delta)].bg }}
                          >
                            <Text
                              className="text-xs font-bold"
                              style={{ color: TREND_STYLE[trendOf(delta)].color }}
                            >
                              {signed(delta)}
                            </Text>
                          </View>
                        )}
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
