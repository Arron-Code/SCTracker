import { createApiClient, ApiError } from "./src/api.mjs?v=4";
import { createManagedAuth, AuthError } from "./src/auth.mjs?v=6";
import { calculateCompletion, validateMassBalance } from "./src/domain.mjs?v=1";
import { parseGeoJson } from "./src/geojson.mjs?v=2";
import {
  SUPPORTED_LANGUAGES,
  applyTranslations,
  translate,
} from "./src/i18n.mjs?v=4";

const auth = createManagedAuth();
const api = createApiClient({
  tokenProvider: () => auth.token(),
  onUnauthorized: handleUnauthorized,
});
const completion = calculateCompletion({
  supplier: true,
  plots: true,
  lineage: true,
  evidence: true,
  legalReview: false,
  geoReview: true,
  declaration: true,
  approval: false,
  product: true,
});
const balance = validateMassBalance(
  [{ quantityKg: 19240 }],
  [{ quantityKg: 18500 }, { quantityKg: 740 }],
);

const state = {
  suppliers: [],
  plots: [],
  shipments: [],
  errors: {
    suppliers: null,
    plots: null,
    shipments: null,
  },
  administration: {
    users: [],
    devices: [],
    keys: [],
    error: null,
    userSearch: "",
    userStatus: "",
    deviceSearch: "",
    deviceStatus: "",
    devicePlatform: "",
  },
};
const views = [...document.querySelectorAll(".view")];
const navLinks = [...document.querySelectorAll(".nav-link")];
const appShell = document.querySelector("#app-shell");
const pageTitle = document.querySelector("#page-title");
const toast = document.querySelector("#toast");
const dialog = document.querySelector("#workflow-dialog");
const dialogTitle = document.querySelector("#dialog-title");
const dialogContent = document.querySelector("#dialog-content");
const dialogError = document.querySelector("#dialog-error");
const dialogSubmit = document.querySelector("#dialog-submit");
const languageButtons = [...document.querySelectorAll("[data-language]")];
const authDialog = document.querySelector("#auth-dialog");
const authButton = document.querySelector("#auth-button");
const authSignedOut = document.querySelector("#auth-signed-out");
const authSignedIn = document.querySelector("#auth-signed-in");
const authError = document.querySelector("#auth-error");
const authStatus = document.querySelector("#auth-status");
const authIdentity = document.querySelector("#auth-identity");
const authOrganization = document.querySelector("#auth-organization");
const authSubmit = document.querySelector("#auth-submit");
const authMode = document.querySelector("#auth-mode");
const authNameField = document.querySelector("#auth-name-field");
const authForgotPassword = document.querySelector("#auth-forgot-password");
const authProviders = document.querySelector("#auth-providers");
const authProviderButtons = document.querySelector("#auth-provider-buttons");
const authResetRequest = document.querySelector("#auth-reset-request");
const authResetPassword = document.querySelector("#auth-reset-password");
const organizationForm = document.querySelector("#organization-form");
const organizationSelect = document.querySelector("#organization-select");
const organizationSelectButton = document.querySelector("#organization-select-button");
const signOutButton = document.querySelector("#sign-out-button");
const administrationUsers = document.querySelector("#administration-users");
const administrationDevices = document.querySelector("#administration-devices");
const administrationKeys = document.querySelector("#administration-keys");
const administrationError = document.querySelector("#administration-error");
const administrationRefresh = document.querySelector("#administration-refresh");
const administrationAddUser = document.querySelector("#administration-add-user");
const administrationUserSearch = document.querySelector("#administration-user-search");
const administrationUserStatusFilter = document.querySelector("#administration-user-status-filter");
const administrationDeviceSearch = document.querySelector("#administration-device-search");
const administrationDeviceStatusFilter = document.querySelector("#administration-device-status-filter");
const administrationDevicePlatformFilter = document.querySelector("#administration-device-platform-filter");
const administrationUserCount = document.querySelector("#administration-user-count");
const administrationActiveUserCount = document.querySelector("#administration-active-user-count");
const administrationDeviceCount = document.querySelector("#administration-device-count");
const administrationTrustedDeviceCount = document.querySelector("#administration-trusted-device-count");
const administrationKeyCount = document.querySelector("#administration-key-count");
const administrationRevokedKeyCount = document.querySelector("#administration-revoked-key-count");
const administrationDeviceDialog = document.querySelector("#administration-device-dialog");
const administrationDeviceDialogContent = document.querySelector("#administration-device-dialog-content");
let activeDialog;
let activeLanguage = getInitialLanguage();
let toastTimer;
let resetToken = new URLSearchParams(location.search).get("token");
let authAction = resetToken ? "resetPassword" : "signIn";
const authState = {
  loading: auth.configured,
  session: null,
  organizations: [],
  error: null,
};

function t(key) {
  return translate(activeLanguage, key);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getInitialLanguage() {
  const stored = localStorage.getItem("sctracker.language");
  if (SUPPORTED_LANGUAGES.includes(stored)) return stored;
  const browserLanguage = navigator.language.toLowerCase();
  if (browserLanguage.startsWith("am")) return "am";
  if (browserLanguage.startsWith("en")) return "en";
  return "de";
}

function showToast(message, kind = "success") {
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add("visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("visible"), 3600);
}

function errorMessage(error) {
  if (error instanceof AuthError && error.code === "AUTH_NOT_CONFIGURED") {
    return t("auth.notConfiguredDetail");
  }
  if (error instanceof AuthError) {
    return error.message || t("auth.error");
  }
  if (error instanceof ApiError && error.code === "NOT_CONFIGURED") {
    return t("error.notConfigured");
  }
  if (error instanceof ApiError && error.code === "NETWORK_UNAVAILABLE") {
    return t("error.network");
  }
  if (error instanceof ApiError && error.code === "AUTH_NOT_CONFIGURED") {
    return t("auth.notConfiguredDetail");
  }
  if (error instanceof ApiError && error.code === "AUTH_REQUIRED") {
    return t("auth.organizationRequired");
  }
  if (error instanceof ApiError && ["HTTP_ERROR", "INVALID_RESPONSE"].includes(error.code)) {
    return t("error.generic");
  }
  return error?.message || t("error.generic");
}

function showView(viewId) {
  const selected = views.find((view) => view.id === viewId) ?? views[0];
  views.forEach((view) => view.classList.toggle("active", view === selected));
  navLinks.forEach((link) => link.classList.toggle("active", link.dataset.view === selected.id));
  pageTitle.textContent = t(selected.dataset.titleKey);
  if (selected.id === "administration" && authState.session?.session?.activeOrganizationId) {
    void loadAdministration();
  }
}

function renderDynamicContent() {
  const lineage = [
    { type: t("lineage.sourceLots"), title: "SL-041 · SL-044 · SL-052", detail: t("lineage.rawCoffee") },
    { type: t("lineage.processing"), title: "Dry Mill DM-2026-88", detail: t("lineage.loss") },
    { type: t("lineage.exportBatch"), title: "B-2026-091", detail: t("lineage.released") },
    { type: t("lineage.shipment"), title: "IMP-2026-0142", detail: t("lineage.allocated") },
  ];
  const riskSignals = [
    { label: t("signal.completeness"), score: "82%", detail: t("signal.missingEvidence"), warning: true },
    { label: t("signal.geoQuality"), score: "94%", detail: t("signal.openPolygon") },
    { label: t("signal.deforestation"), score: t("signal.low"), detail: t("signal.eoAnalysis") },
    { label: t("signal.legality"), score: t("signal.review"), detail: t("signal.documentExpires"), warning: true },
    { label: t("signal.traceability"), score: "99%", detail: t("signal.quantityCase"), warning: true },
  ];

  document.querySelector("#completion-score").textContent = `${completion}%`;
  document.querySelector("#lineage").innerHTML = lineage.map((node) => `
    <div class="lineage-node">
      <small>${escapeHtml(node.type)}</small>
      <strong>${escapeHtml(node.title)}</strong>
      <em>${escapeHtml(node.detail)}</em>
    </div>`).join("");
  document.querySelector("#risk-grid").innerHTML = riskSignals.map((signal) => `
    <article class="risk-card ${signal.warning ? "warning" : ""}">
      <small>${escapeHtml(signal.label)}</small>
      <strong>${escapeHtml(signal.score)}</strong>
      <small>${escapeHtml(signal.detail)}</small>
    </article>`).join("");
}

function resourceState(target, key, kind = "loading") {
  target.innerHTML = `<div class="resource-state ${kind}">${escapeHtml(t(key))}</div>`;
}

function renderSuppliers() {
  const target = document.querySelector("#supplier-rows");
  if (state.errors.suppliers) {
    target.innerHTML = `<tr><td colspan="6"><div class="resource-state error">${escapeHtml(errorMessage(state.errors.suppliers))}</div></td></tr>`;
    return;
  }
  if (state.suppliers.length === 0) {
    target.innerHTML = `<tr><td colspan="6"><div class="resource-state">${escapeHtml(t("supplier.empty"))}</div></td></tr>`;
    return;
  }
  target.innerHTML = state.suppliers.map((supplier) => `
    <tr>
      <td><strong>${escapeHtml(supplier.name)}</strong><small>${escapeHtml(supplier.id)}</small></td>
      <td>${escapeHtml(supplier.countryCode ?? supplier.country ?? "—")}</td>
      <td>${escapeHtml(supplier.producerCount ?? "—")}</td>
      <td>${escapeHtml(supplier.plotCount ?? "—")}</td>
      <td><span class="badge neutral">${escapeHtml(supplier.status ?? t("status.created"))}</span></td>
      <td>${escapeHtml(supplier.updatedAt ?? supplier.createdAt ?? "—")}</td>
    </tr>`).join("");
}

function renderPlots() {
  const target = document.querySelector("#plot-list");
  if (state.errors.plots) {
    target.innerHTML = `<div class="resource-state error">${escapeHtml(errorMessage(state.errors.plots))}</div>`;
    return;
  }
  if (state.plots.length === 0) {
    resourceState(target, "plot.empty");
    return;
  }
  target.innerHTML = state.plots.map((plot) => `
    <article class="resource-item">
      <div><strong>${escapeHtml(plot.name ?? plot.reference ?? plot.id)}</strong>
      <small>${escapeHtml(plot.id)} · ${escapeHtml(plot.geometry?.type ?? plot.geojson?.geometry?.type ?? "—")}</small></div>
      <span class="badge neutral">${escapeHtml(plot.status ?? t("status.created"))}</span>
    </article>`).join("");
}

function renderShipments() {
  const target = document.querySelector("#shipment-rows");
  if (state.errors.shipments) {
    target.innerHTML = `<tr><td colspan="6"><div class="resource-state error">${escapeHtml(errorMessage(state.errors.shipments))}</div></td></tr>`;
    return;
  }
  if (state.shipments.length === 0) {
    target.innerHTML = `<tr><td colspan="6"><div class="resource-state">${escapeHtml(t("shipment.empty"))}</div></td></tr>`;
    return;
  }
  target.innerHTML = state.shipments.map((shipment) => `
    <tr>
      <td><strong>${escapeHtml(shipment.reference ?? shipment.id)}</strong><small>${escapeHtml(shipment.id)}</small></td>
      <td>${escapeHtml(shipment.productName ?? shipment.productCode ?? "—")}</td>
      <td>${escapeHtml(shipment.quantityKg ?? "—")} kg</td>
      <td>${escapeHtml(shipment.originCountryCode ?? shipment.origin ?? "—")}</td>
      <td><span class="badge neutral">${escapeHtml(shipment.balanceStatus ?? "—")}</span></td>
      <td><span class="badge neutral">${escapeHtml(shipment.status ?? t("status.created"))}</span></td>
    </tr>`).join("");
}

function administrationActions(scope, id, stateValue, allowBlocking = true) {
  const trusted = stateValue === "LOCALLY_TRUSTED" || stateValue === "ORGANIZATION_VERIFIED";
  return `
    <div class="administration-actions">
      <button class="text-button" type="button" data-trust-scope="${scope}" data-trust-id="${escapeHtml(id)}" data-trust-state="${trusted ? "UNVERIFIED" : "LOCALLY_TRUSTED"}">
        ${escapeHtml(t(trusted ? "administration.unverify" : "administration.trust"))}
      </button>
      ${allowBlocking ? `<button class="text-button danger" type="button" data-trust-scope="${scope}" data-trust-id="${escapeHtml(id)}" data-trust-state="SUSPENDED">
        ${escapeHtml(t("administration.suspend"))}
      </button>` : ""}
    </div>`;
}

function statusBadge(value) {
  const normalized = String(value ?? "UNVERIFIED").toLowerCase();
  const badgeClass = ["active", "verified", "organization_verified", "locally_trusted"].includes(normalized)
    ? "success"
    : ["pending", "not_configured"].includes(normalized)
      ? "warning"
      : ["suspended", "revoked"].includes(normalized)
        ? "danger"
        : "neutral";
  return `<span class="badge ${badgeClass}">${escapeHtml(value ?? "UNVERIFIED")}</span>`;
}

function formatAdministrationDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? String(value)
    : new Intl.DateTimeFormat(activeLanguage, { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function administrationUserActions(user) {
  const nextStatus = user.status === "suspended" ? "active" : "suspended";
  const isLastAdmin = user.status === "active"
    && user.roles?.includes("organization_admin")
    && state.administration.users.filter(
      (candidate) =>
        candidate.actorId !== user.actorId
        && candidate.status === "active"
        && candidate.roles?.includes("organization_admin")
        && !["SUSPENDED", "REVOKED"].includes(candidate.trustState),
    ).length === 0;
  return `
    <div class="administration-actions">
      <button class="text-button" type="button" data-edit-user="${escapeHtml(user.actorId)}">${escapeHtml(t("administration.edit"))}</button>
      <button class="text-button ${nextStatus === "suspended" ? "danger" : ""}" type="button" data-user-status="${nextStatus}" data-user-id="${escapeHtml(user.actorId)}" ${isLastAdmin && nextStatus === "suspended" ? "disabled" : ""}>
        ${escapeHtml(t(nextStatus === "suspended" ? "administration.suspend" : "administration.activate"))}
      </button>
      ${administrationActions("user", user.actorId, user.trustState, !isLastAdmin)}
    </div>`;
}

function administrationDeviceActions(device) {
  const statusActions = [];
  if (device.status === "pending" || device.status === "suspended") {
    statusActions.push(`<button class="text-button" type="button" data-device-status="active" data-device-id="${escapeHtml(device.deviceId)}">${escapeHtml(t("administration.activate"))}</button>`);
  }
  if (device.status === "active" || device.status === "pending") {
    statusActions.push(`<button class="text-button danger" type="button" data-device-status="suspended" data-device-id="${escapeHtml(device.deviceId)}">${escapeHtml(t("administration.suspend"))}</button>`);
  }
  if (device.status !== "revoked") {
    statusActions.push(`<button class="text-button danger" type="button" data-device-status="revoked" data-device-id="${escapeHtml(device.deviceId)}">${escapeHtml(t("administration.revoke"))}</button>`);
  }
  return `
    <div class="administration-actions">
      <button class="text-button" type="button" data-device-details="${escapeHtml(device.deviceId)}">${escapeHtml(t("administration.details"))}</button>
      ${statusActions.join("")}
      ${device.status === "revoked" ? "" : administrationActions("device", device.deviceId, device.trustState)}
    </div>`;
}

function renderAdministration() {
  administrationError.hidden = !state.administration.error;
  administrationError.textContent = state.administration.error
    ? errorMessage(state.administration.error)
    : "";
  const { users, devices, keys } = state.administration;
  const trustedStates = new Set(["LOCALLY_TRUSTED", "ORGANIZATION_VERIFIED"]);
  administrationUserCount.textContent = String(users.length);
  administrationActiveUserCount.textContent = t("administration.activeCount")
    .replace("{count}", String(users.filter((user) => user.status === "active").length));
  administrationDeviceCount.textContent = String(devices.length);
  administrationTrustedDeviceCount.textContent = t("administration.trustedCount")
    .replace("{count}", String(devices.filter((device) => trustedStates.has(device.trustState)).length));
  administrationKeyCount.textContent = String(keys.filter((key) => key.status === "active").length);
  administrationRevokedKeyCount.textContent = t("administration.revokedCount")
    .replace("{count}", String(keys.filter((key) => key.status === "revoked").length));

  const userQuery = state.administration.userSearch.toLowerCase();
  const visibleUsers = users.filter((user) => {
    const matchesQuery = !userQuery || [
      user.displayName,
      user.email,
      user.actorId,
      ...(user.roles ?? []),
    ].some((value) => String(value ?? "").toLowerCase().includes(userQuery));
    return matchesQuery && (!state.administration.userStatus || user.status === state.administration.userStatus);
  });
  administrationUsers.innerHTML = visibleUsers.length === 0
    ? `<tr><td colspan="5"><div class="resource-state">${escapeHtml(t("administration.emptyUsers"))}</div></td></tr>`
    : visibleUsers.map((user) => `
      <tr>
        <td><div class="administration-identity"><strong>${escapeHtml(user.displayName ?? user.email ?? user.actorId)}</strong><small>${escapeHtml(user.email ?? user.actorId)}</small></div></td>
        <td><div class="administration-role-list">${(user.roles ?? []).length ? user.roles.map((role) => `<span class="administration-role">${escapeHtml(role.replaceAll("_", " "))}</span>`).join("") : "—"}</div></td>
        <td>${statusBadge(user.status)} ${user.trustState ? statusBadge(user.trustState) : ""}</td>
        <td>${escapeHtml(formatAdministrationDate(user.lastAuthenticatedAt))}</td>
        <td>${administrationUserActions(user)}</td>
      </tr>`).join("");

  const deviceQuery = state.administration.deviceSearch.toLowerCase();
  const visibleDevices = devices.filter((device) => {
    const owner = users.find((user) => user.actorId === device.actorId);
    const matchesQuery = !deviceQuery || [
      device.displayName,
      device.deviceId,
      device.platform,
      device.actorId,
      owner?.displayName,
      owner?.email,
    ].some((value) => String(value ?? "").toLowerCase().includes(deviceQuery));
    return matchesQuery
      && (!state.administration.deviceStatus || device.status === state.administration.deviceStatus)
      && (!state.administration.devicePlatform || device.platform === state.administration.devicePlatform);
  });
  administrationDevices.innerHTML = visibleDevices.length === 0
    ? `<tr><td colspan="6"><div class="resource-state">${escapeHtml(t("administration.emptyDevices"))}</div></td></tr>`
    : visibleDevices.map((device) => {
      const owner = users.find((user) => user.actorId === device.actorId);
      return `
      <tr>
        <td><div class="administration-identity"><strong>${escapeHtml(device.displayName)}</strong><small>${escapeHtml(device.deviceId)}</small></div></td>
        <td><div class="administration-identity"><strong>${escapeHtml(owner?.displayName ?? owner?.email ?? t("administration.unknownOwner"))}</strong><small>${escapeHtml(owner?.email ?? device.actorId)}</small></div></td>
        <td><strong>${escapeHtml(device.platform)}</strong><small class="administration-device-meta">${escapeHtml(device.appVersion)} · ${escapeHtml(device.osVersion)}</small></td>
        <td>${statusBadge(device.status)} ${device.trustState ? statusBadge(device.trustState) : ""}</td>
        <td>${statusBadge(device.attestationStatus ?? t("administration.notAttested"))}<small class="administration-device-meta">${escapeHtml(formatAdministrationDate(device.lastAttestedAt))}</small></td>
        <td>${administrationDeviceActions(device)}</td>
      </tr>`;
    }).join("");
  administrationKeys.innerHTML = keys.length === 0
    ? `<tr><td colspan="5"><div class="resource-state">${escapeHtml(t("administration.emptyKeys"))}</div></td></tr>`
    : keys.map((key) => `
      <tr>
        <td><strong>${escapeHtml(key.keyId)}</strong><small>${escapeHtml(key.actorId)}</small></td>
        <td>${escapeHtml(key.deviceId)}</td>
        <td>${escapeHtml(key.algorithm)}</td>
        <td>${statusBadge(key.status)}</td>
        <td>
          ${key.status === "revoked" ? "—" : `<button class="text-button danger" type="button" data-revoke-key="${escapeHtml(key.keyId)}">${escapeHtml(t("administration.revoke"))}</button>`}
        </td>
      </tr>`).join("");
}

async function showDeviceDetails(deviceId) {
  const device = state.administration.devices.find((item) => item.deviceId === deviceId);
  if (!device) return;
  const owner = state.administration.users.find((user) => user.actorId === device.actorId);
  const deviceKeys = state.administration.keys.filter((key) => key.deviceId === deviceId);
  administrationDeviceDialogContent.innerHTML = `<div class="resource-state loading">${escapeHtml(t("common.loading"))}</div>`;
  administrationDeviceDialog.showModal();
  try {
    const [attestations, trustHistory] = await Promise.all([
      api.administration.deviceAttestations(deviceId),
      api.administration.trustHistory("device", deviceId),
    ]);
    const records = attestations.data?.records ?? [];
    administrationDeviceDialogContent.innerHTML = `
      <dl class="administration-detail-grid">
        <div><dt>${escapeHtml(t("administration.device"))}</dt><dd>${escapeHtml(device.displayName)}</dd></div>
        <div><dt>${escapeHtml(t("administration.owner"))}</dt><dd>${escapeHtml(owner?.displayName ?? owner?.email ?? device.actorId)}</dd></div>
        <div><dt>${escapeHtml(t("administration.platform"))}</dt><dd>${escapeHtml(device.platform)} · ${escapeHtml(device.osVersion)}</dd></div>
        <div><dt>${escapeHtml(t("administration.appVersion"))}</dt><dd>${escapeHtml(device.appVersion)}</dd></div>
        <div><dt>${escapeHtml(t("administration.keyProtection"))}</dt><dd>${escapeHtml(device.keyProtection)}</dd></div>
        <div><dt>${escapeHtml(t("administration.lastSeenDevice"))}</dt><dd>${escapeHtml(formatAdministrationDate(device.lastSeenAt))}</dd></div>
        <div><dt>${escapeHtml(t("administration.status"))}</dt><dd>${statusBadge(device.status)}</dd></div>
        <div><dt>${escapeHtml(t("administration.trustState"))}</dt><dd>${statusBadge(device.trustState)}</dd></div>
      </dl>
      <section class="administration-detail-section">
        <h3>${escapeHtml(t("administration.attestationHistory"))}</h3>
        <div class="administration-detail-list">
          ${records.length ? records.map((record) => `
            <div class="administration-detail-item">
              <div><strong>${escapeHtml(record.provider)}</strong><small>${escapeHtml(formatAdministrationDate(record.createdAt))}</small></div>
              <div>${statusBadge(record.status)}<small>${escapeHtml(record.reason ?? "")}</small></div>
            </div>`).join("") : `<div class="resource-state">${escapeHtml(t("administration.noAttestations"))}</div>`}
        </div>
      </section>
      <section class="administration-detail-section">
        <h3>${escapeHtml(t("administration.deviceKeys"))}</h3>
        <div class="administration-detail-list">
          ${deviceKeys.length ? deviceKeys.map((key) => `
            <div class="administration-detail-item">
              <div><strong>${escapeHtml(key.keyId)}</strong><small>${escapeHtml(key.algorithm)}</small></div>
              <div>${statusBadge(key.status)}${key.status === "active" ? `<button class="text-button danger" type="button" data-revoke-key="${escapeHtml(key.keyId)}">${escapeHtml(t("administration.revoke"))}</button>` : ""}</div>
            </div>`).join("") : `<div class="resource-state">${escapeHtml(t("administration.emptyKeys"))}</div>`}
        </div>
      </section>
      <section class="administration-detail-section">
        <h3>${escapeHtml(t("administration.trustHistory"))}</h3>
        <div class="administration-detail-list">
          ${(trustHistory.data ?? []).length ? trustHistory.data.map((entry) => `
            <div class="administration-detail-item">
              <div><strong>${escapeHtml(entry.state)}</strong><small>${escapeHtml(formatAdministrationDate(entry.createdAt))}</small></div>
              <small>${escapeHtml(entry.reason)}</small>
            </div>`).join("") : `<div class="resource-state">${escapeHtml(t("administration.noTrustHistory"))}</div>`}
        </div>
      </section>`;
  } catch (error) {
    administrationDeviceDialogContent.innerHTML = `<div class="resource-state error">${escapeHtml(errorMessage(error))}</div>`;
  }
}

async function loadAdministration() {
  administrationError.hidden = true;
  administrationUsers.innerHTML = `<tr><td colspan="5"><div class="resource-state loading">${escapeHtml(t("common.loading"))}</div></td></tr>`;
  administrationDevices.innerHTML = administrationUsers.innerHTML;
  administrationKeys.innerHTML = administrationUsers.innerHTML;
  const results = await Promise.allSettled([
    api.administration.users(),
    api.administration.devices(),
    api.administration.keys(),
  ]);
  const keys = ["users", "devices", "keys"];
  const rejected = results.find((result) => result.status === "rejected");
  results.forEach((result, index) => {
    state.administration[keys[index]] =
      result.status === "fulfilled" && Array.isArray(result.value.data)
        ? result.value.data
        : [];
  });
  state.administration.error = rejected?.reason ?? null;
  renderAdministration();
}

function clearResources() {
  state.suppliers = [];
  state.plots = [];
  state.shipments = [];
  state.errors.suppliers = null;
  state.errors.plots = null;
  state.errors.shipments = null;
  renderSuppliers();
  renderPlots();
  renderShipments();
  state.administration = {
    ...state.administration,
    users: [],
    devices: [],
    keys: [],
    error: null,
  };
  renderAdministration();
}

function handleUnauthorized() {
  authState.session = null;
  authState.organizations = [];
  authState.error = new AuthError("AUTH_REQUIRED", t("auth.sessionExpired"));
  clearResources();
  if (dialog.open) dialog.close();
  renderAuth();
}

async function loadResources() {
  const supplierTarget = document.querySelector("#supplier-rows");
  const shipmentTarget = document.querySelector("#shipment-rows");
  supplierTarget.innerHTML = `<tr><td colspan="6"><div class="resource-state loading">${escapeHtml(t("common.loading"))}</div></td></tr>`;
  shipmentTarget.innerHTML = `<tr><td colspan="6"><div class="resource-state loading">${escapeHtml(t("common.loading"))}</div></td></tr>`;
  resourceState(document.querySelector("#plot-list"), "common.loading", "loading");

  const results = await Promise.allSettled([
    api.suppliers.list(),
    api.plots.list(),
    api.shipments.list(),
  ]);
  const renderers = [renderSuppliers, renderPlots, renderShipments];
  const keys = ["suppliers", "plots", "shipments"];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      state[keys[index]] = Array.isArray(result.value.data) ? result.value.data : [];
      state.errors[keys[index]] = null;
    } else {
      state.errors[keys[index]] = result.reason;
    }
    renderers[index]();
  });
}

function setLanguage(language) {
  if (!SUPPORTED_LANGUAGES.includes(language)) return;
  activeLanguage = language;
  localStorage.setItem("sctracker.language", language);
  document.documentElement.lang = language;
  applyTranslations(document, language);
  renderDynamicContent();
  renderSuppliers();
  renderPlots();
  renderShipments();
  renderAdministration();
  renderAuth();
  showView(location.hash.slice(1) || "overview");
  languageButtons.forEach((button) => {
    const isActive = button.dataset.language === language;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function setAuthBusy(busy) {
  authDialog.querySelectorAll("button:not(.dialog-close)").forEach((button) => {
    button.disabled = busy;
  });
  organizationSelectButton.disabled = busy || !organizationSelect.value;
  authStatus.textContent = busy ? t("auth.loading") : "";
}

function updateAuthGate() {
  const unlocked = Boolean(
    authState.session?.session?.activeOrganizationId &&
    authAction !== "resetPassword",
  );
  const wasGated = authDialog.dataset.gated === "true";
  appShell.hidden = !unlocked;
  authDialog.dataset.gated = String(!unlocked);
  authDialog.classList.toggle("auth-gate", !unlocked);
  authDialog.querySelector(".dialog-close").hidden = !unlocked;
  if (!unlocked && !authDialog.open) {
    authDialog.showModal();
  } else if (unlocked && wasGated && authDialog.open) {
    authDialog.close();
  }
}

function renderAuth() {
  const session = authState.session;
  const isResettingPassword = authAction === "resetPassword";
  authButton.textContent = session?.user?.name ?? t("auth.account");
  authButton.setAttribute("aria-label", session ? t("auth.manage") : t("auth.signIn"));
  authSignedOut.hidden = Boolean(session) || !["signIn", "signUp"].includes(authAction);
  authResetRequest.hidden = Boolean(session) || authAction !== "requestReset";
  authResetPassword.hidden = !isResettingPassword;
  authProviders.hidden = Boolean(session) || authAction !== "signIn" || auth.providers.length === 0;
  authSignedIn.hidden = !session || isResettingPassword;
  authError.textContent = authState.error ? errorMessage(authState.error) : "";
  authStatus.textContent = authState.loading ? t("auth.loading") : "";
  updateAuthGate();

  if (!auth.configured) {
    authError.textContent = t("auth.notConfiguredDetail");
    return;
  }
  if (!session) {
    authProviderButtons.innerHTML = auth.providers.map((provider) => `
      <button class="secondary-button" type="button" data-auth-provider="${escapeHtml(provider)}">
        ${escapeHtml(t(`auth.provider.${provider}`))}
      </button>
    `).join("");
    authSubmit.textContent = t(authAction === "signIn" ? "auth.signIn" : "auth.signUp");
    authMode.textContent = t(authAction === "signIn" ? "auth.needAccount" : "auth.haveAccount");
    authNameField.hidden = authAction === "signIn";
    authNameField.querySelector("input").required = authAction === "signUp";
    return;
  }

  authIdentity.textContent = `${session.user.name} · ${session.user.email}`;
  const activeId = session.session.activeOrganizationId;
  organizationSelect.innerHTML = [
    `<option value="">${escapeHtml(t("auth.selectOrganization"))}</option>`,
    ...authState.organizations.map((organization) => `
      <option value="${escapeHtml(organization.id)}" ${organization.id === activeId ? "selected" : ""}>
        ${escapeHtml(organization.name)}
      </option>`),
  ].join("");
  organizationSelectButton.disabled = !organizationSelect.value;
  if (!activeId) {
    authError.textContent = t("auth.organizationRequired");
  }
  updateAuthGate();
}

async function refreshAuth() {
  if (!auth.configured) {
    authState.loading = false;
    renderAuth();
    return;
  }
  authState.loading = true;
  authState.error = null;
  renderAuth();
  try {
    authState.session = await auth.getSession();
    authState.organizations = authState.session
      ? await auth.listOrganizations()
      : [];
    if (!authState.session?.session?.activeOrganizationId) {
      clearResources();
    }
  } catch (error) {
    authState.error = error;
    authState.session = null;
    authState.organizations = [];
  } finally {
    authState.loading = false;
    renderAuth();
  }
}

async function runAuthAction(action) {
  setAuthBusy(true);
  authState.error = null;
  try {
    await action();
    await refreshAuth();
    if (authState.session?.session?.activeOrganizationId) {
      await loadResources();
    }
  } catch (error) {
    authState.error = error;
    renderAuth();
  } finally {
    setAuthBusy(false);
  }
}

function field(name, labelKey, options = {}) {
  const type = options.type ?? "text";
  const attributes = [
    `name="${name}"`,
    `type="${type}"`,
    options.required === false ? "" : "required",
    options.accept ? `accept="${options.accept}"` : "",
    options.min !== undefined ? `min="${options.min}"` : "",
    options.step ? `step="${options.step}"` : "",
  ].filter(Boolean).join(" ");
  return `<label><span>${escapeHtml(t(labelKey))}</span><input ${attributes}></label>`;
}

const dialogDefinitions = {
  supplier: {
    title: "dialog.supplier",
    submit: "common.create",
    content: () => [
      field("name", "form.name"),
      field("countryCode", "form.countryCode"),
      field("contactEmail", "form.email", { type: "email" }),
    ].join(""),
    execute: (form) => api.suppliers.create({
      name: form.get("name").trim(),
      countryCode: form.get("countryCode").trim().toUpperCase(),
      contactEmail: form.get("contactEmail").trim(),
    }),
    success: "success.supplier",
    refresh: loadResources,
  },
  plot: {
    title: "dialog.plot",
    submit: "common.import",
    content: () => [
      field("supplierId", "form.supplierId"),
      field("file", "form.geojsonFile", { type: "file", accept: ".json,.geojson,application/geo+json,application/json" }),
    ].join(""),
    execute: async (form) => {
      const file = form.get("file");
      const features = parseGeoJson(await file.text());
      const supplierId = form.get("supplierId").trim();
      const created = [];
      for (const [index, feature] of features.entries()) {
        const response = await api.plots.create({
          supplierId,
          name: feature.properties.name ?? file.name.replace(/\.(geo)?json$/i, "") + ` ${index + 1}`,
          geometry: feature.geometry,
          properties: feature.properties,
        });
        created.push(response.data);
      }
      return { data: created };
    },
    success: "success.plots",
    refresh: loadResources,
  },
  shipment: {
    title: "dialog.shipment",
    submit: "common.create",
    content: () => [
      field("reference", "form.reference"),
      field("supplierId", "form.supplierId"),
      field("productCode", "form.productCode"),
      field("quantityKg", "form.quantityKg", { type: "number", min: 0, step: "0.001" }),
      field("originCountryCode", "form.originCountryCode"),
    ].join(""),
    execute: (form) => api.shipments.create({
      reference: form.get("reference").trim(),
      supplierId: form.get("supplierId").trim(),
      productCode: form.get("productCode").trim(),
      quantityKg: Number(form.get("quantityKg")),
      originCountryCode: form.get("originCountryCode").trim().toUpperCase(),
    }),
    success: "success.shipment",
    refresh: loadResources,
  },
  document: {
    title: "dialog.document",
    submit: "common.upload",
    content: () => [
      field("shipmentId", "form.shipmentId"),
      field("category", "form.documentCategory"),
      field("file", "form.documentFile", { type: "file" }),
    ].join(""),
    execute: (form) => api.documents.upload(form.get("file"), {
      shipmentId: form.get("shipmentId").trim(),
      category: form.get("category").trim(),
    }),
    success: "success.document",
  },
  analysis: {
    title: "dialog.analysis",
    submit: "common.request",
    content: () => field("plotId", "form.plotId"),
    execute: async (form) => {
      const created = await api.analyses.create({ plotId: form.get("plotId").trim() });
      const result = await pollJob(api.analyses.get, created.data);
      renderJobStatus(document.querySelector("#analysis-status"), result.data);
      return result;
    },
    success: "success.analysis",
  },
  evidence: {
    title: "dialog.evidence",
    submit: "common.request",
    content: () => field("shipmentId", "form.shipmentId"),
    execute: async (form) => {
      const created = await api.evidencePacks.create({ shipmentId: form.get("shipmentId").trim() });
      const result = await pollJob(api.evidencePacks.get, created.data);
      renderJobStatus(document.querySelector("#evidence-status"), result.data);
      return result;
    },
    success: "success.evidence",
  },
  dds: {
    title: "dialog.dds",
    submit: "common.continue",
    content: () => `
      ${field("shipmentId", "form.shipmentId")}
      <fieldset>
        <legend>${escapeHtml(t("form.ddsAction"))}</legend>
        <label class="radio-field"><input type="radio" name="action" value="validate" checked> <span>${escapeHtml(t("form.validateOnly"))}</span></label>
        <label class="radio-field"><input type="radio" name="action" value="submit"> <span>${escapeHtml(t("form.submitDds"))}</span></label>
      </fieldset>`,
    execute: async (form) => {
      const created = await api.dds.create({
        shipmentId: form.get("shipmentId").trim(),
        action: form.get("action"),
      });
      const result = await pollJob(api.dds.get, created.data);
      renderJobStatus(document.querySelector("#dds-status"), result.data);
      return result;
    },
    success: "success.dds",
  },
  adminUser: {
    title: "dialog.adminUser",
    submit: "common.save",
    content: (actorId) => {
      const user = state.administration.users.find((item) => item.actorId === actorId);
      const roles = new Set(user?.roles ?? ["viewer"]);
      const roleOptions = [
        ["organization_admin", "administration.roleAdmin"],
        ["compliance_manager", "administration.roleCompliance"],
        ["operator", "administration.roleOperator"],
        ["auditor", "administration.roleAuditor"],
        ["viewer", "administration.roleViewer"],
      ];
      return `
        <label>
          <span>${escapeHtml(t("administration.actorId"))}</span>
          <input name="actorId" required pattern="[0-9a-fA-F-]{36}" value="${escapeHtml(user?.actorId ?? "")}" ${user ? "readonly" : ""}>
          <small>${escapeHtml(t("administration.actorIdHelp"))}</small>
        </label>
        <label>
          <span>${escapeHtml(t("form.name"))}</span>
          <input name="displayName" required maxlength="200" value="${escapeHtml(user?.displayName ?? "")}">
        </label>
        <label>
          <span>${escapeHtml(t("form.email"))}</span>
          <input name="email" type="email" required value="${escapeHtml(user?.email ?? "")}">
        </label>
        <fieldset>
          <legend>${escapeHtml(t("administration.roles"))}</legend>
          <div class="administration-role-options">
            ${roleOptions.map(([role, label]) => `
              <label class="radio-field">
                <input type="checkbox" name="roles" value="${role}" ${roles.has(role) ? "checked" : ""}>
                <span>${escapeHtml(t(label))}</span>
              </label>`).join("")}
          </div>
        </fieldset>
        <label>
          <span>${escapeHtml(t("administration.status"))}</span>
          <select name="status">
            <option value="active" ${user?.status !== "suspended" ? "selected" : ""}>${escapeHtml(t("administration.active"))}</option>
            <option value="suspended" ${user?.status === "suspended" ? "selected" : ""}>${escapeHtml(t("administration.suspended"))}</option>
          </select>
        </label>`;
    },
    execute: (form) => {
      const roles = form.getAll("roles");
      if (roles.length === 0) {
        throw new ApiError("VALIDATION_ERROR", t("administration.roleRequired"), undefined, 400);
      }
      const actorId = form.get("actorId").trim();
      const existing = state.administration.users.find((user) => user.actorId === actorId);
      const removesLastAdmin = existing?.status === "active"
        && existing.roles?.includes("organization_admin")
        && (form.get("status") !== "active" || !roles.includes("organization_admin"))
        && state.administration.users.filter(
          (candidate) =>
            candidate.actorId !== actorId
            && candidate.status === "active"
            && candidate.roles?.includes("organization_admin")
            && !["SUSPENDED", "REVOKED"].includes(candidate.trustState),
        ).length === 0;
      if (removesLastAdmin) {
        throw new ApiError("LAST_ADMIN_REQUIRED", t("administration.lastAdminRequired"), undefined, 409);
      }
      return api.administration.saveUser(actorId, {
        displayName: form.get("displayName").trim(),
        email: form.get("email").trim(),
        roles,
        status: form.get("status"),
      });
    },
    success: "success.adminUser",
    refresh: loadAdministration,
  },
};

async function pollJob(getJob, initial) {
  if (["failed", "rejected"].includes(initial?.status)) {
    throw new ApiError(
      initial.error?.code ?? "JOB_FAILED",
      initial.error?.message ?? t("error.jobFailed"),
      initial.error?.details,
    );
  }
  if (!initial?.id || initial.status === "completed") {
    return { data: initial };
  }
  let current = initial;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const response = await getJob(initial.id);
    current = response.data;
    if (["failed", "rejected"].includes(current.status)) {
      throw new ApiError(
        current.error?.code ?? "JOB_FAILED",
        current.error?.message ?? t("error.jobFailed"),
        current.error?.details,
      );
    }
    if (current.status === "completed") return response;
  }
  return { data: current };
}

function renderJobStatus(target, job) {
  if (!job) return;
  const download = job.downloadUrl
    ? `<a class="secondary-button" href="${escapeHtml(job.downloadUrl)}" target="_blank" rel="noopener">${escapeHtml(t("common.download"))}</a>`
    : "";
  target.innerHTML = `<strong>${escapeHtml(t("common.status"))}: ${escapeHtml(job.status ?? "—")}</strong>${download}`;
}

function openDialog(name, context) {
  const definition = dialogDefinitions[name];
  activeDialog = definition ? { ...definition, context } : null;
  if (!activeDialog) return;
  dialogTitle.textContent = t(activeDialog.title);
  dialogContent.innerHTML = activeDialog.content(context);
  dialogError.textContent = "";
  dialogSubmit.textContent = t(activeDialog.submit);
  dialogSubmit.disabled = false;
  dialog.showModal();
  dialogContent.querySelector("input")?.focus();
}

async function submitDialog(event) {
  if (event.submitter !== dialogSubmit || !activeDialog) return;
  event.preventDefault();
  const submission = activeDialog;
  const formElement = event.currentTarget;
  if (!formElement.reportValidity()) return;
  dialogError.textContent = "";
  dialogSubmit.disabled = true;
  dialogSubmit.textContent = t("common.saving");
  try {
    await submission.execute(new FormData(formElement), submission.context);
    dialog.close();
    showToast(t(submission.success));
    await submission.refresh?.();
  } catch (error) {
    dialogError.textContent = errorMessage(error);
    dialogSubmit.disabled = false;
    dialogSubmit.textContent = t(submission.submit);
  }
}

navLinks.forEach((link) => link.addEventListener("click", (event) => {
  event.preventDefault();
  history.replaceState(null, "", `#${link.dataset.view}`);
  showView(link.dataset.view);
}));
languageButtons.forEach((button) => button.addEventListener("click", () => setLanguage(button.dataset.language)));
document.querySelectorAll("[data-dialog]").forEach((button) =>
  button.addEventListener("click", () => openDialog(button.dataset.dialog)),
);
administrationRefresh.addEventListener("click", () => void loadAdministration());
administrationAddUser.addEventListener("click", () => openDialog("adminUser"));
administrationUserSearch.addEventListener("input", () => {
  state.administration.userSearch = administrationUserSearch.value.trim();
  renderAdministration();
});
administrationUserStatusFilter.addEventListener("change", () => {
  state.administration.userStatus = administrationUserStatusFilter.value;
  renderAdministration();
});
administrationDeviceSearch.addEventListener("input", () => {
  state.administration.deviceSearch = administrationDeviceSearch.value.trim();
  renderAdministration();
});
administrationDeviceStatusFilter.addEventListener("change", () => {
  state.administration.deviceStatus = administrationDeviceStatusFilter.value;
  renderAdministration();
});
administrationDevicePlatformFilter.addEventListener("change", () => {
  state.administration.devicePlatform = administrationDevicePlatformFilter.value;
  renderAdministration();
});

async function revokeAdministrationKey(keyId, button) {
  const reason = window.prompt(t("administration.revokeReasonPrompt"));
  if (!reason?.trim()) return;
  button.disabled = true;
  try {
    await api.administration.revokeKey(keyId, reason.trim());
    await loadAdministration();
    if (administrationDeviceDialog.open) {
      administrationDeviceDialog.close();
    }
    showToast(t("success.keyRevoked"));
  } catch (error) {
    state.administration.error = error;
    renderAdministration();
  } finally {
    button.disabled = false;
  }
}

document.querySelector("#administration").addEventListener("click", (event) => {
  const editUserButton = event.target.closest("[data-edit-user]");
  if (editUserButton) {
    openDialog("adminUser", editUserButton.dataset.editUser);
    return;
  }
  const userStatusButton = event.target.closest("[data-user-status]");
  if (userStatusButton) {
    const user = state.administration.users.find((item) => item.actorId === userStatusButton.dataset.userId);
    if (!user) return;
    const reason = window.prompt(t("administration.statusReasonPrompt"));
    if (!reason?.trim()) return;
    userStatusButton.disabled = true;
    void api.administration.saveUser(user.actorId, {
      ...(user.displayName ? { displayName: user.displayName } : {}),
      ...(user.email ? { email: user.email } : {}),
      roles: user.roles ?? [],
      status: userStatusButton.dataset.userStatus,
    }).then(() => api.administration.setUserTrust(user.actorId, {
      state: userStatusButton.dataset.userStatus === "suspended" ? "SUSPENDED" : "UNVERIFIED",
      reason: reason.trim(),
      details: { source: "user_status_change" },
    })).then(async () => {
      await loadAdministration();
      showToast(t("success.userStatus"));
    }).catch((error) => {
      state.administration.error = error;
      renderAdministration();
    }).finally(() => {
      userStatusButton.disabled = false;
    });
    return;
  }
  const deviceDetailsButton = event.target.closest("[data-device-details]");
  if (deviceDetailsButton) {
    void showDeviceDetails(deviceDetailsButton.dataset.deviceDetails);
    return;
  }
  const deviceStatusButton = event.target.closest("[data-device-status]");
  if (deviceStatusButton) {
    const reason = window.prompt(t("administration.statusReasonPrompt"));
    if (!reason?.trim()) return;
    deviceStatusButton.disabled = true;
    void api.administration.setDeviceStatus(deviceStatusButton.dataset.deviceId, {
      status: deviceStatusButton.dataset.deviceStatus,
      reason: reason.trim(),
    }).then(async () => {
      await loadAdministration();
      showToast(t("success.deviceStatus"));
    }).catch((error) => {
      state.administration.error = error;
      renderAdministration();
    }).finally(() => {
      deviceStatusButton.disabled = false;
    });
    return;
  }
  const trustButton = event.target.closest("[data-trust-scope]");
  if (trustButton) {
    const reason = window.prompt(t("administration.reasonPrompt"));
    if (!reason?.trim()) return;
    const action = trustButton.dataset.trustScope === "user"
      ? api.administration.setUserTrust
      : api.administration.setDeviceTrust;
    trustButton.disabled = true;
    void action(trustButton.dataset.trustId, {
      state: trustButton.dataset.trustState,
      reason: reason.trim(),
      details: {},
    }).then(loadAdministration).catch((error) => {
      state.administration.error = error;
      renderAdministration();
    }).finally(() => {
      trustButton.disabled = false;
    });
    return;
  }
  const revokeButton = event.target.closest("[data-revoke-key]");
  if (!revokeButton) return;
  void revokeAdministrationKey(revokeButton.dataset.revokeKey, revokeButton);
});
administrationDeviceDialog.querySelector(".dialog-close").addEventListener("click", () => administrationDeviceDialog.close());
administrationDeviceDialog.addEventListener("click", (event) => {
  const revokeButton = event.target.closest("[data-revoke-key]");
  if (revokeButton) {
    void revokeAdministrationKey(revokeButton.dataset.revokeKey, revokeButton);
  }
});
dialog.querySelector("form").addEventListener("submit", submitDialog);
dialog.querySelectorAll("[value='cancel']").forEach((button) => {
  button.addEventListener("click", () => dialog.close());
});
dialog.addEventListener("close", () => {
  dialog.querySelector("form").reset();
  activeDialog = null;
});
authButton.addEventListener("click", () => {
  renderAuth();
  authDialog.showModal();
});
authDialog.querySelector(".dialog-close").addEventListener("click", () => authDialog.close());
authMode.addEventListener("click", () => {
  authAction = authAction === "signIn" ? "signUp" : "signIn";
  authState.error = null;
  renderAuth();
});
authForgotPassword.addEventListener("click", () => {
  authAction = "requestReset";
  authState.error = null;
  renderAuth();
});
authDialog.querySelectorAll(".auth-back-to-sign-in").forEach((button) => {
  button.addEventListener("click", () => {
    authAction = "signIn";
    resetToken = null;
    authState.error = null;
    history.replaceState(null, "", `${location.pathname}${location.hash}`);
    renderAuth();
  });
});
authProviderButtons.addEventListener("click", (event) => {
  const button = event.target.closest("[data-auth-provider]");
  if (!button) return;
  const callbackURL = `${location.origin}${location.pathname}`;
  void runAuthAction(() => auth.signInWithProvider(button.dataset.authProvider, callbackURL));
});
authSignedOut.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(authSignedOut);
  void runAuthAction(() => authAction === "signIn"
    ? auth.signIn(form.get("email").trim(), form.get("password"))
    : auth.signUp(form.get("name").trim(), form.get("email").trim(), form.get("password")));
});
authResetRequest.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(authResetRequest);
  const redirectTo = new URL(location.pathname, location.origin);
  redirectTo.searchParams.set("password-reset", "1");
  void runAuthAction(async () => {
    await auth.requestPasswordReset(form.get("email").trim(), redirectTo.toString());
    authAction = "signIn";
    authResetRequest.reset();
    showToast(t("auth.resetEmailSent"));
  });
});
authResetPassword.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(authResetPassword);
  const password = form.get("password");
  if (password !== form.get("confirmPassword")) {
    authState.error = new AuthError("PASSWORD_MISMATCH", t("auth.passwordMismatch"));
    renderAuth();
    return;
  }
  void runAuthAction(async () => {
    await auth.resetPassword(password, resetToken);
    resetToken = null;
    authAction = "signIn";
    authResetPassword.reset();
    history.replaceState(null, "", `${location.pathname}${location.hash}`);
    showToast(t("auth.passwordResetComplete"));
  });
});
organizationForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const form = new FormData(organizationForm);
  void runAuthAction(() => auth.createOrganization(
    form.get("name").trim(),
    form.get("slug").trim(),
  ));
});
organizationSelect.addEventListener("change", () => {
  organizationSelectButton.disabled = !organizationSelect.value;
});
organizationSelectButton.addEventListener("click", () => {
  if (organizationSelect.value) {
    void runAuthAction(() => auth.setActiveOrganization(organizationSelect.value));
  }
});
signOutButton.addEventListener("click", () => void runAuthAction(async () => {
  await auth.signOut();
  authState.session = null;
  authState.organizations = [];
  clearResources();
}));

if (!balance.balanced) console.warn("Shipment mass balance is not balanced", balance);
setLanguage(activeLanguage);
if (resetToken) authDialog.showModal();
void refreshAuth().then(() => {
  if (authState.session?.session?.activeOrganizationId) {
    return loadResources().then(() => {
      if (location.hash === "#administration") return loadAdministration();
      return undefined;
    });
  }
  renderSuppliers();
  renderPlots();
  renderShipments();
});
