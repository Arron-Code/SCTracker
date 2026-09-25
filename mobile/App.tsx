import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { File, Paths } from "expo-file-system";
import * as Location from "expo-location";
import * as Linking from "expo-linking";
import * as Sharing from "expo-sharing";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StatusBar as NativeStatusBar,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import {
  ApiError,
  configureApiAuth,
  configureApiDevice,
  getApiBaseUrl,
  getOperation,
  requestOperation,
  submitDds,
  uploadDocument,
  validateDds,
} from "./src/api";
import {
  authConfigured,
  getAccessToken,
  getSession,
  listOrganizations,
  requestPasswordReset,
  resetPassword,
  sendEmailVerificationOtp,
  setActiveOrganization,
  signIn,
  signOut,
  verifyEmailOtp,
} from "./src/auth";
import {
  AuthError,
  isValidEmailVerificationOtp,
  normalizeEmailVerificationOtp,
  passwordResetTokenFromUrl,
  sessionFromSignInResult,
  type AuthOrganization,
  type AuthSession,
} from "./src/auth-core";
import {
  closePolygon,
  createUuid,
  parsePolygon,
  type GeoJsonPolygon,
  type Geofence,
  type OperationalRequest,
  type PersistedState,
  type Plot,
  type Position,
  type Supplier,
  type SyncConflict,
} from "./src/domain";
import { GeofenceEditor } from "./src/GeofenceEditor";
import { authActorId, authTenantId, sha256Base64 } from "./src/crypto-core";
import { encryptExport } from "./src/encrypted-export";
import {
  centerOfPositions,
  circleToPolygon,
  radiusFromHectares,
} from "./src/geofence";
import { synchronizeGeofencing } from "./src/geofencing-task";
import { randomBytes } from "./src/secure-crypto";
import {
  isLanguage,
  languages,
  translations,
  type Language,
  type Translation,
} from "./src/i18n";
import { LANGUAGE_STORAGE_KEY, loadState, saveState } from "./src/storage";
import { synchronize } from "./src/sync";

type Tab = "home" | "suppliers" | "plots" | "operations" | "help";

configureApiAuth(authConfigured ? getAccessToken : null);

const palette = {
  ink: "#14251D",
  forest: "#1F5A43",
  dark: "#174735",
  paper: "#F4F2EA",
  panel: "#FFFEFA",
  line: "#DDE0D8",
  muted: "#68766F",
  lime: "#CADB84",
  amber: "#C88124",
  red: "#A64536",
  softGreen: "#DDEADF",
  softAmber: "#F8E8CE",
  softRed: "#F7DED9",
};

function statusLabel(status: string, t: Translation) {
  if (status === "synced" || status === "completed") return t.common.synced;
  if (status === "conflict") return t.common.conflict;
  if (status === "failed" || status === "not_configured") return t.common.failed;
  return t.common.pending;
}

function Button({
  label,
  icon,
  onPress,
  secondary = false,
  disabled = false,
  loading = false,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  loading?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled: disabled || loading }}
      style={[
        styles.button,
        secondary && styles.buttonSecondary,
        (disabled || loading) && styles.buttonDisabled,
      ]}
    >
      {loading
        ? <ActivityIndicator size="small" color={secondary ? palette.forest : "#FFFFFF"} />
        : <Ionicons name={icon} size={18} color={secondary ? palette.forest : "#FFFFFF"} />}
      <Text style={[styles.buttonText, secondary && styles.buttonTextSecondary]}>{label}</Text>
    </Pressable>
  );
}

function Field({
  label,
  value,
  onChangeText,
  multiline = false,
  placeholder,
  keyboardType,
  secureTextEntry = false,
  autoCapitalize = "sentences",
  autoCorrect = true,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad" | "email-address" | "number-pad";
  secureTextEntry?: boolean;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
}) {
  return (
    <View>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#98A29C"
        multiline={multiline}
        keyboardType={keyboardType}
        secureTextEntry={secureTextEntry}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        style={[styles.input, multiline && styles.textArea]}
        accessibilityLabel={label}
      />
    </View>
  );
}

function Badge({ status, t }: { status: string; t: Translation }) {
  const bad = status === "failed" || status === "conflict" || status === "not_configured";
  const good = status === "synced" || status === "completed" || status === "uploaded";
  return (
    <View style={[styles.badge, good && styles.badgeGood, bad && styles.badgeBad]}>
      <Text style={[styles.badgeText, good && styles.goodText, bad && styles.badText]}>
        {statusLabel(status, t)}
      </Text>
    </View>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
      {children}
    </View>
  );
}

function HomeScreen({ state, t }: { state: PersistedState; t: Translation }) {
  return (
    <>
      <View style={styles.hero}>
        <Text style={styles.heroTitle}>{t.home.title}</Text>
        <Text style={styles.heroBody}>{t.home.intro}</Text>
        <View style={styles.metrics}>
          {[
            [t.home.suppliers, state.suppliers.length],
            [t.home.plots, state.plots.length],
            [t.home.documents, state.documents.length],
          ].map(([label, value]) => (
            <View key={String(label)} style={styles.metric}>
              <Text style={styles.metricValue}>{value}</Text>
              <Text style={styles.metricLabel}>{label}</Text>
            </View>
          ))}
        </View>
      </View>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.sync.lastSync}</Text>
        <Text style={styles.description}>
          {state.lastSyncAt ? new Date(state.lastSyncAt).toLocaleString() : t.sync.never}
        </Text>
        <Text style={styles.caption}>{state.outbox.length} {t.sync.queued}</Text>
      </View>
    </>
  );
}

function SuppliersScreen({
  state,
  update,
  t,
}: {
  state: PersistedState;
  update: (recipe: (current: PersistedState) => PersistedState) => void;
  t: Translation;
}) {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [region, setRegion] = useState("");

  function addSupplier() {
    if (!name.trim() || !country.trim() || !region.trim()) {
      Alert.alert(t.alerts.required);
      return;
    }
    const now = new Date().toISOString();
    const supplier: Supplier = {
      id: createUuid(),
      name: name.trim(),
      country: country.trim(),
      region: region.trim(),
      producerCount: 0,
      plotCount: 0,
      updatedAt: now,
      syncStatus: "pending",
    };
    update((current) => ({
      ...current,
      suppliers: [supplier, ...current.suppliers],
      outbox: [
        ...current.outbox,
        {
          id: createUuid(),
          idempotencyKey: createUuid(),
          entityType: "supplier",
          entityId: supplier.id,
          action: "upsert",
          payload: supplier,
          createdAt: now,
          attempts: 0,
        },
      ],
    }));
    setName("");
    setCountry("");
    setRegion("");
    Alert.alert(t.alerts.saved);
  }

  return (
    <>
      <Section title={t.suppliers.title} description={t.suppliers.description} />
      <View style={styles.card}>
        <Field label={t.common.name} value={name} onChangeText={setName} />
        <Field label={t.common.country} value={country} onChangeText={setCountry} />
        <Field label={t.common.region} value={region} onChangeText={setRegion} />
        <Button label={t.suppliers.add} icon="person-add" onPress={addSupplier} />
      </View>
      {state.suppliers.length === 0 ? <Text style={styles.empty}>{t.suppliers.empty}</Text> : null}
      {state.suppliers.map((supplier) => (
        <View key={supplier.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{supplier.name}</Text>
              <Text style={styles.caption}>{supplier.country} · {supplier.region} · {supplier.id}</Text>
            </View>
            <Badge status={supplier.syncStatus} t={t} />
          </View>
          <Text style={styles.description}>
            {supplier.producerCount} {t.suppliers.producerCount} · {supplier.plotCount} {t.suppliers.plotCount}
          </Text>
        </View>
      ))}
    </>
  );
}

function PlotsScreen({
  state,
  update,
  t,
}: {
  state: PersistedState;
  update: (recipe: (current: PersistedState) => PersistedState) => void;
  t: Translation;
}) {
  const [producer, setProducer] = useState("");
  const [farm, setFarm] = useState("");
  const [area, setArea] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [points, setPoints] = useState<Position[]>([]);
  const [gpsPoints, setGpsPoints] = useState<Position[]>([]);
  const [geoJsonText, setGeoJsonText] = useState("");
  const [polygon, setPolygon] = useState<GeoJsonPolygon | null>(null);
  const [geofence, setGeofence] = useState<Geofence | null>(null);
  const [editorGeofence, setEditorGeofence] = useState<Geofence | null>(null);
  const [geofenceOpen, setGeofenceOpen] = useState(false);
  const [editingPlotId, setEditingPlotId] = useState<string | null>(null);
  const [fallbackOpen, setFallbackOpen] = useState(false);
  const [fallbackCountry, setFallbackCountry] = useState("");
  const [fallbackRegion, setFallbackRegion] = useState("");
  const [geocoding, setGeocoding] = useState(false);
  const [locating, setLocating] = useState(false);

  function parsedArea(): number | null {
    const value = Number(area.replace(",", "."));
    return Number.isFinite(value) && value > 0 ? value : null;
  }

  function createGeofence(
    center: Position,
    source: Geofence["source"],
    country?: string,
    region?: string,
  ): Geofence {
    const areaValue = parsedArea();
    if (!areaValue) throw new Error("Plot area is invalid.");
    return {
      center,
      radiusMeters: radiusFromHectares(areaValue),
      source,
      country,
      region,
      enabled: true,
      updatedAt: new Date().toISOString(),
    };
  }

  function openEditor(value: Geofence, plotId: string | null = null) {
    setEditingPlotId(plotId);
    setEditorGeofence(value);
    setGeofenceOpen(true);
  }

  async function geocodeAndOpen(country: string, region: string, source: Geofence["source"]) {
    setGeocoding(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(t.plots.permissionError);
        return;
      }
      const matches = await Location.geocodeAsync(`${region.trim()}, ${country.trim()}`);
      const match = matches[0];
      if (!match) {
        Alert.alert(t.geofencing.locationNotFound);
        return;
      }
      openEditor(createGeofence([match.longitude, match.latitude], source, country.trim(), region.trim()));
      setFallbackOpen(false);
    } catch {
      Alert.alert(t.geofencing.locationNotFound);
    } finally {
      setGeocoding(false);
    }
  }

  async function configureDraftGeofence() {
    if (!producer.trim() || !farm.trim() || !parsedArea()) {
      Alert.alert(t.alerts.required);
      return;
    }
    if (gpsPoints.length >= 3) {
      openEditor(createGeofence(centerOfPositions(gpsPoints.slice(0, 3)), "gps"));
      return;
    }
    const supplier = state.suppliers.find((item) => item.id === supplierId.trim());
    if (supplier?.country.trim() && supplier.region.trim()) {
      await geocodeAndOpen(supplier.country, supplier.region, "supplier");
      return;
    }
    setFallbackCountry(supplier?.country ?? "");
    setFallbackRegion(supplier?.region ?? "");
    setFallbackOpen(true);
  }

  function openStoredGeofence(plot: Plot) {
    const value =
      plot.geofence ??
      ({
        center: centerOfPositions(plot.polygon.coordinates[0]),
        radiusMeters: radiusFromHectares(Number(plot.areaHa)),
        source: "gps",
        enabled: true,
        updatedAt: new Date().toISOString(),
      } satisfies Geofence);
    openEditor(value, plot.id);
  }

  function saveGeofence(next: Geofence) {
    setGeofenceOpen(false);
    if (!editingPlotId) {
      setGeofence(next);
      if (!polygon) {
        const nextPolygon = circleToPolygon(next.center, next.radiusMeters);
        setPolygon(nextPolygon);
        setGeoJsonText(JSON.stringify(nextPolygon, null, 2));
      }
      return;
    }

    const now = new Date().toISOString();
    const plot = state.plots.find((item) => item.id === editingPlotId);
    if (!plot) {
      Alert.alert(t.geofencing.plotNotFound);
      return;
    }
    const updatedPlot: Plot = {
      ...plot,
      geofence: next,
      updatedAt: now,
      syncStatus: "pending",
    };
    const updatedPlots = state.plots.map((item) => item.id === plot.id ? updatedPlot : item);
    update((current) => ({
      ...current,
      plots: updatedPlots,
      outbox: [
        ...current.outbox.filter(
          (item) => item.entityType !== "plot" || item.entityId !== plot.id,
        ),
        {
          id: createUuid(),
          idempotencyKey: createUuid(),
          entityType: "plot",
          entityId: plot.id,
          action: "upsert",
          payload: updatedPlot,
          expectedUpdatedAt: plot.updatedAt,
          createdAt: now,
          attempts: 0,
        },
      ],
    }));
    setEditingPlotId(null);
    Alert.alert(t.geofencing.saved);
  }

  function applyPolygonText(value = geoJsonText) {
    try {
      const next = parsePolygon(value);
      setPolygon(next);
      setPoints(next.coordinates[0].slice(0, -1));
      setGpsPoints([]);
      setGeoJsonText(JSON.stringify(next, null, 2));
    } catch {
      Alert.alert(t.plots.invalidPolygon);
    }
  }

  async function capturePoint() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(t.plots.permissionError);
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const next: Position[] = [
        ...gpsPoints,
        [location.coords.longitude, location.coords.latitude],
      ];
      setGpsPoints(next);
      setPoints(next);
      if (next.length >= 3) {
        const nextPolygon = closePolygon(next);
        setPolygon(nextPolygon);
        setGeoJsonText(JSON.stringify(nextPolygon, null, 2));
      }
    } catch {
      Alert.alert(t.plots.gpsError);
    } finally {
      setLocating(false);
    }
  }

  async function importGeoJson() {
    const result = await DocumentPicker.getDocumentAsync({
      type: ["application/geo+json", "application/json", "text/json"],
      copyToCacheDirectory: true,
    });
    if (result.canceled) return;
    try {
      const text = await fetch(result.assets[0].uri).then((response) => response.text());
      setGeoJsonText(text);
      applyPolygonText(text);
    } catch {
      Alert.alert(t.plots.invalidPolygon);
    }
  }

  function savePlot() {
    if (!producer.trim() || !farm.trim() || !area.trim() || !polygon) {
      Alert.alert(t.alerts.required);
      return;
    }
    const areaValue = parsedArea();
    if (!areaValue) {
      Alert.alert(t.plots.invalidPolygon);
      return;
    }
    const now = new Date().toISOString();
    const plot: Plot = {
      id: createUuid(),
      supplierId: supplierId.trim() || undefined,
      producer: producer.trim(),
      farmName: farm.trim(),
      areaHa: areaValue.toFixed(2),
      polygon,
      ...(geofence ? { geofence } : {}),
      capturedAt: now,
      updatedAt: now,
      syncStatus: "pending",
    };
    update((current) => ({
      ...current,
      plots: [plot, ...current.plots],
      outbox: [
        ...current.outbox,
        {
          id: createUuid(),
          idempotencyKey: createUuid(),
          entityType: "plot",
          entityId: plot.id,
          action: "upsert",
          payload: plot,
          createdAt: now,
          attempts: 0,
        },
      ],
    }));
    setProducer("");
    setFarm("");
    setArea("");
    setSupplierId("");
    setPoints([]);
    setGpsPoints([]);
    setPolygon(null);
    setGeofence(null);
    setGeoJsonText("");
    Alert.alert(t.alerts.saved);
  }

  return (
    <>
      <Section title={t.plots.title} description={t.plots.description} />
      <View style={styles.card}>
        <Field label={t.plots.producer} value={producer} onChangeText={setProducer} />
        <Field label={t.plots.farm} value={farm} onChangeText={setFarm} />
        <Field label={t.plots.area} value={area} onChangeText={setArea} keyboardType="decimal-pad" />
        <Field label={t.plots.supplierId} value={supplierId} onChangeText={setSupplierId} />
        <Text style={styles.caption}>{t.plots.pointCount}: {points.length}</Text>
        <Button
          label={locating ? "GPS ..." : t.plots.capturePoint}
          icon="locate"
          onPress={() => void capturePoint()}
          secondary
          disabled={locating}
        />
        <Button label={t.plots.importGeoJson} icon="document-attach" onPress={() => void importGeoJson()} secondary />
        <Field
          label={t.plots.polygonJson}
          value={geoJsonText}
          onChangeText={setGeoJsonText}
          multiline
          placeholder='{"type":"Polygon","coordinates":[...]}'
        />
        <Button label={t.plots.applyGeoJson} icon="checkmark-circle" onPress={() => applyPolygonText()} secondary />
        <Button
          label={t.geofencing.configure}
          icon="navigate-circle"
          onPress={() => void configureDraftGeofence()}
          secondary
          disabled={!producer.trim() || !farm.trim() || !parsedArea()}
        />
        {geofence ? (
          <Text style={styles.caption}>
            {t.geofencing.radius}: {Math.round(geofence.radiusMeters)} m
          </Text>
        ) : null}
        <Button label={t.plots.saveDraft} icon="save" onPress={savePlot} />
      </View>
      {state.plots.length === 0 ? <Text style={styles.empty}>{t.plots.empty}</Text> : null}
      {state.plots.map((plot) => (
        <View key={plot.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{plot.farmName}</Text>
              <Text style={styles.caption}>{plot.producer} · {plot.areaHa} ha</Text>
            </View>
            <Badge status={plot.syncStatus} t={t} />
          </View>
          <Button
            label={t.geofencing.open}
            icon="navigate-circle"
            onPress={() => openStoredGeofence(plot)}
            secondary
          />
          <Text style={styles.mono}>{JSON.stringify(plot.polygon)}</Text>
        </View>
      ))}
      <Modal visible={fallbackOpen} transparent animationType="fade" onRequestClose={() => setFallbackOpen(false)}>
        <View style={styles.modal}>
          <View style={styles.dialog}>
            <Text style={styles.cardTitle}>{t.geofencing.locationRequired}</Text>
            <Text style={styles.description}>{t.geofencing.locationRequiredDetail}</Text>
            <Field label={t.common.country} value={fallbackCountry} onChangeText={setFallbackCountry} />
            <Field label={t.common.region} value={fallbackRegion} onChangeText={setFallbackRegion} />
            <View style={styles.buttonRow}>
              <Button label={t.close} icon="close" onPress={() => setFallbackOpen(false)} secondary />
              <Button
                label={geocoding ? t.geofencing.locating : t.geofencing.useLocation}
                icon="search"
                onPress={() => void geocodeAndOpen(fallbackCountry, fallbackRegion, "manual")}
                disabled={geocoding || !fallbackCountry.trim() || !fallbackRegion.trim()}
              />
            </View>
          </View>
        </View>
      </Modal>
      <GeofenceEditor
        visible={geofenceOpen}
        value={editorGeofence}
        labels={{
          title: t.geofencing.title,
          centerHint: t.geofencing.centerHint,
          radius: t.geofencing.radius,
          save: t.common.save,
          cancel: t.close,
        }}
        onSave={saveGeofence}
        onClose={() => {
          setGeofenceOpen(false);
          setEditorGeofence(null);
          setEditingPlotId(null);
        }}
      />
    </>
  );
}

function OperationsScreen({
  state,
  update,
  t,
}: {
  state: PersistedState;
  update: (recipe: (current: PersistedState) => PersistedState) => void;
  t: Translation;
}) {
  const [subjectId, setSubjectId] = useState("");
  const [exportPassphrase, setExportPassphrase] = useState("");
  const configured = getApiBaseUrl() !== null;

  function providerError(error: unknown): string {
    if (error instanceof ApiError && error.code === "NOT_CONFIGURED") {
      return t.operations.providerBlocked;
    }
    return error instanceof Error ? error.message : String(error);
  }

  async function pickAndUpload() {
    if (!configured) {
      Alert.alert(t.sync.notConfigured, t.operations.providerBlocked);
      return;
    }
    if (exportPassphrase.normalize("NFKC").length < 12) {
      Alert.alert(t.operations.encryptionRequired, t.operations.passphraseHint);
      return;
    }
    const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    const localId = createUuid();
    const encryptedName = `${asset.name}.sctpkg`;
    update((current) => ({
      ...current,
      documents: [{
        id: localId,
        fileName: encryptedName,
        mimeType: "application/vnd.sctracker.encrypted-package",
        size: asset.size ?? 0,
        status: "uploading",
        createdAt: new Date().toISOString(),
      }, ...current.documents],
    }));
    let encryptedFile: File | null = null;
    try {
      const source = new File(asset.uri);
      const encrypted = await encryptExport(
        await source.bytes(),
        exportPassphrase,
        randomBytes,
        asset.name,
        asset.mimeType ?? "application/octet-stream",
      );
      encryptedFile = new File(Paths.cache, `upload-${localId}.sctpkg`);
      if (encryptedFile.exists) encryptedFile.delete();
      encryptedFile.create();
      encryptedFile.write(encrypted);
      const uploaded = await uploadDocument({
        uri: encryptedFile.uri,
        name: encryptedName,
        mimeType: "application/vnd.sctracker.encrypted-package",
        size: encrypted.length,
        sha256: sha256Base64(encrypted),
        idempotencyKey: localId,
      });
      update((current) => ({
        ...current,
        documents: current.documents.map((document) =>
          document.id === localId
            ? { ...document, id: uploaded.id, status: "uploaded" }
            : document,
        ),
      }));
    } catch (error) {
      update((current) => ({
        ...current,
        documents: current.documents.map((document) =>
          document.id === localId ? { ...document, status: "failed" } : document,
        ),
      }));
      Alert.alert(t.common.failed, providerError(error));
    } finally {
      if (encryptedFile?.exists) encryptedFile.delete();
      if (asset.uri.startsWith(Paths.cache.uri)) {
        const copiedSource = new File(asset.uri);
        if (copiedSource.exists) copiedSource.delete();
      }
    }
  }

  async function create(kind: OperationalRequest["kind"]) {
    if (!subjectId.trim()) {
      Alert.alert(t.alerts.required);
      return;
    }
    if (!configured) {
      Alert.alert(t.sync.notConfigured, t.operations.providerBlocked);
      return;
    }
    try {
      const result = await requestOperation(kind, subjectId.trim(), createUuid());
      update((current) => ({ ...current, operations: [result, ...current.operations] }));
    } catch (error) {
      Alert.alert(t.common.failed, providerError(error));
    }
  }

  async function refresh(operation: OperationalRequest) {
    try {
      const result = await getOperation(operation.kind, operation.id);
      update((current) => ({
        ...current,
        operations: current.operations.map((item) => item.id === result.id ? result : item),
      }));
    } catch (error) {
      Alert.alert(t.common.failed, providerError(error));
    }
  }

  async function mutateDds(operation: OperationalRequest, action: "validate" | "submit") {
    try {
      const result = action === "validate"
        ? await validateDds(operation.id, createUuid())
        : await submitDds(operation.id, createUuid());
      update((current) => ({
        ...current,
        operations: current.operations.map((item) => item.id === result.id ? result : item),
      }));
    } catch (error) {
      Alert.alert(t.common.failed, providerError(error));
    }
  }

  async function downloadAndShare(operation: OperationalRequest) {
    if (!operation.downloadUrl) return;
    if (exportPassphrase.normalize("NFKC").length < 12) {
      Alert.alert(t.operations.encryptionRequired, t.operations.passphraseHint);
      return;
    }
    try {
      const response = await fetch(operation.downloadUrl);
      if (!response.ok) throw new Error(`Download failed with status ${response.status}.`);
      const encrypted = await encryptExport(
        new Uint8Array(await response.arrayBuffer()),
        exportPassphrase,
        randomBytes,
        `evidence-${operation.id}.json`,
        response.headers.get("content-type") ?? "application/json",
      );
      const file = new File(Paths.cache, `evidence-${operation.id}.sctpkg`);
      if (file.exists) file.delete();
      file.create();
      file.write(encrypted);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: "application/vnd.sctracker.encrypted-package",
          dialogTitle: t.operations.encryptedExport,
        });
      } else {
        Alert.alert(t.common.download, file.uri);
      }
    } catch (error) {
      Alert.alert(t.common.failed, providerError(error));
    }
  }

  return (
    <>
      <Section title={t.operations.title} />
      {!configured ? (
        <View style={styles.blocking}>
          <Ionicons name="warning" size={23} color={palette.red} />
          <View style={styles.flex}>
            <Text style={styles.blockingTitle}>{t.sync.notConfigured}</Text>
            <Text style={styles.description}>{t.sync.notConfiguredDetail}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.operations.documents}</Text>
        <Button label={t.operations.pickUpload} icon="cloud-upload" onPress={() => void pickAndUpload()} disabled={!configured} />
        {state.documents.map((document) => (
          <View key={document.id} style={styles.listRow}>
            <View style={styles.flex}>
              <Text style={styles.itemTitle}>{document.fileName}</Text>
              <Text style={styles.caption}>{document.mimeType} · {document.size} B</Text>
            </View>
            <Badge status={document.status} t={t} />
          </View>
        ))}
      </View>
      <View style={styles.card}>
        <Field label={t.common.subjectId} value={subjectId} onChangeText={setSubjectId} />
        <Field
          label={t.operations.exportPassphrase}
          value={exportPassphrase}
          onChangeText={setExportPassphrase}
          secureTextEntry
        />
        <Text style={styles.caption}>{t.operations.passphraseHint}</Text>
        <Text style={styles.cardTitle}>{t.operations.satellite}</Text>
        <Button label={t.operations.requestSatellite} icon="planet" onPress={() => void create("satellite")} disabled={!configured} />
        <Text style={styles.cardTitle}>{t.operations.evidence}</Text>
        <Button label={t.operations.requestEvidence} icon="archive" onPress={() => void create("evidence_pack")} disabled={!configured} />
        <Text style={styles.cardTitle}>{t.operations.dds}</Text>
        <Button label={t.operations.createDds} icon="document-text" onPress={() => void create("dds")} disabled={!configured} />
      </View>
      {state.operations.length === 0 ? <Text style={styles.empty}>{t.operations.noItems}</Text> : null}
      {state.operations.map((operation) => (
        <View key={operation.id} style={styles.card}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{operation.kind.replace("_", " ")}</Text>
              <Text style={styles.caption}>{operation.subjectId} · {operation.id}</Text>
            </View>
            <Badge status={operation.status} t={t} />
          </View>
          {operation.status === "not_configured" ? (
            <Text style={styles.errorText}>{t.operations.providerBlocked}</Text>
          ) : null}
          {operation.message ? <Text style={styles.description}>{operation.message}</Text> : null}
          <Button label={t.operations.checkStatus} icon="refresh" onPress={() => void refresh(operation)} secondary />
          {operation.kind === "dds" ? (
            <View style={styles.buttonRow}>
              <Button label={t.operations.validateDds} icon="checkmark" onPress={() => void mutateDds(operation, "validate")} secondary />
              <Button label={t.operations.submitDds} icon="send" onPress={() => void mutateDds(operation, "submit")} />
            </View>
          ) : null}
          {operation.kind === "evidence_pack" && operation.downloadUrl ? (
            <Button label={`${t.common.download} / ${t.common.share}`} icon="share" onPress={() => void downloadAndShare(operation)} />
          ) : null}
        </View>
      ))}
    </>
  );
}

function ConflictCard({
  conflict,
  resolve,
  t,
}: {
  conflict: SyncConflict;
  resolve: (conflict: SyncConflict, choice: "local" | "remote") => void;
  t: Translation;
}) {
  return (
    <View style={styles.conflictCard}>
      <Text style={styles.blockingTitle}>{t.common.conflict}: {conflict.entityType}</Text>
      <Text style={styles.caption}>{conflict.entityId}</Text>
      <Text style={styles.mono}>Local: {JSON.stringify(conflict.local)}</Text>
      <Text style={styles.mono}>Server: {JSON.stringify(conflict.remote)}</Text>
      <View style={styles.buttonRow}>
        <Button label={t.sync.keepLocal} icon="phone-portrait" onPress={() => resolve(conflict, "local")} secondary />
        <Button label={t.sync.useServer} icon="cloud" onPress={() => resolve(conflict, "remote")} />
      </View>
    </View>
  );
}

function isEmailVerificationRequired(error: unknown): boolean {
  return (error instanceof AuthError && error.code === "EMAIL_NOT_VERIFIED")
    || (error instanceof Error && error.message.toLowerCase().includes("email not verified"));
}

function AuthCard({
  session,
  organizations,
  loading,
  error,
  refresh,
  t,
}: {
  session: AuthSession | null;
  organizations: AuthOrganization[];
  loading: boolean;
  error: string | null;
  refresh: (fallbackSession?: AuthSession | null) => Promise<void>;
  t: Translation;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [verificationPassword, setVerificationPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [resetRequested, setResetRequested] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    function handleUrl(url: string | null) {
      const token = passwordResetTokenFromUrl(url);
      if (token) {
        setResetToken(token);
        setPassword("");
        setConfirmPassword("");
        setActionError(null);
      }
    }

    void Linking.getInitialURL().then(handleUrl);
    const subscription = Linking.addEventListener("url", ({ url }) => handleUrl(url));
    return () => subscription.remove();
  }, []);

  async function run(action: () => Promise<unknown>) {
    setSubmitting(true);
    setActionError(null);
    try {
      await action();
      await refresh();
    } catch (nextError) {
      setActionError(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setSubmitting(false);
    }
  }

  if (!authConfigured) {
    return (
      <View style={styles.blocking}>
        <Ionicons name="warning" size={23} color={palette.red} />
        <View style={styles.flex}>
          <Text style={styles.blockingTitle}>{t.auth.notConfigured}</Text>
          <Text style={styles.description}>{t.auth.notConfiguredDetail}</Text>
        </View>
      </View>
    );
  }

  if (loading) {
    return <ActivityIndicator size="small" color={palette.forest} />;
  }

  if (resetToken) {
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.auth.resetPassword}</Text>
        <Text style={styles.description}>{t.auth.resetPasswordHelp}</Text>
        <Field label={t.auth.newPassword} value={password} onChangeText={setPassword} secureTextEntry />
        <Field label={t.auth.confirmPassword} value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
        {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}
        <Button
          label={t.auth.resetPassword}
          icon="key"
          disabled={submitting || password.length < 8 || password !== confirmPassword}
          onPress={() => void run(async () => {
            await resetPassword(password, resetToken);
            setResetToken(null);
            setPassword("");
            setConfirmPassword("");
            setResetRequested(false);
          })}
        />
        <Button
          label={t.auth.backToSignIn}
          icon="arrow-back"
          secondary
          disabled={submitting}
          onPress={() => setResetToken(null)}
        />
      </View>
    );
  }

  if (!session) {
    if (verificationEmail) {
      return (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t.auth.verifyEmail}</Text>
          <Text style={styles.description}>{t.auth.verifyEmailHelp}</Text>
          <Text style={styles.caption}>{verificationEmail}</Text>
          <Field
            label={t.auth.verificationCode}
            value={verificationCode}
            onChangeText={(value) => setVerificationCode(normalizeEmailVerificationOtp(value))}
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {verificationSent ? <Text style={styles.successText}>{t.auth.verificationSent}</Text> : null}
          {actionError ?? error ? <Text style={styles.errorText}>{actionError ?? error}</Text> : null}
          <Button
            label={t.auth.confirmVerificationCode}
            icon="checkmark-circle"
            disabled={submitting || !isValidEmailVerificationOtp(verificationCode)}
            loading={submitting}
            onPress={() => void (async () => {
              setSubmitting(true);
              setActionError(null);
              setVerificationSent(false);
              try {
                await verifyEmailOtp(verificationEmail, verificationCode);
                const result = await signIn(verificationEmail, verificationPassword);
                const fallbackSession = sessionFromSignInResult(result);
                if (!fallbackSession) {
                  throw new Error("Sign-in succeeded without a valid user session.");
                }
                setVerificationEmail(null);
                setVerificationPassword("");
                setVerificationCode("");
                setPassword("");
                await refresh(fallbackSession);
              } catch (nextError) {
                const invalidCode = nextError instanceof AuthError
                  && ["INVALID_OTP", "OTP_EXPIRED", "TOO_MANY_ATTEMPTS"].includes(nextError.code);
                setActionError(
                  invalidCode
                    ? t.auth.verificationInvalid
                    : nextError instanceof Error ? nextError.message : String(nextError),
                );
              } finally {
                setSubmitting(false);
              }
            })()}
          />
          <Button
            label={t.auth.resendVerificationCode}
            icon="mail"
            secondary
            disabled={submitting}
            onPress={() => void (async () => {
              setSubmitting(true);
              setActionError(null);
              setVerificationSent(false);
              try {
                await sendEmailVerificationOtp(verificationEmail);
                setVerificationSent(true);
              } catch (nextError) {
                setActionError(nextError instanceof Error ? nextError.message : String(nextError));
              } finally {
                setSubmitting(false);
              }
            })()}
          />
          <Button
            label={t.auth.backToSignIn}
            icon="arrow-back"
            secondary
            disabled={submitting}
            onPress={() => {
              setVerificationEmail(null);
              setVerificationPassword("");
              setVerificationCode("");
              setVerificationSent(false);
              setActionError(null);
            }}
          />
        </View>
      );
    }

    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.auth.signIn}</Text>
        <Text style={styles.description}>{t.auth.accountProvided}</Text>
        <Field
          label={t.auth.email}
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Field
          label={t.auth.password}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
        />
        {actionError ?? error ? <Text style={styles.errorText}>{actionError ?? error}</Text> : null}
        <Button
          label={t.auth.signIn}
          icon="log-in"
          disabled={submitting || !email.trim() || !password}
          loading={signingIn}
          onPress={() => void (async () => {
            setSubmitting(true);
            setSigningIn(true);
            setActionError(null);
            try {
              const normalizedEmail = email.trim();
              const result = await signIn(normalizedEmail, password);
              const fallbackSession = sessionFromSignInResult(result);
              if (!fallbackSession) {
                throw new Error("Sign-in succeeded without a valid user session.");
              }
              await refresh(fallbackSession);
            } catch (nextError) {
              if (isEmailVerificationRequired(nextError)) {
                const normalizedEmail = email.trim();
                setVerificationEmail(normalizedEmail);
                setVerificationPassword(password);
                setVerificationCode("");
                setVerificationSent(false);
                try {
                  await sendEmailVerificationOtp(normalizedEmail);
                  setVerificationSent(true);
                } catch (otpError) {
                  setActionError(otpError instanceof Error ? otpError.message : String(otpError));
                }
              } else {
                setActionError(nextError instanceof Error ? nextError.message : String(nextError));
              }
            } finally {
              setSubmitting(false);
              setSigningIn(false);
            }
          })()}
        />
        <Button
          label={t.auth.forgotPassword}
          icon="mail"
          secondary
          disabled={submitting || !email.trim()}
          onPress={() => void run(async () => {
            await requestPasswordReset(
              email.trim(),
              "https://sc-tracker-meloy.vercel.app/mobile-reset.html",
            );
            setResetRequested(true);
          })}
        />
        {resetRequested ? <Text style={styles.successText}>{t.auth.resetSent}</Text> : null}
      </View>
    );
  }

  const activeOrganizationId = session.session.activeOrganizationId ?? null;
  return (
    <View style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={styles.flex}>
          <Text style={styles.cardTitle}>{session.user.name}</Text>
          <Text style={styles.caption}>{session.user.email}</Text>
        </View>
        <Button
          label={t.auth.signOut}
          icon="log-out"
          secondary
          disabled={submitting}
          onPress={() => void run(signOut)}
        />
      </View>
      <Text style={styles.label}>{t.auth.organization}</Text>
      {organizations.map((organization) => (
        <Pressable
          key={organization.id}
          onPress={() => void run(() => setActiveOrganization(organization.id))}
          disabled={submitting}
          style={[
            styles.organization,
            organization.id === activeOrganizationId && styles.organizationActive,
          ]}
          accessibilityRole="radio"
          accessibilityState={{ checked: organization.id === activeOrganizationId }}
        >
          <Text style={styles.itemTitle}>{organization.name}</Text>
          <Text style={styles.caption}>{organization.slug}</Text>
        </Pressable>
      ))}
      {!activeOrganizationId ? <Text style={styles.errorText}>{t.auth.organizationRequired}</Text> : null}
      <Text style={styles.description}>{t.auth.organizationManagedCentrally}</Text>
      {actionError ?? error ? <Text style={styles.errorText}>{actionError ?? error}</Text> : null}
    </View>
  );
}

function LanguageChooser({
  visible,
  language,
  onSelect,
  onClose,
  t,
}: {
  visible: boolean;
  language: Language;
  onSelect: (language: Language) => void;
  onClose: () => void;
  t: Translation;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modal}>
        <View style={styles.dialog}>
          <View style={styles.rowBetween}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{t.chooseLanguage}</Text>
              <Text style={styles.description}>{t.languageHint}</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel={t.close}>
              <Ionicons name="close" size={25} color={palette.ink} />
            </Pressable>
          </View>
          {languages.map((item) => (
            <Pressable
              key={item}
              onPress={() => onSelect(item)}
              style={[styles.language, item === language && styles.languageActive]}
              accessibilityRole="radio"
              accessibilityState={{ checked: item === language }}
            >
              <Text style={[styles.itemTitle, item === language && styles.languageText]}>
                {translations[item].languageCode} · {translations[item].languageName}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

export default function App() {
  const { width, height } = useWindowDimensions();
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [language, setLanguage] = useState<Language>("de");
  const [languageOpen, setLanguageOpen] = useState(false);
  const [state, setState] = useState<PersistedState | null>(null);
  const [loadedScope, setLoadedScope] = useState<string | null>(null);
  const [online, setOnline] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [organizations, setOrganizations] = useState<AuthOrganization[]>([]);
  const [authLoading, setAuthLoading] = useState(authConfigured);
  const [authError, setAuthError] = useState<string | null>(null);
  const persistReady = useRef(false);
  const stateScope = useRef("local");
  const monitoredGeofences = useRef("");
  const t = translations[language];
  const configured = getApiBaseUrl() !== null;
  const activeOrganizationId = authSession?.session.activeOrganizationId ?? null;
  const authorized = Boolean(activeOrganizationId);
  const activeScope = activeOrganizationId && authSession?.user.id
    ? `${authTenantId(activeOrganizationId)}:${authActorId(authSession.user.id)}`
    : "local";
  const wideLayout = width >= 840 && width > height;

  async function refreshAuth(fallbackSession: AuthSession | null = null) {
    if (!authConfigured) {
      setAuthLoading(false);
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    let nextSession: AuthSession | null = fallbackSession;
    try {
      nextSession = await getSession() ?? fallbackSession;
      setAuthSession(nextSession);
    } catch (error) {
      setAuthSession(fallbackSession);
      if (!fallbackSession) {
        setOrganizations([]);
        setAuthError(error instanceof Error ? error.message : String(error));
        setAuthLoading(false);
        return;
      }
    }

    if (!nextSession) {
      setOrganizations([]);
      setAuthLoading(false);
      return;
    }

    try {
      setOrganizations(await listOrganizations());
    } catch (error) {
      setOrganizations([]);
      setAuthError(error instanceof Error ? error.message : String(error));
    }
    setAuthLoading(false);
  }

  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(LANGUAGE_STORAGE_KEY)
      .then((storedLanguage) => {
        if (!active) return;
        if (isLanguage(storedLanguage)) setLanguage(storedLanguage);
      })
      .catch(() => Alert.alert(translations.de.alerts.storageError));
    const unsubscribe = NetInfo.addEventListener((network) => {
      setOnline(Boolean(network.isConnected && network.isInternetReachable !== false));
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    void refreshAuth();
  }, []);

  useEffect(() => {
    configureApiDevice(
      state && loadedScope === activeScope
        ? () => state.deviceId
        : null,
    );
    return () => configureApiDevice(null);
  }, [activeScope, loadedScope, state]);

  useEffect(() => {
    if (!state || !persistReady.current) return;
    void saveState(state, stateScope.current).catch(() => Alert.alert(t.alerts.storageError));
  }, [state, t.alerts.storageError]);

  useEffect(() => {
    if (authLoading) return;
    let active = true;
    persistReady.current = false;
    if (!authorized) {
      stateScope.current = "local";
      monitoredGeofences.current = "";
      setLoadedScope(null);
      setState(null);
      void synchronizeGeofencing([]).catch((error) => {
        console.error("Could not stop geofencing after sign out", error);
      });
      return () => {
        active = false;
      };
    }
    setLoadedScope(null);
    setState(null);
    void (async () => {
      await synchronizeGeofencing([]).catch((error) => {
        console.error("Could not stop geofencing during organization switch", error);
        Alert.alert(t.geofencing.backgroundPermissionError);
      });
      const nextState = await loadState(activeScope);
      if (!active) return;
      stateScope.current = activeScope;
      monitoredGeofences.current = "";
      setState(nextState);
      setLoadedScope(activeScope);
      persistReady.current = true;
    })().catch(() => {
      if (!active) return;
      persistReady.current = true;
      Alert.alert(t.alerts.storageError);
    });
    return () => {
      active = false;
    };
  }, [activeScope, authLoading, authorized, t.alerts.storageError, t.geofencing.backgroundPermissionError]);

  useEffect(() => {
    if (!state || !persistReady.current) return;
    const signature = state.plots
      .filter((plot) => plot.geofence?.enabled)
      .map((plot) => `${plot.id}:${plot.geofence!.center.join(",")}:${plot.geofence!.radiusMeters}`)
      .sort()
      .join("|");
    if (signature === monitoredGeofences.current) return;
    monitoredGeofences.current = signature;
    void synchronizeGeofencing(state.plots).catch(() => {
      monitoredGeofences.current = "";
      Alert.alert(t.geofencing.backgroundPermissionError);
    });
  }, [state, t.geofencing.backgroundPermissionError]);

  function update(recipe: (current: PersistedState) => PersistedState) {
    if (syncing) return;
    setState((current) => current ? recipe(current) : current);
  }

  async function syncNow() {
    if (!state || syncing) return;
    if (loadedScope !== activeScope) {
      setSyncError(t.auth.organizationRequired);
      return;
    }
    if (!configured) {
      setSyncError(t.sync.notConfiguredDetail);
      return;
    }
    if (!activeOrganizationId) {
      setSyncError(t.auth.organizationRequired);
      return;
    }
    setSyncing(true);
    setSyncError(null);
    const result = await synchronize(
      state,
      true,
      authSession?.user.id
        ? {
            actorId: authActorId(authSession.user.id),
            tenantId: authTenantId(activeOrganizationId),
          }
        : undefined,
      (nextState) => saveState(nextState, activeScope),
    );
    setState(result.state);
    if (result.error) setSyncError(result.error.message);
    setSyncing(false);
  }

  function resolveConflict(conflict: SyncConflict, choice: "local" | "remote") {
    update((current) => {
      const selected = choice === "local" ? conflict.local : conflict.remote;
      const now = new Date().toISOString();
      const remainingOutbox = current.outbox.filter(
        (item) =>
          item.entityType !== conflict.entityType || item.entityId !== conflict.entityId,
      );
      const base = {
        ...current,
        conflicts: current.conflicts.filter((item) => item.id !== conflict.id),
        outbox: remainingOutbox,
      };
      if (conflict.entityType === "supplier") {
        const supplier = { ...(selected as Supplier), syncStatus: choice === "local" ? "pending" as const : "synced" as const };
        return {
          ...base,
          suppliers: current.suppliers.map((item) => item.id === supplier.id ? supplier : item),
          outbox: choice === "local" ? [...remainingOutbox, {
            id: createUuid(), idempotencyKey: createUuid(), entityType: "supplier" as const,
            entityId: supplier.id, action: "upsert" as const, payload: supplier,
            expectedUpdatedAt: conflict.remote.updatedAt, createdAt: now, attempts: 0,
          }] : remainingOutbox,
        };
      }
      const plot = { ...(selected as Plot), syncStatus: choice === "local" ? "pending" as const : "synced" as const };
      return {
        ...base,
        plots: current.plots.map((item) => item.id === plot.id ? plot : item),
        outbox: choice === "local" ? [...remainingOutbox, {
          id: createUuid(), idempotencyKey: createUuid(), entityType: "plot" as const,
          entityId: plot.id, action: "upsert" as const, payload: plot,
          expectedUpdatedAt: conflict.remote.updatedAt, createdAt: now, attempts: 0,
        }] : remainingOutbox,
      };
    });
  }

  const screen = useMemo(() => {
    if (!state) return null;
    if (activeTab === "suppliers") return <SuppliersScreen state={state} update={update} t={t} />;
    if (activeTab === "plots") return <PlotsScreen state={state} update={update} t={t} />;
    if (activeTab === "operations") return <OperationsScreen state={state} update={update} t={t} />;
    if (activeTab === "help") return <Section title={t.help.title} description={t.help.body} />;
    return <HomeScreen state={state} t={t} />;
  }, [activeTab, state, t]);

  if (authLoading || (authorized && (!state || loadedScope !== activeScope))) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ActivityIndicator style={styles.loader} size="large" color={palette.lime} />
      </SafeAreaView>
    );
  }

  if (!authorized) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View style={styles.header}>
          <View style={styles.logo}><Text style={styles.logoText}>SC</Text></View>
          <View style={styles.flex}>
            <Text style={styles.brand}>SCTracker</Text>
            <Text style={styles.headerSub}>{t.brandSubtitle}</Text>
          </View>
          <Pressable
            style={styles.languageButton}
            onPress={() => setLanguageOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t.chooseLanguage}
          >
            <Ionicons name="language" size={20} color="#FFFFFF" />
            <Text style={styles.languageCode}>{t.languageCode}</Text>
          </Pressable>
        </View>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.authPage, wideLayout && styles.authPageWide]}
          keyboardShouldPersistTaps="always"
        >
          <View style={styles.authContainer}>
            <View style={styles.authIntro}>
              <Text style={styles.authTitle}>SCTracker</Text>
              <Text style={styles.authSubtitle}>{t.brandSubtitle}</Text>
            </View>
            <AuthCard
              session={authSession}
              organizations={organizations}
              loading={false}
              error={authError}
              refresh={refreshAuth}
              t={t}
            />
          </View>
        </ScrollView>
        <LanguageChooser
          visible={languageOpen}
          language={language}
          onClose={() => setLanguageOpen(false)}
          onSelect={(next) => {
            setLanguage(next);
            setLanguageOpen(false);
            void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next).catch(() => Alert.alert(translations[next].alerts.storageError));
          }}
          t={t}
        />
      </SafeAreaView>
    );
  }

  if (!state) return null;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.logo}><Text style={styles.logoText}>SC</Text></View>
        <View style={styles.flex}>
          <Text style={styles.brand}>SCTracker</Text>
          <Text style={styles.headerSub}>{t.brandSubtitle}</Text>
        </View>
        <View style={[styles.connectivity, !configured && styles.connectivityBlocked]}>
          <View style={[styles.dot, !online && styles.dotOffline]} />
          <Text style={styles.connectivityText}>
            {!configured ? t.sync.notConfigured : online ? t.sync.online : t.sync.offline}
          </Text>
        </View>
        <Pressable
          style={styles.languageButton}
          onPress={() => setLanguageOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t.chooseLanguage}
        >
          <Ionicons name="language" size={20} color="#FFFFFF" />
          <Text style={styles.languageCode}>{t.languageCode}</Text>
        </Pressable>
      </View>
      <View style={styles.syncBar}>
        <Text style={[styles.syncText, syncError && styles.errorText]} numberOfLines={2}>
          {syncing ? t.sync.syncing : syncError ?? `${state.outbox.length} ${t.sync.queued}`}
        </Text>
        <Button
          label={syncing ? t.sync.syncing : syncError ? t.common.retry : t.sync.syncNow}
          icon={syncError ? "refresh" : "cloud-upload"}
          onPress={() => void syncNow()}
          secondary
          disabled={syncing || !online || !configured || !authorized}
        />
      </View>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, wideLayout && styles.contentWide]}
        keyboardShouldPersistTaps="handled"
      >
        {!configured ? (
          <View style={styles.blocking}>
            <Ionicons name="warning" size={23} color={palette.red} />
            <View style={styles.flex}>
              <Text style={styles.blockingTitle}>{t.sync.notConfigured}</Text>
              <Text style={styles.description}>{t.sync.notConfiguredDetail}</Text>
            </View>
          </View>
        ) : null}
        <AuthCard session={authSession} organizations={organizations} loading={false} error={authError} refresh={refreshAuth} t={t} />
        {state.conflicts.length > 0 ? (
          <Section title={t.sync.conflicts}>
            {state.conflicts.map((conflict) => (
              <ConflictCard key={conflict.id} conflict={conflict} resolve={resolveConflict} t={t} />
            ))}
          </Section>
        ) : null}
        {screen}
      </ScrollView>
      <View style={styles.tabs}>
        {([
          ["home", "home", t.tabs.home],
          ["suppliers", "people", t.tabs.suppliers],
          ["plots", "map", t.tabs.plots],
          ["operations", "briefcase", t.tabs.operations],
          ["help", "help-circle", t.tabs.help],
        ] as const).map(([tab, icon, label]) => (
          <Pressable
            key={tab}
            onPress={() => setActiveTab(tab)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === tab }}
          >
            <Ionicons name={activeTab === tab ? icon : `${icon}-outline`} size={21} color={activeTab === tab ? palette.forest : palette.muted} />
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]} numberOfLines={1}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <LanguageChooser
        visible={languageOpen}
        language={language}
        onClose={() => setLanguageOpen(false)}
        onSelect={(next) => {
          setLanguage(next);
          setLanguageOpen(false);
          void AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, next).catch(() => Alert.alert(translations[next].alerts.storageError));
        }}
        t={t}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight : 0, backgroundColor: palette.ink },
  loader: { flex: 1 },
  header: { minHeight: 68, flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 14, backgroundColor: palette.ink },
  logo: { width: 38, height: 38, alignItems: "center", justifyContent: "center", borderRadius: 11, backgroundColor: palette.lime },
  logoText: { color: palette.ink, fontWeight: "900" },
  brand: { color: "#FFFFFF", fontSize: 17, fontWeight: "800" },
  headerSub: { color: "#AFC0B7", fontSize: 9 },
  flex: { flex: 1 },
  connectivity: { maxWidth: 100, flexDirection: "row", alignItems: "center", gap: 5, padding: 7, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.1)" },
  connectivityBlocked: { backgroundColor: "rgba(166,69,54,0.35)" },
  connectivityText: { flexShrink: 1, color: "#FFFFFF", fontSize: 8, fontWeight: "700" },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.lime },
  dotOffline: { backgroundColor: palette.amber },
  languageButton: { minWidth: 45, height: 40, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, borderRadius: 9, backgroundColor: "rgba(255,255,255,0.1)" },
  languageCode: { color: "#FFFFFF", fontSize: 8, fontWeight: "800" },
  syncBar: { minHeight: 52, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, backgroundColor: palette.softGreen },
  syncText: { flex: 1, color: palette.forest, fontSize: 10, fontWeight: "700" },
  scroll: { flex: 1, backgroundColor: palette.paper },
  content: { gap: 13, padding: 15, paddingBottom: 28 },
  contentWide: { width: "100%", maxWidth: 1180, alignSelf: "center", paddingHorizontal: 28 },
  authPage: { flexGrow: 1, justifyContent: "center", padding: 20 },
  authPageWide: { paddingVertical: 36 },
  authContainer: { width: "100%", maxWidth: 560, alignSelf: "center", gap: 18 },
  authIntro: { alignItems: "center", gap: 5 },
  authTitle: { color: palette.ink, fontSize: 32, fontWeight: "900" },
  authSubtitle: { color: palette.muted, fontSize: 13, textAlign: "center" },
  section: { gap: 8, marginBottom: 3 },
  heading: { color: palette.ink, fontFamily: Platform.select({ ios: "Georgia", android: "serif" }), fontSize: 25, fontWeight: "700" },
  description: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  hero: { gap: 12, padding: 21, borderRadius: 18, backgroundColor: palette.dark },
  heroTitle: { color: "#FFFFFF", fontSize: 25, fontWeight: "800" },
  heroBody: { color: "#D7E1DB", fontSize: 12, lineHeight: 19 },
  metrics: { flexDirection: "row", gap: 8 },
  metric: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.09)" },
  metricValue: { color: palette.lime, fontSize: 21, fontWeight: "900" },
  metricLabel: { color: "#FFFFFF", fontSize: 9 },
  card: { gap: 10, padding: 16, borderWidth: 1, borderColor: palette.line, borderRadius: 14, backgroundColor: palette.panel },
  cardTitle: { color: palette.ink, fontSize: 16, fontWeight: "800" },
  itemTitle: { color: palette.ink, fontSize: 12, fontWeight: "700" },
  caption: { color: palette.muted, fontSize: 9, lineHeight: 14 },
  label: { marginBottom: 5, color: palette.ink, fontSize: 10, fontWeight: "700" },
  input: { minHeight: 45, paddingHorizontal: 12, borderWidth: 1, borderColor: palette.line, borderRadius: 9, color: palette.ink, backgroundColor: "#FFFFFF", fontSize: 12 },
  textArea: { minHeight: 130, paddingTop: 10, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }), textAlignVertical: "top" },
  button: { minHeight: 45, flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingHorizontal: 10, borderRadius: 9, backgroundColor: palette.forest },
  buttonSecondary: { borderWidth: 1, borderColor: palette.forest, backgroundColor: "#FFFFFF" },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", textAlign: "center" },
  buttonTextSecondary: { color: palette.forest },
  buttonRow: { flexDirection: "row", gap: 8 },
  rowBetween: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 9 },
  listRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 9, borderTopWidth: 1, borderTopColor: palette.line },
  empty: { padding: 18, color: palette.muted, textAlign: "center" },
  badge: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, backgroundColor: palette.softAmber },
  badgeGood: { backgroundColor: palette.softGreen },
  badgeBad: { backgroundColor: palette.softRed },
  badgeText: { color: "#83530C", fontSize: 8, fontWeight: "800" },
  goodText: { color: palette.forest },
  badText: { color: palette.red },
  blocking: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderWidth: 1, borderColor: palette.red, borderRadius: 12, backgroundColor: palette.softRed },
  blockingTitle: { color: palette.red, fontSize: 12, fontWeight: "900" },
  conflictCard: { gap: 8, padding: 13, borderWidth: 1, borderColor: palette.red, borderRadius: 10, backgroundColor: palette.softRed },
  errorText: { color: palette.red, fontSize: 10, fontWeight: "700" },
  successText: { color: palette.forest, fontSize: 10, fontWeight: "700" },
  mono: { color: palette.muted, fontFamily: Platform.select({ ios: "Menlo", android: "monospace" }), fontSize: 8, lineHeight: 12 },
  tabs: { minHeight: 70, flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: palette.line, backgroundColor: palette.panel },
  tab: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: 2 },
  tabText: { color: palette.muted, fontSize: 7, fontWeight: "600" },
  tabTextActive: { color: palette.forest, fontWeight: "900" },
  modal: { flex: 1, justifyContent: "center", padding: 24, backgroundColor: "rgba(10,25,18,0.65)" },
  dialog: { gap: 9, padding: 19, borderRadius: 16, backgroundColor: palette.panel },
  language: { minHeight: 48, justifyContent: "center", paddingHorizontal: 13, borderWidth: 1, borderColor: palette.line, borderRadius: 9 },
  languageActive: { borderColor: palette.forest, backgroundColor: palette.forest },
  languageText: { color: "#FFFFFF" },
  organization: { padding: 11, borderWidth: 1, borderColor: palette.line, borderRadius: 9, backgroundColor: "#FFFFFF" },
  organizationActive: { borderColor: palette.forest, backgroundColor: palette.softGreen },
});
