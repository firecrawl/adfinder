import { createContext, useContext } from "react";
import type { Me } from "./api";

type SessionValue = {
  me: Me | null;
  refresh: () => Promise<void>;
  openSignIn: (mode?: "signin" | "key") => void;
};

export const SessionContext = createContext<SessionValue>({
  me: null,
  refresh: async () => {},
  openSignIn: () => {},
});
export const useSession = () => useContext(SessionContext);
