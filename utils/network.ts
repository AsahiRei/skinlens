import NetInfo from "@react-native-community/netinfo";

/**
 * One-shot connectivity check for non-React code. Lets offline paths skip network calls that would
 * otherwise sit until the fetch timeout before failing.
 */
export async function isOnlineNow(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return state.isConnected !== false && state.isInternetReachable !== false;
  } catch {
    // NetInfo unavailable — assume online and let the request decide.
    return true;
  }
}
