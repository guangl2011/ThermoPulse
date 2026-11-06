import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// Auto-cleanup hooks into Vitest's global afterEach, which does not exist
// without `globals: true` — register it explicitly instead.
afterEach(() => {
  cleanup();
});
