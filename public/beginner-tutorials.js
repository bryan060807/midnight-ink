"use strict";

(function starterApp() {
  const projects = [
    {
      id: "simple-heart",
      title: "Simple Heart",
      minutes: 15,
      size: "5 cm wide",
      focus: "Symmetry · smooth curves",
      summary: "Use two circles and a center point to build a balanced heart.",
      steps: [
        [
          "Place the guides",
          "Sketch two equal circles beside a vertical centerline. Mark a lower point beneath the center notch.",
          "The circles sit at the same height and the lower point is centered."
        ],
        [
          "Shape the lobes",
          "Follow the upper outside of each circle to draw two rounded lobes. Stop before turning down toward the lower point.",
          "Both lobes have similar height and meet at a shallow notch."
        ],
        [
          "Close the heart",
          "Extend each lobe toward the lower point with a gentle inward curve. Bring both sides to the same clean tip.",
          "The outline is closed and its tip sits directly below the notch."
        ],
        [
          "Clean the contour",
          "Erase the construction circles and centerline. Refine uneven joins, then trace one deliberate final contour with your pen.",
          "No guide marks remain and the curves meet without dark, thick patches."
        ],
        [
          "Try one accent",
          "Optionally add one short curved accent inside the upper-left lobe, as shown. Keep it separate from the outline; leaving the heart plain is also a complete study.",
          "A clear gap surrounds the accent and the outside contour remains easy to read."
        ],
        [
          "Review the silhouette",
          "Compare your heart with the finished reference at its intended size. Choose one curve or join to improve in a second attempt.",
          "The two halves feel balanced and there are no unintended gaps."
        ]
      ]
    },
    {
      id: "crescent-moon",
      title: "Crescent Moon",
      minutes: 20,
      size: "6 cm tall",
      focus: "Long arcs · tapered tips",
      summary: "Use two overlapping circles to understand the crescent's negative space.",
      steps: [
        [
          "Overlap the circles",
          "Sketch two equal circles, shifting the second to the right. Mark their upper and lower intersections; the exposed area on the left will become the crescent.",
          "Both circles intersect twice and the left crescent has a clear middle width."
        ],
        [
          "Trace the outside arc",
          "Follow the left edge of the first circle between the marked intersections. Rehearse the long movement above the paper before drawing.",
          "The curve has no abrupt flat section and stops at both marked intersections."
        ],
        [
          "Close the inner arc",
          "Trace the left edge of the offset circle between the same two intersections. This inward curve closes the crescent.",
          "The middle is wider than the tips and the two arcs form one closed shape."
        ],
        [
          "Refine the tips",
          "Erase the unused circle guides. Keep both joins narrow and clean without extending the ends into little hooks.",
          "Each tip tapers gradually and ends without a dark knot."
        ],
        [
          "Add an inner accent",
          "Optionally add a short parallel curve inside the broad middle, as shown. Stop well before either tip, or leave the crescent as a plain outline.",
          "The accent follows the outer arc and leaves open space at both ends."
        ],
        [
          "Check the sweep",
          "Compare the whole crescent with the finished reference from a little farther away. Review the middle arc as well as the tips.",
          "The crescent reads clearly at its intended size, with clean joins and a smooth sweep."
        ]
      ]
    },
    {
      id: "geometric-diamond",
      title: "Geometric Diamond",
      minutes: 20,
      size: "6 cm wide",
      focus: "Straight lines · clear intersections",
      summary: "Construct a simple five-sided gem, then add a small set of facets.",
      steps: [
        [
          "Map five points",
          "Mark two upper corners, two wider side corners, and one centered bottom point. Use faint center and horizontal guides to keep matching points aligned.",
          "Matching corners sit at equal heights and the bottom point is centered."
        ],
        [
          "Build the crown",
          "Connect the upper corners with a short horizontal line. Add a sloping shoulder from each upper corner to its nearby side corner.",
          "Both shoulders have similar angles and lengths."
        ],
        [
          "Close the lower tip",
          "Connect each side corner to the same bottom point. Aim for the endpoint without crossing past it.",
          "The five-sided outline is closed and the lower edges meet cleanly."
        ],
        [
          "Place the facets",
          "Join the side corners with a horizontal divider. Connect its midpoint to both upper corners and the bottom point, then erase the construction guides.",
          "The three facet lines share one clear junction at the divider's midpoint."
        ],
        [
          "Try a single fill",
          "Optionally fill the lower-left triangular facet, as shown. Leave the neighboring facets open; the outline-only version is also complete.",
          "The fill stays inside its boundaries and the other facets remain distinct."
        ],
        [
          "Review the geometry",
          "Compare the outer shape first, then inspect the facet intersections. Use corrected guide points for a fresh attempt if a line is misplaced.",
          "The top is level, the sides feel balanced, and every facet ends at its intended junction."
        ]
      ]
    },
    {
      id: "botanical-sprig",
      title: "Botanical Sprig",
      minutes: 25,
      size: "8 cm tall",
      focus: "Leaf shapes · spacing · flowing lines",
      summary: "Arrange six simple leaves along one gently curved stem.",
      steps: [
        [
          "Plan the spacing",
          "Sketch a gently curved stem and six short leaf guides, three on each side. Stagger their attachment points and leave gaps between neighboring leaves.",
          "The stem bends gradually and each leaf guide has room around it."
        ],
        [
          "Trace the stem",
          "Draw the stem as one clear line from the lower end toward the tip. Keep the curve simple and the leaf guides light.",
          "The stem has no abrupt bends or doubled sections."
        ],
        [
          "Open the leaves",
          "Draw one curved edge from each leaf's attachment point to its tip. Make the upper leaves a little smaller than the lower ones.",
          "All six first edges begin at the stem and their tips remain separate."
        ],
        [
          "Close each leaf",
          "Return from each tip to its original attachment point with a second curve. Erase the guides to reveal six narrow almond shapes.",
          "Each leaf is closed, connects to the stem, and has a visible gap from its neighbors."
        ],
        [
          "Add restrained veins",
          "Optionally add one short central vein inside each larger leaf. Stop before the tips and keep the two smallest leaves plain.",
          "Veins follow their leaves' direction without crowding the tips."
        ],
        [
          "Review the flow",
          "Compare the sprig with the finished reference from base to tip. Look at the rhythm of the spacing before checking individual curves.",
          "All six leaves read separately and the stem remains easy to follow."
        ]
      ]
    },
    {
      id: "petal-rose",
      title: "Petal Rose",
      minutes: 30,
      size: "7 cm across",
      focus: "Layered curves · simple overlaps",
      summary: "Build a small rose from an open center and a few broad petals.",
      steps: [
        [
          "Set the flower guides",
          "Sketch a light circle for the overall flower and a small oval near its center. Leave plenty of room around the oval for broad outer petals.",
          "The center occupies less than one-third of the flower's width."
        ],
        [
          "Shape the center",
          "Draw a loose curl and a larger wrapping curve around part of it. Keep an opening so the center does not become a tight dark knot.",
          "The curves remain distinct and the center contains open space."
        ],
        [
          "Wrap the inner petals",
          "Add a curved petal on each side to form a loose cup around the center. End the lines at their overlaps instead of crossing through other petals.",
          "The center remains partly visible and the two cupping petals are easy to follow."
        ],
        [
          "Complete the outline",
          "Add broad outer petals around the top and sides, then a shallow base petal. Remove the guides and keep only the edges of visible petals.",
          "The outer silhouette is closed and the outer petals are broader than the inner ones."
        ],
        [
          "Shade sparingly",
          "Optionally add three short shading strokes inside the base petal, following its curve. Keep the other petals open, or leave the entire flower as line art.",
          "The strokes stay inside the base petal and do not crowd the center."
        ],
        [
          "Read the layers",
          "Compare the center, inner cup, and outer petals with the reference. Choose one unclear overlap to simplify on your next attempt.",
          "The rose reads at its intended size without unexplained gaps or crossing lines."
        ]
      ]
    }
  ];

  const byId = new Map(projects.map(project => [project.id, project]));
  const storageKey = "midnight-ink:starter-projects:v1";

  const progress = Object.fromEntries(
    projects.map(project => [project.id, { step: 0, done: false }])
  );

  let active = projects[0].id;
  let storageAvailable = true;

  try {
    const raw = JSON.parse(
      window.localStorage.getItem(storageKey) || "null"
    );

    if (raw && typeof raw === "object" && raw.version === 1) {
      if (byId.has(raw.active)) active = raw.active;

      if (raw.progress && typeof raw.progress === "object") {
        for (const project of projects) {
          const record = raw.progress[project.id];

          if (
            record &&
            Number.isInteger(record.step) &&
            record.step >= 0 &&
            record.step < 6
          ) {
            progress[project.id] = {
              step: record.step,
              done: record.done === true
            };
          }
        }
      }
    }
  } catch {
    storageAvailable = false;
  }

  const node = id => document.getElementById(id);

  const xml = value => String(value).replace(
    /[&<>"']/g,
    character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&apos;"
    }[character])
  );

  function artwork(id, step, kind) {
    const path = (d, name = "ink") =>
      `<path class="${name}" d="${d}"/>`;

    let guides = "";
    let ink = "";
    let detail = "";

    if (id === "simple-heart") {
      guides =
        '<circle class="guide" cx="80" cy="80" r="40"/>' +
        '<circle class="guide" cx="160" cy="80" r="40"/>' +
        path("M120 32V195 M40 90L120 190 200 90", "guide");

      const lobes =
        "M40 90C36 48 88 30 120 76C152 30 204 48 200 90";

      ink = step === 1
        ? path(lobes)
        : path(
            lobes +
            "C196 123 159 155 120 190C81 155 44 123 40 90Z"
          );

      detail = path("M61 80Q65 62 84 62", "detail");
    } else if (id === "crescent-moon") {
      guides =
        '<circle class="guide" cx="118" cy="120" r="68"/>' +
        '<circle class="guide" cx="150" cy="120" r="68"/>';

      const outside = "M134 53.91A68 68 0 1 0 134 186.09";

      ink = path(
        outside +
        (step === 1 ? "" : "A68 68 0 0 1 134 53.91Z")
      );

      detail = path("M79 91Q64 121 80 148", "detail");
    } else if (id === "geometric-diamond") {
      guides =
        path("M120 32V205 M40 94H200", "guide") +
        [[82, 52], [158, 52], [192, 94], [120, 192], [48, 94]]
          .map(([x, y]) =>
            `<circle class="dot" cx="${x}" cy="${y}" r="3"/>`
          )
          .join("");

      ink = path(
        step === 1
          ? "M48 94L82 52H158L192 94"
          : "M48 94L82 52H158L192 94L120 192Z"
      );

      if (step >= 3) {
        ink += path(
          "M48 94H192 M82 52L120 94L158 52 M120 94V192"
        );
      }

      detail = '<path class="solid" d="M48 94H120V192Z"/>';
    } else if (id === "botanical-sprig") {
      const stem = "M112 205C94 150 104 87 130 35";

      const leaves = [
        [
          "M105 171Q79 176 65 148",
          "Q92 140 105 171Z",
          "M105 171L65 148"
        ],
        [
          "M104 123Q77 128 64 99",
          "Q94 97 104 123Z",
          "M104 123L64 99"
        ],
        [
          "M114 76Q86 79 78 50",
          "Q109 47 114 76Z",
          "M114 76L78 50"
        ],
        [
          "M102 151Q121 124 151 130",
          "Q136 155 102 151Z",
          "M102 151L151 130"
        ],
        [
          "M108 103Q129 79 159 86",
          "Q143 109 108 103Z",
          "M108 103L159 86"
        ],
        [
          "M120 59Q135 36 160 39",
          "Q148 63 120 59Z",
          "M120 59L160 39"
        ]
      ];

      guides =
        path(stem, "guide") +
        leaves.map(leaf => path(leaf[2], "guide")).join("");

      ink = path(stem);

      if (step >= 2) {
        ink += leaves.map(
          leaf => path(leaf[0] + (step >= 3 ? leaf[1] : ""))
        ).join("");
      }

      detail = path(
        "M103 169L80 155 M103 122L78 106 " +
        "M106 149L136 135 M111 102L143 90",
        "detail"
      );
    } else if (id === "petal-rose") {
      guides =
        '<circle class="guide" cx="120" cy="121" r="80"/>' +
        '<ellipse class="guide" cx="120" cy="96" rx="28" ry="22"/>';

      ink =
        path(
          "M112 99C106 89 122 85 129 93C135 102 121 110 113 103"
        ) +
        path(
          "M94 111C84 94 98 77 117 78C138 77 153 91 151 112"
        );

      if (step >= 2) {
        ink += path(
          "M76 99Q109 106 121 153Q79 152 76 99Z " +
          "M169 105Q132 107 121 153Q161 150 169 105Z"
        );
      }

      if (step >= 3) {
        ink += path(
          "M76 99C62 84 73 62 93 68" +
          "C96 42 130 41 143 68" +
          "C170 63 183 85 169 105" +
          "C198 108 208 140 184 157" +
          "C173 184 147 196 121 198" +
          "C93 196 66 182 57 158" +
          "C33 138 44 108 76 99Z " +
          "M57 158Q121 132 184 157"
        );
      }

      detail = path(
        "M105 163L109 176 M121 161V178 M137 163L133 176",
        "detail"
      );
    }

    const titleId = `${id}-${kind}-title`;

    const label = kind === "reference"
      ? `${byId.get(id).title}: finished reference with optional detail`
      : `${byId.get(id).title}: ${byId.get(id).steps[step][0]}`;

    return (
      '<svg xmlns="http://www.w3.org/2000/svg" ' +
      `viewBox="0 0 240 240" role="img" aria-labelledby="${titleId}">` +
      `<title id="${titleId}">${xml(label)}</title>` +
      (step < 3 ? guides : "") +
      (step > 0 ? ink : "") +
      (step >= 4 ? detail : "") +
      "</svg>"
    );
  }

  function persist() {
    try {
      window.localStorage.setItem(
        storageKey,
        JSON.stringify({ version: 1, active, progress })
      );
      storageAvailable = true;
    } catch {
      storageAvailable = false;
    }
  }

  const projectButtons = projects.map(project => {
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-controls", "project");

    const title = document.createElement("strong");
    title.textContent = project.title;

    const caption = document.createElement("span");
    button.append(title, caption);

    button.addEventListener("click", () => {
      active = project.id;
      persist();
      render(true);
    });

    node("projects").append(button);

    return { button, caption, project };
  });

  const stepButtons = Array.from({ length: 6 }, (_, index) => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(index + 1);
    button.addEventListener("click", () => go(index));
    item.append(button);
    node("steps").append(item);
    return button;
  });

  function render(moveFocus = false) {
    const project = byId.get(active);
    const record = progress[active];
    const step = project.steps[record.step];

    for (const item of projectButtons) {
      item.button.setAttribute(
        "aria-pressed",
        String(item.project.id === active)
      );

      item.caption.textContent = progress[item.project.id].done
        ? "Completed"
        : `${item.project.minutes} min · Step ${progress[item.project.id].step + 1}/6`;
    }

    for (const [index, button] of stepButtons.entries()) {
      button.setAttribute(
        "aria-current",
        index === record.step ? "step" : "false"
      );

      button.setAttribute(
        "aria-label",
        `Step ${index + 1}: ${project.steps[index][0]}`
      );
    }

    node("project-meta").textContent =
      `${project.minutes} minutes · ${project.size} · ${project.focus}`;

    node("project-title").textContent = project.title;
    node("project-summary").textContent = project.summary;

    node("reference").innerHTML = artwork(active, 5, "reference");

    node("reference-caption").textContent =
      "Shown with optional detail. A clean outline is also a complete study.";

    node("stage").innerHTML = artwork(active, record.step, "working");
    node("step-title").textContent = `${record.step + 1}. ${step[0]}`;
    node("instruction").textContent = step[1];
    node("checkpoint").textContent = step[2];

    node("status").textContent =
      `${project.title} · Step ${record.step + 1} of 6` +
      (record.done ? " · Completed" : "");

    node("back").disabled = record.step === 0;
    node("next").hidden = record.step === 5;
    node("complete").hidden = record.step !== 5;
    node("complete").disabled = record.done;

    node("complete").textContent = record.done
      ? "Project completed"
      : "Mark project complete";

    node("storage-note").textContent = storageAvailable
      ? "Progress saves automatically in this browser. It is not synced to your account."
      : "Browser storage is unavailable. Progress will last only while this page stays open.";

    if (moveFocus) node("step-title").focus();
  }

  function go(index) {
    if (!Number.isInteger(index) || index < 0 || index >= 6) return;
    progress[active].step = index;
    persist();
    render(true);
  }

  node("back").addEventListener(
    "click",
    () => go(progress[active].step - 1)
  );

  node("next").addEventListener(
    "click",
    () => go(progress[active].step + 1)
  );

  node("complete").addEventListener("click", () => {
    if (progress[active].step !== 5) return;
    progress[active].done = true;
    persist();
    render(true);
  });

  node("restart").addEventListener("click", () => {
    progress[active] = { step: 0, done: false };
    persist();
    render(true);
  });

  if (window.location.protocol === "file:") {
    node("home-link").hidden = true;
  }

  render();
  node("app").hidden = false;
})();