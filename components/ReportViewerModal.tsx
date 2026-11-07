import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, View } from "react-native";
import Pdf from "react-native-pdf";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Share2, X } from "lucide-react-native";

import { Text } from "@/components/Text";
import { theme } from "@/lib/theme";
import { downloadAppointmentReport, shareReportFile } from "@/utils/report";

type LoadState =
  { kind: "loading" } | { kind: "ready"; uri: string } | { kind: "error"; message: string };

/** Full-screen in-app viewer for an appointment's Skin Report PDF. */
export function ReportViewerModal({
  reportPath,
  onClose,
  title = "Skin Report",
}: {
  reportPath: string | null;
  onClose: () => void;
  title?: string;
}) {
  const insets = useSafeAreaInsets();
  const [attempt, setAttempt] = useState(0);
  // Results are tagged with the request they belong to, so a new path or a
  // retry reads as "loading" until its own download settles.
  const requestKey = reportPath ? `${reportPath}#${attempt}` : null;
  const [result, setResult] = useState<
    { key: string; uri: string } | { key: string; error: string } | null
  >(null);
  const [page, setPage] = useState({ current: 1, total: 0 });
  const [sharing, setSharing] = useState(false);

  const state: LoadState =
    !result || result.key !== requestKey
      ? { kind: "loading" }
      : "uri" in result
        ? { kind: "ready", uri: result.uri }
        : { kind: "error", message: result.error };

  useEffect(() => {
    if (!reportPath || !requestKey) return;
    let cancelled = false;
    downloadAppointmentReport(reportPath)
      .then((uri) => {
        if (!cancelled) setResult({ key: requestKey, uri });
      })
      .catch((err) => {
        console.warn("[report-viewer] download failed:", err);
        if (!cancelled) {
          setResult({
            key: requestKey,
            error: err instanceof Error ? err.message : "Couldn't open the report PDF.",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [reportPath, requestKey]);

  const handleShare = async () => {
    if (state.kind !== "ready" || sharing) return;
    setSharing(true);
    try {
      await shareReportFile(state.uri);
    } catch (err) {
      console.warn("[report-viewer] share failed:", err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal
      visible={reportPath !== null}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View className="flex-1" style={{ backgroundColor: theme.colors.background }}>
        {/* Header */}
        <View
          className="flex-row items-center gap-2 px-4 pb-3"
          style={{
            paddingTop: insets.top + 8,
            backgroundColor: theme.colors.card,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.cardBorder,
          }}
        >
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close report"
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: theme.colors.background }}
          >
            <X size={20} color={theme.colors.ink} />
          </Pressable>
          <View className="flex-1">
            <Text
              className="font-bold text-[16px]"
              style={{ color: theme.colors.ink }}
              numberOfLines={1}
            >
              {title}
            </Text>
            {state.kind === "ready" && page.total > 0 ? (
              <Text className="text-xs" style={{ color: theme.colors.muted }}>
                Page {page.current} of {page.total}
              </Text>
            ) : null}
          </View>
          <Pressable
            onPress={() => void handleShare()}
            disabled={state.kind !== "ready" || sharing}
            accessibilityRole="button"
            accessibilityLabel="Share report"
            hitSlop={8}
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{
              backgroundColor: theme.colors.primarySoft,
              opacity: state.kind === "ready" && !sharing ? 1 : 0.4,
            }}
          >
            <Share2 size={18} color={theme.colors.primary} />
          </Pressable>
        </View>

        {/* Body */}
        {state.kind === "ready" ? (
          <Pdf
            source={{ uri: state.uri }}
            style={{ flex: 1, backgroundColor: theme.colors.background }}
            trustAllCerts={false}
            onLoadComplete={(total) => setPage({ current: 1, total })}
            onPageChanged={(current, total) => setPage({ current, total })}
            onError={(err) => {
              console.warn("[report-viewer] render failed:", err);
              if (requestKey) {
                setResult({ key: requestKey, error: "This report couldn't be displayed." });
              }
            }}
            renderActivityIndicator={() => <ActivityIndicator color={theme.colors.primary} />}
          />
        ) : state.kind === "loading" ? (
          <View className="flex-1 items-center justify-center gap-3">
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text className="text-[13px]" style={{ color: theme.colors.muted }}>
              Loading report…
            </Text>
          </View>
        ) : (
          <View className="flex-1 items-center justify-center gap-4 px-8">
            <Text className="text-[14px] text-center" style={{ color: theme.colors.body }}>
              {state.message}
            </Text>
            <Pressable
              onPress={() => setAttempt((n) => n + 1)}
              accessibilityRole="button"
              className="rounded-full px-5 py-2.5 active:opacity-80"
              style={{ backgroundColor: theme.colors.primary }}
            >
              <Text className="font-bold text-white text-[14px]">Try again</Text>
            </Pressable>
          </View>
        )}
      </View>
    </Modal>
  );
}
