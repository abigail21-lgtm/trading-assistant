import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "./safe-redirect";

describe("safeRedirectPath", () => {
  it("keeps paths on this site", () => {
    expect(safeRedirectPath("/stock/AMD/setup")).toBe("/stock/AMD/setup");
    expect(safeRedirectPath("/signals?x=1#top")).toBe("/signals?x=1#top");
    expect(safeRedirectPath(null)).toBe("/");
  });

  it("rejects other sites and script URLs", () => {
    for (const bad of [
      "javascript:alert(document.cookie)",
      " javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "https://evil.example/login",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "\\\\evil.example",
      "evil.example",
    ]) {
      expect(safeRedirectPath(bad), bad).toBe("/");
    }
  });
});
