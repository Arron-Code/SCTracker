import { calculateCompletion, validateMassBalance } from "./src/domain.mjs";

const lineage = [
  { type: "Source Lots", title: "SL-041 · SL-044 · SL-052", detail: "19.240 kg Rohkaffee" },
  { type: "Verarbeitung", title: "Dry Mill DM-2026-88", detail: "740 kg dokumentierter Verlust" },
  { type: "Export Batch", title: "B-2026-091", detail: "18.500 kg freigegeben" },
  { type: "Shipment", title: "IMP-2026-0142", detail: "18.500 kg zugeordnet" }
];

const riskSignals = [
  { label: "Datenvollständigkeit", score: "82%", detail: "3 Nachweise fehlen", warning: true },
  { label: "Geodatenqualität", score: "94%", detail: "1 Polygon offen", warning: false },
  { label: "Entwaldungsrisiko", score: "Niedrig", detail: "EO-Analyse v2.4", warning: false },
  { label: "Legalitätsrisiko", score: "Review", detail: "Dokument läuft ab", warning: true },
  { label: "Traceability", score: "99%", detail: "120 kg Klärfall", warning: true }
];

const completion = calculateCompletion({
  supplier: true,
  plots: true,
  lineage: true,
  evidence: true,
  legalReview: false,
  geoReview: true,
  declaration: true,
  approval: false,
  product: true
});

const balance = validateMassBalance(
  [{ quantityKg: 19240 }],
  [{ quantityKg: 18500 }, { quantityKg: 740 }]
);

document.querySelector("#completion-score").textContent = `${completion}%`;

document.querySelector("#lineage").innerHTML = lineage
  .map(
    (node) => `
      <div class="lineage-node">
        <small>${node.type}</small>
        <strong>${node.title}</strong>
        <em>${node.detail}</em>
      </div>
    `
  )
  .join("");

document.querySelector("#risk-grid").innerHTML = riskSignals
  .map(
    (signal) => `
      <article class="risk-card ${signal.warning ? "warning" : ""}">
        <small>${signal.label}</small>
        <strong>${signal.score}</strong>
        <small>${signal.detail}</small>
      </article>
    `
  )
  .join("");

if (!balance.balanced) {
  console.warn("Demo shipment mass balance is not balanced", balance);
}

const views = [...document.querySelectorAll(".view")];
const navLinks = [...document.querySelectorAll(".nav-link")];
const title = document.querySelector("#page-title");

function showView(viewId) {
  const selected = views.find((view) => view.id === viewId) ?? views[0];

  views.forEach((view) => view.classList.toggle("active", view === selected));
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.view === selected.id);
  });
  title.textContent = selected.dataset.title;
}

navLinks.forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    const viewId = link.dataset.view;
    history.replaceState(null, "", `#${viewId}`);
    showView(viewId);
  });
});

const toast = document.querySelector("#toast");
let toastTimer;

document.querySelectorAll("[data-toast]").forEach((button) => {
  button.addEventListener("click", () => {
    toast.textContent = button.dataset.toast;
    toast.classList.add("visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("visible"), 2600);
  });
});

showView(location.hash.slice(1) || "overview");
