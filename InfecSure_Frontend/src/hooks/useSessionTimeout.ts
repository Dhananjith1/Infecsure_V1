import { useMemo } from "react";
import { useAuth } from "./useAuth";

export function useSessionTimeout() {
  const { secondsRemaining, sessionRefreshPending, stayLoggedIn } = useAuth();
  return useMemo(
    () => ({
      secondsRemaining,
      showWarning: secondsRemaining > 0 && secondsRemaining <= 120,
      sessionRefreshPending,
      stayLoggedIn
    }),
    [secondsRemaining, sessionRefreshPending, stayLoggedIn]
  );
}
