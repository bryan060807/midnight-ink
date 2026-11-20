import { describe, expect, it } from "vitest";
import { academyLabs } from "../src/lib/academy-labs";
import { exercises, lessons } from "../src/lib/curriculum";
import { worksheetSvg } from "../src/lib/worksheets";

describe("Academy practical labs", () => {
  const exerciseIds = new Set(exercises.map(exercise => exercise.id));
  const lessonIds = new Set(lessons.map(lesson => lesson.id));
  const linkedLessons: Record<string, string> = {
    "academy-setup": "controls-workspace",
    "academy-lines": "straight-lines",
    "academy-shapes": "circles-corners",
    "academy-blackwork": "solid-fill",
    "academy-stencil": "transfer-practice",
    "academy-capstone": "original-motifs",
  };

  it("provides six distinct beginner-usable labs with substantive stage checkpoints", () => {
    expect(academyLabs).toHaveLength(6);
    expect(new Set(academyLabs.map(lab => lab.id)).size).toBe(6);
    for (const lab of academyLabs) {
      expect(lab.steps.length).toBeGreaterThanOrEqual(5);
      expect(lab.objectives.length).toBeGreaterThanOrEqual(2);
      expect(lab.review.length).toBeGreaterThanOrEqual(2);
      expect(lab.equipment.length).toBeGreaterThan(0);
      expect(lab.watchFor.length).toBeGreaterThan(0);
      expect(lab.question.length).toBeGreaterThan(20);
      expect(lab.answer.length).toBeGreaterThan(20);
      for (const step of lab.steps) {
        expect(step.action.length).toBeGreaterThan(40);
        expect(step.checkpoint.length).toBeGreaterThan(25);
      }
    }
  });

  it("links only to already seeded curriculum and working practice exercises", () => {
    expect(Object.keys(linkedLessons).sort()).toEqual(academyLabs.map(lab => lab.id).sort());
    for (const lab of academyLabs) {
      expect(lessonIds.has(linkedLessons[lab.id])).toBe(true);
      if (lab.exerciseId !== null) expect(exerciseIds.has(lab.exerciseId)).toBe(true);
      for (const worksheetId of lab.worksheetIds) {
        expect(exerciseIds.has(worksheetId)).toBe(true);
        const worksheet = worksheetSvg(worksheetId);
        expect(worksheet).toContain('width="210mm"');
        expect(worksheet).toContain("PAPER + SYNTHETIC PRACTICE ONLY");
      }
    }
  });

  it("explicitly separates machine familiarization and human-skin readiness", () => {
    expect(academyLabs[0].exerciseId).toBeNull();
    const combined = academyLabs.map(lab => [lab.overview, ...lab.watchFor].join(" ")).join(" ");
    expect(combined).toMatch(/human|professional|licensing/i);
    expect(combined).toMatch(/synthetic/i);
  });
});
