/** Common packaging conventions, never a substitute for the manufacturer's specification. */
export interface CartridgeExplanation {
  code: string;
  supported: boolean;
  diameterMm: number | null;
  count: number | null;
  configuration: string | null;
  label: string;
  explanation: string;
  warning?: string;
}

const diameters: Record<string, number> = { "06": 0.2, "08": 0.25, "10": 0.3, "12": 0.35 };
const configurations: Record<string, string> = {
  RL: "round liner", RS: "round shader", M1: "weaved magnum",
  M2: "stacked magnum", RM: "curved / round magnum", CM: "curved magnum", F: "flat",
};

export function parseCartridge(input: string): CartridgeExplanation {
  const code = input.trim().toUpperCase();
  const match = /^(\d{2})(\d{2})(RL|RS|M1|M2|RM|CM|F)$/.exec(code);
  const warning = "Common code convention only. Verify the brand's packaging; taper, grouping, membrane and compatibility are not established by this code. A code or photo cannot establish sterility.";
  if (!match || !diameters[match[1]] || Number(match[2]) < 1 || Number(match[2]) > 49) {
    return { code, supported: false, diameterMm: null, count: null, configuration: null,
      label: "Unsupported or ambiguous code",
      explanation: "Use a complete conventional code such as 1203RL, 1205M1 or 1007RM. Confirm nonstandard formats with the manufacturer rather than guessing.", warning };
  }
  const diameterMm = diameters[match[1]];
  const count = Number(match[2]);
  const configuration = configurations[match[3]];
  return { code, supported: true, diameterMm, count, configuration,
    label: `${count}-point ${configuration} · nominal ${diameterMm.toFixed(2)} mm`,
    explanation: `${match[1]} commonly indicates a nominal ${diameterMm.toFixed(2)} mm individual needle diameter; ${match[2]} indicates ${count} needles; ${match[3]} indicates ${configuration}. This interprets a convention, not a verified specification.`, warning };
}
