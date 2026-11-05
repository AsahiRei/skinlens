import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import NetInfo, { type NetInfoState } from "@react-native-community/netinfo";

type NetworkContextValue = {
  isConnected: boolean;
  isInternetReachable: boolean | null;
};

const NetworkContext = createContext<NetworkContextValue>({
  isConnected: true,
  isInternetReachable: true,
});

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NetworkContextValue>({
    isConnected: true,
    isInternetReachable: true,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((info: NetInfoState) => {
      const isConnected = info.isConnected ?? false;
      const isInternetReachable = info.isInternetReachable;
      // NetInfo fires for every interface/details change (signal strength,
      // SSID, cellular generation…). Returning the previous object when the
      // two fields we expose are unchanged keeps every consumer from
      // re-rendering on each of those events.
      setState((prev) =>
        prev.isConnected === isConnected &&
        prev.isInternetReachable === isInternetReachable
          ? prev
          : { isConnected, isInternetReachable },
      );
    });
    return () => unsubscribe();
  }, []);

  return (
    <NetworkContext.Provider value={state}>{children}</NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  return useContext(NetworkContext);
}
