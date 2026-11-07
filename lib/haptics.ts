/**
 * Thin, fire-and-forget wrapper around expo-haptics.
 *
 * Vocabulary (keep it small so each feel means one thing):
 *  - selection(): moving between options (segmented controls, pickers).
 *  - tap():       toggling something on (checking a step).
 *  - soft():      toggling something off.
 *  - success():   finishing a set (every step of a routine done).
 *  - error():     an action the user took was rolled back.
 *
 * Calls never throw and never block: unsupported platforms (web, devices
 * without a haptic engine) simply do nothing. The OS-level haptics setting
 * is respected by the system itself.
 */
import * as Haptics from "expo-haptics";

const fire = (p: Promise<void>) => {
  p.catch(() => {});
};

export const haptics = {
  selection: () => fire(Haptics.selectionAsync()),
  tap: () => fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  soft: () => fire(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft)),
  success: () => fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  error: () => fire(Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
