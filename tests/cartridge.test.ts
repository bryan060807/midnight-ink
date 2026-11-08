import { describe, expect, it } from "vitest";
import { parseCartridge } from "../src/lib/cartridge";

describe("common cartridge conventions", () => {
  it.each([
    ["1203RL", 0.35, 3, "round liner"],
    ["1205RL", 0.35, 5, "round liner"],
    ["1205M1", 0.35, 5, "weaved magnum"],
    ["1007RM", 0.3, 7, "curved / round magnum"],
  ])("interprets %s without verifying the brand", (code, diameterMm, count, configuration) => {
    const result = parseCartridge(String(code));
    expect(result).toMatchObject({ supported: true, diameterMm, count, configuration });
    expect(result.warning).toContain("cannot establish sterility");
    expect(result.explanation).toContain("not a verified specification");
  });
  it.each(["", "1200RL", "1205", "9905RL", "1205XX", "1205RL<script>", "123456RM"]) ("does not invent unsupported specifications for %s", code => {
    expect(parseCartridge(code)).toMatchObject({ supported: false, diameterMm: null, count: null, configuration: null });
  });
  it("normalizes whitespace and case", () => {
    expect(parseCartridge(" 1205m1 ").code).toBe("1205M1");
  });
});
