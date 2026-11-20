/** Original Midnight Ink field labs. Paper and synthetic practice only. */
export type AcademyLab = {
  id: string;
  title: string;
  subtitle: string;
  minutes: number;
  exerciseId: string | null;
  worksheetIds: string[];
  overview: string;
  objectives: string[];
  equipment: string[];
  steps: { title: string; action: string; checkpoint: string }[];
  watchFor: string[];
  review: string[];
  question: string;
  answer: string;
};

export const academyLabs: AcademyLab[] = [
  {
    id: "academy-setup",
    title: "Know your machine. Plan your station.",
    subtitle: "A safety-first, unpowered equipment walkthrough",
    minutes: 25,
    exerciseId: null,
    worksheetIds: [],
    overview: "Learn the parts of your own device, separate verified information from assumptions, and rehearse a clean-to-used workflow before opening any single-use supplies. No powered practice is required.",
    objectives: ["Identify the major components and controls of your specific machine", "Locate its manual and record the facts you cannot verify", "Plan clean supplies, working space, and sharps disposal"],
    equipment: ["Powered-off machine and its actual manual", "Unopened cartridge packaging for identification only", "Pen, paper, and the printable station checklist", "Appropriate sharps container if you will later handle exposed sharps"],
    steps: [
      { title: "Inventory what you own", action: "With power disconnected and no cartridge installed, list the machine brand, model, grip, power source, display/buttons, and cartridge type. Label anything you cannot identify as unknown.", checkpoint: "You have a written inventory that separates facts from guesses." },
      { title: "Find the real instructions", action: "Locate the manufacturer manual for the exact model. Record power compatibility, maintenance guidance, operating controls, and any warnings. Do not borrow settings from another machine.", checkpoint: "You can point to the actual instructions or have documented why powered use must wait." },
      { title: "Trace contact paths", action: "Rehearse your workflow with a capped pen. Mark unused supplies, the active work zone, phone/lamp controls, and the used-items zone. Notice every hand movement between zones.", checkpoint: "You identified at least three plausible cross-contact points." },
      { title: "Plan sharps and disposal", action: "Before opening a cartridge in any later practice, place an appropriate puncture-resistant sharps container where it can be reached safely. Review the manufacturer's instructions and local disposal rules. Never reuse disposable cartridges.", checkpoint: "Your disposal plan exists before any exposed sharp." },
      { title: "Run a dry rehearsal", action: "Walk through the station from setup to teardown without opening supplies or turning on the machine. Write down every missing item or unanswered question.", checkpoint: "You have a concrete readiness list, not a claim of sterility or professional competency." }
    ],
    watchFor: ["A clean-looking desk does not establish sterility.", "Unknown voltage, depth, equipment compatibility, or cartridge sterility must stay unknown.", "Human-skin procedures require qualified training and applicable licensing."],
    review: ["Can I identify my machine without guessing?", "Have I planned where used sharps go?", "What still requires a manufacturer manual or supervised training?"],
    question: "What is the safest next step when you cannot verify your machine's operating guidance?",
    answer: "Keep it unpowered and obtain model-specific guidance or help from a qualified instructor. Never substitute an online universal setting."
  },
  {
    id: "academy-lines",
    title: "Straight lines that stay straight",
    subtitle: "Three controlled sets, one deliberate change",
    minutes: 25,
    exerciseId: "straight-lines",
    worksheetIds: ["straight-lines", "parallel-lines"],
    overview: "Use marked endpoints to distinguish path drift, line wobble, and inaccurate stops. Begin with a drawing pen on paper. A separate synthetic study is optional only after safe equipment planning.",
    objectives: ["Rehearse a deliberate path before drawing", "Complete three sets of five single-pass lines", "Identify one repeatable correction instead of retracing"],
    equipment: ["Printed straight-line worksheet at 100%", "Drawing pen and stable surface", "Ruler for comparison after each set", "Optional synthetic practice equipment with verified instructions and sharps plan"],
    steps: [
      { title: "Set the baseline", action: "Print at actual size and mark your date, material, and attempt number. Support your drawing arm comfortably. Make five lines from dot to dot using one stroke per line.", checkpoint: "Five original marks remain visible, including imperfect ones." },
      { title: "Inspect the first set", action: "Look separately at each start point, middle third, and endpoint. Count visible overshoots and gaps. Describe any drift without blaming an unverified machine setting.", checkpoint: "You can name the most common error in specific terms." },
      { title: "Repeat without correcting", action: "Make five more lines at the same size and orientation. Do not thicken an earlier stroke to disguise a wobble.", checkpoint: "The second set is comparable to the first." },
      { title: "Change one variable", action: "For the final five lines, rotate the paper or shorten the path, but do not change multiple things at once. Record the change.", checkpoint: "You know what changed between the final and previous set." },
      { title: "Log your evidence", action: "Compare all fifteen lines and save a practice session. Add an optional photo and one narrowly defined next goal.", checkpoint: "Your saved record has an observation, not just a completion badge." }
    ],
    watchFor: ["Unplanned double passes conceal useful evidence.", "Tension or pain is a reason to stop and reset.", "Synthetic-skin marks do not establish safe technique on humans."],
    review: ["How many starts and stops landed where intended?", "Which third of the line drifts most?", "Did the single changed variable help?"],
    question: "Why should you preserve rather than retrace a crooked line?",
    answer: "The first pass shows the real movement and gives you comparable evidence for the next attempt. Retracing hides the original error."
  },
  {
    id: "academy-shapes",
    title: "Corners, curves, and clean joins",
    subtitle: "Control the transitions, not just the segments",
    minutes: 30,
    exerciseId: "corners",
    worksheetIds: ["corners", "circles", "s-curves"],
    overview: "Build confidence in deliberate directional changes. Compare corner intersections, circle closures, and smooth S-curve transitions without relying on constant touch-ups.",
    objectives: ["Land two line segments on a planned junction", "Recognize gaps, overshoots, and rounding", "Describe circle closures and curve transitions separately"],
    equipment: ["Printed corner, circle, and S-curve worksheets", "Drawing pen", "Ruler and paper for notes"],
    steps: [
      { title: "Mark the corners", action: "Choose six corner guides. Identify the junction and both endpoints. Rehearse each path above the sheet before drawing.", checkpoint: "All target points are visible before the first mark." },
      { title: "Make single joins", action: "Complete each two-segment corner, lifting and resetting if necessary. Do not color over a gap or overshoot.", checkpoint: "You can inspect the original junction on each corner." },
      { title: "Test circular closures", action: "Make six circles on the circles worksheet, each with one planned start and finish. Note whether the closure is a gap, overlap, or smooth join.", checkpoint: "You classified all six joins without hiding them." },
      { title: "Practice directional flow", action: "Use an S-curve worksheet for a short set. Rotate the paper rather than forcing a painful position; inspect the middle transition for a kink.", checkpoint: "Your review distinguishes the beginning, center, and end." },
      { title: "Write a specific correction", action: "Save a corners practice session and optional photo. Identify one junction problem to improve next time.", checkpoint: "You have one measurable next goal." }
    ],
    watchFor: ["Pause to reset rather than forcing movement through discomfort.", "A rounded corner is a visual observation, not a tissue-depth diagnosis.", "A clean shape is not evidence of infection-control competence."],
    review: ["How many corners overshot the junction?", "Are circle closures mostly gaps or overlaps?", "Did a new page angle help?"],
    question: "What makes a useful review of a rough circle closure?",
    answer: "Name the visible issue and where it occurs, such as a gap at the final junction. Avoid unsupported claims about depth or machine settings."
  },
  {
    id: "academy-blackwork",
    title: "Solid black and deliberate values",
    subtitle: "Boundary control before complicated shading",
    minutes: 35,
    exerciseId: "solid-fills",
    worksheetIds: ["solid-fills", "gradients"],
    overview: "Build a repeatable sequence for filling bounded shapes with a marker, then compare dark, middle, and light pencil zones. Synthetic material can be studied separately with a stopping rule.",
    objectives: ["Separate interior coverage from boundary accuracy", "Produce three readable pencil value zones", "Recognize visible deterioration and stop rather than overwork"],
    equipment: ["Solid-fill and gradient worksheets", "Black marker, pencil, and eraser", "Optional synthetic material and a documented safe setup"],
    steps: [
      { title: "Plan your boundary", action: "Select a box on the solid-fill sheet. Examine its perimeter and decide which small sections to fill first with a black marker.", checkpoint: "You have a consistent approach before marking." },
      { title: "Fill without concealing", action: "Complete two bounded fills on paper. Preserve the first pass as evidence and resist covering overshoots with thicker borders.", checkpoint: "Interior coverage and edge control can be judged separately." },
      { title: "Create three value zones", action: "Use the gradient worksheet with pencil. Mark dark, middle, and light zones first, then fill each rectangle, keeping the light region visible.", checkpoint: "Three distinct value regions remain readable." },
      { title: "Compare transitions", action: "Examine gaps, streaks, unplanned bands, and the width of transitions. Change only one variable for the next paper attempt.", checkpoint: "Your observation explains what improved or deteriorated." },
      { title: "Record a stopping rule", action: "If doing a separate synthetic study, stop when the material visibly tears, roughens, or behaves unpredictably. Save a practice entry and photo if useful.", checkpoint: "The log records a stopping decision and one next goal." }
    ],
    watchFor: ["Machine settings and ink mixing are equipment-specific, not universal presets.", "Do not repeatedly work a damaged synthetic area.", "Visual fill quality cannot establish biological safety or human-skin readiness."],
    review: ["Is the center filled evenly without hiding the edges?", "Where does the gradient become abrupt?", "What was your stopping rule?"],
    question: "Why rate the interior fill and boundary separately?",
    answer: "An even interior can coexist with an overshot outline. Separate observations make the next drill precise."
  },
  {
    id: "academy-stencil",
    title: "Reference to clean stencil",
    subtitle: "Design clarity, print scale, orientation, transfer",
    minutes: 35,
    exerciseId: "stencil-tracing",
    worksheetIds: ["stencil-tracing"],
    overview: "Start with an original or permitted reference. Reduce it to structural lines, print at actual size, check mirroring, and rehearse tracing before attempting a compatible synthetic transfer.",
    objectives: ["Distinguish necessary contours from distracting detail", "Check final orientation using an asymmetric feature", "Compare synthetic transfer clarity to the original master"],
    equipment: ["Original artwork or the geometric-leaf worksheet", "Pen, tracing paper, and ruler", "Optional compatible synthetic transfer paper and manufacturer's instructions"],
    steps: [
      { title: "Choose a permitted design", action: "Use the built-in geometric-leaf motif or your own artwork. Identify the main contour and only the internal landmarks needed to read it.", checkpoint: "The design is readable without tiny decorative lines." },
      { title: "Build a clean master", action: "Trace the structural lines once on paper. Remove duplicate lines and stray marks; keep important gaps open.", checkpoint: "The master has deliberate starts, joins, and negative space." },
      { title: "Print and measure", action: "Print at 100%, verify the printed dimensions with a ruler, and inspect the design at intended physical size.", checkpoint: "Your design remains legible at actual size." },
      { title: "Check orientation", action: "Mark a clear left/right cue on the master. Compare any mirrored version against the intended final reading, especially if the design contains text.", checkpoint: "You can explain the final orientation without guessing printer behavior." },
      { title: "Test a synthetic transfer", action: "If using compatible synthetic materials, follow the product's specific transfer instructions. Compare line clarity and orientation to the master, then log and photograph the attempt.", checkpoint: "Your record separates transfer success from linework quality." }
    ],
    watchFor: ["A transfer may reverse orientation; test the specific method.", "A high-contrast export is not a professionally approved human-skin stencil.", "Do not use unlicensed third-party artwork without permission."],
    review: ["Which lines are necessary for recognition?", "Did mirroring alter the intended reading?", "Where did a synthetic transfer lose clarity?"],
    question: "Why test the physical print instead of trusting the screen preview?",
    answer: "Zoomed artwork hides crowding and tiny gaps. Actual-size printing reveals whether the intended contours remain readable."
  },
  {
    id: "academy-capstone",
    title: "Finish one complete practice piece",
    subtitle: "Plan, execute, photograph, critique, repeat",
    minutes: 45,
    exerciseId: "stencil-tracing",
    worksheetIds: ["stencil-tracing"],
    overview: "Combine your line planning, shape control, simple black mass, and stencil orientation in one original small motif. It is a documented synthetic or paper practice study, not a qualification test.",
    objectives: ["Complete one original motif without excessive corrective passes", "Document both strong and weak areas with a photo", "Use a baseline and a second attempt to plan improvement"],
    equipment: ["Printable capstone worksheet or original simple flash", "Drawing pen and black marker", "Optional documented synthetic practice setup and fresh disposable materials", "Camera for a private practice record"],
    steps: [
      { title: "Pick one manageable motif", action: "Use the original geometric motif on the capstone worksheet or draw your own small shape with an outside contour, two interior lines, and one bounded fill.", checkpoint: "The motif reads clearly at the intended physical size." },
      { title: "Plan the order", action: "Mark the endpoints, joins, orientation, and black-filled region. Decide which lines must remain open and how you will inspect the result.", checkpoint: "The sequence and visual targets are recorded before you begin." },
      { title: "Make the first complete study", action: "Use paper first. Follow the structure with deliberate strokes, then complete the bounded fill with a marker. If making a separate synthetic version, follow model-specific safety instructions and stop if the surface deteriorates.", checkpoint: "The initial study is complete and remains visible without retouching to hide errors." },
      { title: "Review the evidence", action: "Under consistent lighting, photograph the piece. Identify one strong contour, one weak join, one coverage issue, and any damaged practice surface.", checkpoint: "The critique uses concrete visible observations." },
      { title: "Change just one variable", action: "Make a second attempt with a single documented change. Save a capstone practice session, self-assessment, optional photo, and next goal in Practice Studio.", checkpoint: "You can compare two attempts and explain the difference." }
    ],
    watchFor: ["Completion is not permission to tattoo anyone.", "A practice photo cannot prove needle depth, sterile handling, or healed results.", "Use a qualified mentor and locally required training before human work."],
    review: ["Which exact line or join improved between attempts?", "Did the black area remain inside its boundary?", "What should the next practice session isolate?"],
    question: "What makes a capstone useful even when the final piece is imperfect?",
    answer: "A documented sequence, observable comparison, and a focused next improvement show learning far better than a polished result without evidence."
  }
];
