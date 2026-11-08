import { exercises } from "./curriculum";

const esc = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
const text = (x: number, y: number, value: string, size = 13, color = "#222") => `<text x="${x}" y="${y}" font-size="${size}" fill="${color}">${esc(value)}</text>`;
const path = (d: string, dashed = false) => `<path d="${d}" fill="none" stroke="#a1a1a1" stroke-width="1.5"${dashed ? ' stroke-dasharray="5 5"' : ""}/>`;
const dot = (x: number, y: number) => `<circle cx="${x}" cy="${y}" r="2.4" fill="#5b5b5b"/>`;

/** Original A4 vector worksheet. Returns only app-authored SVG; user content is not interpolated. */
export function worksheetSvg(exerciseId: string): string {
  const exercise = exercises.find((entry) => entry.id === exerciseId);
  if (!exercise) throw new Error("Unknown exercise");
  let guides = "";
  if (exerciseId === "straight-lines") {
    guides += text(48, 245, "Plan endpoints · rehearse above the sheet · draw each line once");
    for (let row = 0; row < 10; row++) {
      const y = 290 + row * 47;
      guides += dot(60, y) + dot(310, y) + dot(420, y) + dot(710, y);
      if (row < 3) guides += path(`M60 ${y}H310 M420 ${y}H710`, true);
    }
  } else if (exerciseId === "parallel-lines") {
    guides += text(48, 245, "Guided set on the left · plan your own equally spaced set on the right");
    for (let row = 0; row < 3; row++) {
      const y = 300 + row * 170;
      for (let line = 0; line < 5; line++) {
        guides += path(`M60 ${y + line * 22}H330`, true) + dot(60, y + line * 22) + dot(330, y + line * 22);
      }
      guides += path(`M420 ${y}V${y + 100} M720 ${y}V${y + 100}`, true);
    }
  } else if (exerciseId === "circles") {
    guides += text(48, 245, "Rehearse the full contour · draw once · mark and inspect the closure");
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const cx = 155 + column * 240;
        const cy = 345 + row * 170;
        guides += `<circle cx="${cx}" cy="${cy}" r="58" fill="none" stroke="#b0b0b0" stroke-dasharray="5 6"/>` + dot(cx + 58, cy);
      }
    }
  } else if (exerciseId === "s-curves") {
    guides += text(48, 245, "Keep the center transition open · rotate the page before drawing if needed");
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const x = 100 + column * 240;
        const y = 295 + row * 175;
        guides += path(`M${x} ${y} C${x + 190} ${y - 25} ${x - 20} ${y + 145} ${x + 155} ${y + 115}`, true) + dot(x, y) + dot(x + 155, y + 115);
      }
    }
  } else if (exerciseId === "corners") {
    guides += text(48, 245, "Plan each segment · inspect overshoot, gaps, and rounding separately");
    for (let row = 0; row < 3; row++) {
      for (let column = 0; column < 3; column++) {
        const x = 80 + column * 245;
        const y = 300 + row * 170;
        guides += path(column === 1 ? `M${x} ${y + 100} L${x + 85} ${y} L${x + 165} ${y + 100}` : `M${x} ${y} L${x + 150} ${y} L${x + 150} ${y + 100}`, true);
        guides += dot(column === 1 ? x + 85 : x + 150, y);
      }
    }
  } else if (exerciseId === "solid-fills") {
    guides += text(48, 245, "Plan small sections · judge interior coverage and boundaries independently");
    for (let row = 0; row < 3; row++) {
      const y = 290 + row * 170;
      guides += `<rect x="60" y="${y}" width="280" height="110" fill="none" stroke="#777"/>`;
      guides += path(`M130 ${y}V${y + 110} M200 ${y}V${y + 110} M270 ${y}V${y + 110}`, true);
      guides += path(`M470 ${y + 110} Q380 ${y + 25} 500 ${y} Q650 ${y - 10} 720 ${y + 110}Z`);
    }
  } else if (exerciseId === "gradients") {
    guides += text(48, 245, "Pencil study · reserve the light zone · compare bands and transition width");
    for (let row = 0; row < 3; row++) {
      const y = 295 + row * 170;
      guides += text(60, y - 14, "DARK") + text(350, y - 14, "MIDDLE") + text(665, y - 14, "LIGHT");
      guides += `<rect x="60" y="${y}" width="670" height="110" fill="none" stroke="#777"/>`;
      guides += path(`M283 ${y}V${y + 110} M506 ${y}V${y + 110}`, true);
    }
  } else {
    guides += text(48, 245, "Original geometric-leaf motif · check orientation and trace structural lines");
    for (let row = 0; row < 2; row++) {
      for (let column = 0; column < 3; column++) {
        const x = 85 + column * 240;
        const y = 295 + row * 235;
        guides += `<g transform="translate(${x} ${y})" stroke="#808080" fill="none" stroke-width="1.6">`;
        guides += '<path d="M0 175 L75 10 L155 95 L0 175 M0 175 L75 10 M0 175 L155 95 M28 114 L85 116 M48 69 L100 111 M57 143 L87 113 M101 123 L117 102"/>';
        guides += '<circle cx="0" cy="175" r="3" fill="#555"/></g>';
      }
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="297mm" viewBox="0 0 794 1123" role="img" aria-labelledby="title description">
<title id="title">Midnight Ink — ${esc(exercise.title)} practice worksheet</title>
<desc id="description">Original printable exercise for paper and synthetic practice only. No professional qualification or human-skin instructions are implied.</desc>
<rect width="794" height="1123" fill="white"/>
<g font-family="Arial, Helvetica, sans-serif">
${text(48, 58, "MIDNIGHT INK", 23)}${text(48, 82, "AIBRY LABS  /  LEARN THE CRAFT. EARN THE CONFIDENCE.", 10, "#555")}
<path d="M48 102H746" stroke="#333"/>
${text(48, 145, exercise.title, 29)}${text(48, 175, "PAPER + SYNTHETIC PRACTICE ONLY", 11, "#555")}
${text(48, 210, "Date: __________________     Material / tool: __________________     Attempt: ______", 12)}
${guides}
<path d="M48 830H746" stroke="#aaa"/>
${text(48, 858, "OBSERVE", 11)}${text(48, 882, "Consistency · smoothness · coverage · edge control · visible surface changes", 12)}
${text(48, 915, "One specific observation: ______________________________________________________", 12)}
${text(48, 950, "Next attempt — change one variable: _____________________________________________", 12)}
${text(48, 985, "Time: __________     Perceived difficulty (1–5): ______     Notes: ___________________", 12)}
<path d="M48 1010H746" stroke="#aaa"/>
${text(48, 1038, "No lesson, score, worksheet, or AI response establishes readiness to tattoo human skin.", 10)}
${text(48, 1056, "Live-skin work requires appropriate training, supervision, infection control, and local licensing.", 10)}
${text(48, 1080, "Original Midnight Ink learning material · Print at 100%; check printer scaling.", 10, "#555")}
</g></svg>`;
}

export const generateWorksheet = worksheetSvg;
export const getWorksheetSvg = worksheetSvg;
