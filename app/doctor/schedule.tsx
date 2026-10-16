import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { CalendarCheck2, CircleAlert } from "lucide-react-native";

import { FadeItem } from "@/components/FadeItem";
import { DoctorAppointmentCard, SCHEDULER_FALLBACK } from "@/components/DoctorAppointmentCard";
import Skeleton from "@/components/Skeleton";
import { StyledSafeAreaView as SafeAreaView } from "@/components/StyledSafeAreaView";
import { ScreenGradient } from "@/components/ScreenGradient";
import {
  ClinicalCard,
  EmptyState,
  ScreenHeader,
  SectionTitle,
} from "@/components/ui";
import { useDoctorQueue } from "@/hooks/useDoctorQueue";
import { theme } from "@/lib/theme";
import { TAB_BAR_CLEARANCE } from "@/lib/tabs-config";
import {
  patientAvatarFor,
  patientDisplayFor,
  type AppointmentStatus,
} from "@/lib/db/appointments";

export default function DoctorSchedule() {
  const {
    rows,
    patientNames,
    patientAvatars,
    loading,
    refreshing,
    error,
    refresh,
    applyStatus,
  } = useDoctorQueue();

  const [actingId, setActingId] = useState<string | null>(null);

  const handleAction = async (id: string, status: AppointmentStatus) => {
    setActingId(id);
    try {
      await applyStatus(id, status);
    } catch (err) {
      console.error("[doctor/schedule] action failed:", err);
    } finally {
      setActingId(null);
    }
  };

  const scheduled = rows.filter((r) => r.status === "scheduled");

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
            <ScreenHeader
              title="Schedule"
              subtitle="Confirmed visits"
            />
          </View>
        </FadeItem>

        {loading ? (
          <View className="flex-col gap-3 mt-4">
            {[0, 1].map((i) => (
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
        ) : error ? (
          <FadeItem index={2}>
            <ClinicalCard className="mt-4">
              <EmptyState icon={CircleAlert} title="Couldn't load" copy={error} />
            </ClinicalCard>
          </FadeItem>
        ) : (
          <>
            <FadeItem index={2}>
              <View className="mt-5">
                <SectionTitle
                  title="Confirmed visits"
                  meta={`${scheduled.length} total`}
                />
              </View>
            </FadeItem>
            {scheduled.length === 0 ? (
              <FadeItem index={3}>
                <ClinicalCard className="mt-3">
                  <EmptyState
                    icon={CalendarCheck2}
                    title="Nothing scheduled"
                    copy="Confirmed visits will appear here once you schedule requests from Home."
                  />
                </ClinicalCard>
              </FadeItem>
            ) : (
              <View className="flex-col gap-3 mt-3">
                {scheduled.map((a, idx) => (
                  <FadeItem key={a.id} index={Math.min(3 + idx, 8)}>
                    <DoctorAppointmentCard
                      appointment={a}
                      patientName={patientDisplayFor(a, patientNames)}
                      patientAvatarUrl={patientAvatarFor(a, patientAvatars)}
                      expanded={false}
                      busy={actingId === a.id}
                      scheduledDate={SCHEDULER_FALLBACK}
                      onToggleSchedule={() => {}}
                      onScheduledDateChange={() => {}}
                      onAction={(id, status) => void handleAction(id, status)}
                    />
                  </FadeItem>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
