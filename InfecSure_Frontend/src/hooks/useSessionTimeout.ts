import { useMemo } from "react";
import { useAuth } from "./useAuth";

export function useSessionTimeout() {
  const { secondsRemaining, stayLoggedIn } = useAuth();
  return useMemo(
    () => ({
      secondsRemaining,
      showWarning: secondsRemaining > 0 && secondsRemaining <= 120,
      stayLoggedIn
    }),
    [secondsRemaining, stayLoggedIn]
  );
}
