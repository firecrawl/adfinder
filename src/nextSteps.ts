import { createContext } from "react";

// Set by the brand page, so an empty or failed section can offer what to do next.
export const NextSteps = createContext<{
  retry: () => void;
  worldwide: (() => void) | null;
} | null>(null);
