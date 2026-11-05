import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, TextInput, View } from "react-native";
import { Text } from "@/components/Text";
import { CircleAlert, Search } from "lucide-react-native";
import { FadeItem } from "@/components/FadeItem";
import { DoctorAppointmentCard } from "@/components/DoctorAppointmentCard";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  ClinicalCard,
  EmptyState,
  Notice,
  ScreenHeader,
  SectionTitle,
} from "@/components/ui";
import { useDoctorQueue } from "@/hooks/useDoctorQueue";
import { theme } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import {
  patientAvatarFor,
  patientDisplayFor,
} from "@/lib/db/appointments";

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function DoctorHistory() {
  const {
    doctor,
    rows,
    patientNames,
    patientAvatars,
    loading,
    refreshing,
    error,
    refresh,
  } = useDoctorQueue();

  const [quickFilter, setQuickFilter] = useState<"all" | "completed" | "cancelled" | "declined">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const history = useMemo(() =>
    rows.filter(
      (r) => r.status === "completed" || r.status === "cancelled" || r.status === "declined"
    ),
    [rows]
  );

  const matchesQuickFilter = (r: typeof rows[0]) => {
    if (quickFilter === "all") return true;
    return r.status === quickFilter;
  };

  const matchesSearch = (r: typeof rows[0]) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const patientName = patientDisplayFor(r, patientNames).toLowerCase();
    const status = r.status.toLowerCase();
    const clinicName = doctor?.clinicName?.toLowerCase() ?? "";
    return patientName.includes(query) || status.includes(query) || clinicName.includes(query);
  };

  const filteredHistory = history.filter(
    (r) => matchesQuickFilter(r) && matchesSearch(r)
  );

  const groupedHistory = useMemo(() => {
    const groups: Record<string, typeof history> = {};
    for (const r of filteredHistory) {
      const iso = r.scheduled_at ?? r.preferred_time;
      const label = iso ? formatDate(new Date(iso)) : "Unscheduled";
      if (!groups[label]) groups[label] = [];
      groups[label].push(r);
    }
    return groups;
  }, [filteredHistory]);

  const groupLabels = Object.keys(groupedHistory).sort((a, b) => {
    if (a === "Unscheduled") return 1;
    if (b === "Unscheduled") return -1;
    return new Date(b).getTime() - new Date(a).getTime();
  });

  const skeleton = (
    <View className="flex-col gap-3 mt-3">
      {[0, 1, 2].map((i) => (
        <ClinicalCard key={i} className="flex-col gap-3">
          <View className="flex-row items-center gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <View className="flex-1 gap-1.5">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-44 rounded-md" />
            </View>
            <Skeleton className="h-6 w-20 rounded-full" />
          </View>
          <Skeleton className="h-11 w-full rounded-full" />
        </ClinicalCard>
      ))}
    </View>
  );

  return (
    <SafeAreaView edges={["top"]} className="flex-1" style={{ backgroundColor: theme.colors.background }}>
      <ScreenGradient />
      <ScrollView
        className="flex-1 px-5"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_CLEARANCE }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Header */}
        <FadeItem index={0}>
          <View className="mt-2">
            <ScreenHeader title="History" subtitle="Past visits" />
          </View>
        </FadeItem>

        {actionError ? (
          <FadeItem index={0.5}>
            <View className="mt-3">
              <Notice icon={CircleAlert} copy={actionError} />
            </View>
          </FadeItem>
        ) : null}

        {/* Search */}
        <FadeItem index={1}>
          <View className="flex-row items-center gap-2 mt-4 px-4 py-3 rounded-2xl bg-white"
            style={{ borderWidth: 1, borderColor: theme.colors.cardBorder }}>
            <Search size={18} color={theme.colors.faint} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by patient name, status..."
              placeholderTextColor={theme.colors.faint}
              className="flex-1 text-base"
              style={{ color: theme.colors.ink }}
              autoCapitalize="none"
            />
          </View>
        </FadeItem>

        
        {/* Filter status / outcome chips */}
        <FadeItem index={3}>
          <View className="flex-row gap-2 mt-3 flex-wrap">
            {(["all", "completed", "cancelled", "declined"] as const).map((f) => {
              const active = quickFilter === f;
              const label =
                f === "all" ? "All Visits"
                : f === "completed" ? "Completed"
                : f === "cancelled" ? "Cancelled"
                : "Declined";
              return (
                <Pressable
                  key={f}
                  onPress={() => setQuickFilter(f)}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by ${label}`}
                  accessibilityState={active ? { selected: true } : {}}
                  className="rounded-full px-3.5 py-1.5 active:opacity-70"
                  style={{
                    backgroundColor: active ? theme.colors.primarySoft : theme.colors.card,
                    borderWidth: 1,
                    borderColor: active ? theme.colors.primary : theme.colors.cardBorder,
                  }}
                >
                  <Text
                    className="text-xs font-bold"
                    style={{ color: active ? theme.colors.primaryDeep : theme.colors.muted }}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </FadeItem>

        {loading ? (
          skeleton
        ) : error ? (
          <FadeItem index={4}>
            <ClinicalCard className="mt-4">
              <EmptyState title="Couldn't load" copy={error} />
            </ClinicalCard>
          </FadeItem>
        ) : filteredHistory.length === 0 ? (
          <FadeItem index={4}>
            <ClinicalCard className="mt-6">
              <EmptyState
                title="No history found"
                copy={
                  quickFilter !== "all"
                    ? "No past visits match this filter. Tap 'All' to see everything."
                    : searchQuery
                      ? "No visits match your search. Try a different term."
                      : "Completed, cancelled, and declined visits will appear here."
                }
              />
            </ClinicalCard>
          </FadeItem>
        ) : (
          <>
            {groupLabels.map((label) => (
              <View key={label} className="mt-4 flex-col gap-3">
                <SectionTitle title={label} meta={`${groupedHistory[label].length} visit${groupedHistory[label].length !== 1 ? "s" : ""}`} />
                <View className="flex-col gap-3">
                  {groupedHistory[label].map((a) => (
                    <DoctorAppointmentCard
                      key={a.id}
                      appointment={a}
                      patientName={patientDisplayFor(a, patientNames)}
                      patientAvatarUrl={patientAvatarFor(a, patientAvatars)}
                      compact
                      onAction={async () => {}}
                    />
                  ))}
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}