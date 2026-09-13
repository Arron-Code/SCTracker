import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
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
  View,
} from "react-native";
import {
  isLanguage,
  languages,
  translations,
  type Language,
  type Translation,
} from "./src/i18n";

type Tab = "home" | "suppliers" | "capture" | "shipments" | "help";

type PlotDraft = {
  id: string;
  producer: string;
  farmName: string;
  areaHa: string;
  latitude: number;
  longitude: number;
  capturedAt: string;
  syncStatus: "local";
};

const STORAGE_KEY = "sctracker.plotDrafts.v1";
const LANGUAGE_STORAGE_KEY = "sctracker.language.v1";

const palette = {
  ink: "#14251D",
  forest: "#1F5A43",
  forestDark: "#174735",
  paper: "#F4F2EA",
  panel: "#FFFEFA",
  line: "#DDE0D8",
  muted: "#68766F",
  lime: "#CADB84",
  amber: "#C88124",
  red: "#A64536",
  softGreen: "#DDEADF",
  softAmber: "#F8E8CE",
};

const suppliers = [
  {
    id: "SUP-00018",
    name: "Kaffa Cooperative Union",
    region: "Jimma · Oromia",
    producers: 94,
    plots: 112,
    status: "complete" as const,
    tone: "success" as const,
  },
  {
    id: "SUP-00023",
    name: "Jimma Highland Export",
    region: "Jimma · Oromia",
    producers: 11,
    plots: 14,
    status: "correction" as const,
    tone: "warning" as const,
  },
  {
    id: "SUP-00031",
    name: "Sidama Coffee Farmers",
    region: "Sidama",
    producers: 38,
    plots: 47,
    status: "invited" as const,
    tone: "neutral" as const,
  },
];

const shipments = [
  {
    id: "IMP-2026-0142",
    product: "washedArabica" as const,
    origin: "Jimma",
    quantity: "18.500 kg",
    readiness: 72,
    status: "reviewing" as const,
  },
  {
    id: "IMP-2026-0137",
    product: "naturalArabica" as const,
    origin: "Sidama",
    quantity: "12.800 kg",
    readiness: 100,
    status: "ready" as const,
  },
];

function TabButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      style={styles.tabButton}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
    >
      <Ionicons
        name={active ? icon : (`${icon}-outline` as keyof typeof Ionicons.glyphMap)}
        size={22}
        color={active ? palette.forest : palette.muted}
      />
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
    </Pressable>
  );
}

function Badge({
  children,
  tone = "neutral",
}: {
  children: string;
  tone?: "success" | "warning" | "neutral";
}) {
  return (
    <View
      style={[
        styles.badge,
        tone === "success" && styles.badgeSuccess,
        tone === "warning" && styles.badgeWarning,
      ]}
    >
      <Text
        style={[
          styles.badgeText,
          tone === "success" && styles.badgeTextSuccess,
          tone === "warning" && styles.badgeTextWarning,
        ]}
      >
        {children}
      </Text>
    </View>
  );
}

function SectionTitle({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.heading}>{title}</Text>
      {description ? <Text style={styles.description}>{description}</Text> : null}
    </View>
  );
}

function HomeScreen({
  drafts,
  onCapture,
  t,
}: {
  drafts: PlotDraft[];
  onCapture: () => void;
  t: Translation;
}) {
  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>{t.dashboard.activeShipment}</Text>
          <Text style={styles.heroTitle}>IMP-2026-0142</Text>
          <Text style={styles.heroText}>
            {t.entities.washedArabica} · Jimma → Hamburg
          </Text>
          <View style={styles.heroTags}>
            <Text style={styles.heroTag}>18.500 kg</Text>
            <Text style={styles.heroTag}>126 {t.dashboard.plots}</Text>
          </View>
        </View>
        <View style={styles.score}>
          <Text style={styles.scoreValue}>78%</Text>
          <Text style={styles.scoreLabel}>{t.dashboard.complete}</Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Ionicons name="people" size={22} color={palette.forest} />
          <Text style={styles.metricValue}>8/10</Text>
          <Text style={styles.metricLabel}>{t.dashboard.suppliersReady}</Text>
        </View>
        <View style={styles.metricCard}>
          <Ionicons name="cloud-offline" size={22} color={palette.amber} />
          <Text style={styles.metricValue}>{drafts.length}</Text>
          <Text style={styles.metricLabel}>{t.dashboard.localDrafts}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.eyebrow}>{t.dashboard.today}</Text>
            <Text style={styles.cardTitle}>{t.dashboard.nextSteps}</Text>
          </View>
          <Badge tone="warning">{t.dashboard.open}</Badge>
        </View>
        {[
          ["warning", `${t.entities.plot} ET-JIM-044`, t.dashboard.recapturePolygon],
          ["document-text", t.dashboard.legalityEvidence, t.dashboard.reviewCooperative],
          ["cube", `${t.entities.batch} B-2026-091`, t.dashboard.clarifyDifference],
        ].map(([icon, title, detail], index) => (
          <View key={title} style={[styles.task, index === 2 && styles.taskLast]}>
            <View style={styles.taskIcon}>
              <Ionicons
                name={icon as keyof typeof Ionicons.glyphMap}
                size={18}
                color={index === 0 ? palette.amber : palette.forest}
              />
            </View>
            <View style={styles.taskCopy}>
              <Text style={styles.taskTitle}>{title}</Text>
              <Text style={styles.taskDetail}>{detail}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={palette.muted} />
          </View>
        ))}
      </View>

      <Pressable
        style={styles.primaryButton}
        onPress={onCapture}
        accessibilityRole="button"
        accessibilityLabel={t.dashboard.capturePlot}
      >
        <Ionicons name="locate" size={20} color="#FFFFFF" />
        <Text style={styles.primaryButtonText}>{t.dashboard.capturePlot}</Text>
      </Pressable>
    </>
  );
}

function SuppliersScreen({ t }: { t: Translation }) {
  return (
    <>
      <SectionTitle
        eyebrow={t.suppliers.eyebrow}
        title={t.suppliers.title}
        description={t.suppliers.description}
      />
      {suppliers.map((supplier) => (
        <View
          key={supplier.id}
          style={styles.card}
          accessible
          accessibilityLabel={`${t.accessibility.supplierCard} ${supplier.name}, ${t.suppliers.statuses[supplier.status]}`}
        >
          <View style={styles.cardHeader}>
            <View style={styles.supplierIdentity}>
              <View style={styles.initial}>
                <Text style={styles.initialText}>{supplier.name[0]}</Text>
              </View>
              <View style={styles.flex}>
                <Text style={styles.cardTitle}>{supplier.name}</Text>
                <Text style={styles.caption}>
                  {supplier.id} · {supplier.region}
                </Text>
              </View>
            </View>
            <Badge tone={supplier.tone}>{t.suppliers.statuses[supplier.status]}</Badge>
          </View>
          <View style={styles.supplierStats}>
            <View>
              <Text style={styles.statValue}>{supplier.producers}</Text>
              <Text style={styles.caption}>{t.suppliers.producers}</Text>
            </View>
            <View style={styles.statDivider} />
            <View>
              <Text style={styles.statValue}>{supplier.plots}</Text>
              <Text style={styles.caption}>{t.suppliers.plots}</Text>
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

function CaptureScreen({
  drafts,
  onDraftSaved,
  t,
}: {
  drafts: PlotDraft[];
  onDraftSaved: (draft: PlotDraft) => void;
  t: Translation;
}) {
  const [producer, setProducer] = useState("");
  const [farmName, setFarmName] = useState("");
  const [areaHa, setAreaHa] = useState("");
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locating, setLocating] = useState(false);

  async function captureLocation() {
    setLocating(true);
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        Alert.alert(
          t.capture.alerts.permissionTitle,
          t.capture.alerts.permissionMessage,
        );
        return;
      }

      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(result);
    } catch {
      Alert.alert(
        t.capture.alerts.unavailableTitle,
        t.capture.alerts.unavailableMessage,
      );
    } finally {
      setLocating(false);
    }
  }

  function saveDraft() {
    if (!producer.trim() || !farmName.trim() || !areaHa.trim() || !location) {
      Alert.alert(
        t.capture.alerts.incompleteTitle,
        t.capture.alerts.incompleteMessage,
      );
      return;
    }

    const parsedArea = Number(areaHa.replace(",", "."));
    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      Alert.alert(t.capture.alerts.invalidAreaTitle, t.capture.alerts.invalidAreaMessage);
      return;
    }

    const draft: PlotDraft = {
      id: `PLOT-${Date.now()}`,
      producer: producer.trim(),
      farmName: farmName.trim(),
      areaHa: parsedArea.toFixed(2),
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      capturedAt: new Date().toISOString(),
      syncStatus: "local",
    };
    onDraftSaved(draft);
    setProducer("");
    setFarmName("");
    setAreaHa("");
    setLocation(null);
    Alert.alert(
      t.capture.alerts.savedTitle,
      t.capture.alerts.savedMessage,
    );
  }

  return (
    <>
      <SectionTitle
        eyebrow={t.capture.eyebrow}
        title={t.capture.title}
        description={t.capture.description}
      />

      <View style={styles.card}>
        <Text style={styles.inputLabel}>{t.capture.producer}</Text>
        <TextInput
          value={producer}
          onChangeText={setProducer}
          placeholder={t.capture.producerPlaceholder}
          accessibilityLabel={t.capture.producer}
          placeholderTextColor="#98A29C"
          style={styles.input}
        />

        <Text style={styles.inputLabel}>{t.capture.farmName}</Text>
        <TextInput
          value={farmName}
          onChangeText={setFarmName}
          placeholder={t.capture.farmPlaceholder}
          accessibilityLabel={t.capture.farmName}
          placeholderTextColor="#98A29C"
          style={styles.input}
        />

        <Text style={styles.inputLabel}>{t.capture.area}</Text>
        <TextInput
          value={areaHa}
          onChangeText={setAreaHa}
          placeholder={t.capture.areaPlaceholder}
          accessibilityLabel={t.capture.area}
          placeholderTextColor="#98A29C"
          keyboardType="decimal-pad"
          style={styles.input}
        />

        <View style={styles.locationBox}>
          <View style={styles.locationIcon}>
            <Ionicons
              name={location ? "checkmark" : "location"}
              size={21}
              color={location ? palette.forest : palette.amber}
            />
          </View>
          <View style={styles.flex}>
            <Text style={styles.taskTitle}>
              {location ? t.capture.gpsCaptured : t.capture.gpsMissing}
            </Text>
            <Text style={styles.taskDetail}>
              {location
                ? `${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`
                : t.capture.gpsInstruction}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.secondaryButton}
          onPress={captureLocation}
          disabled={locating}
          accessibilityRole="button"
          accessibilityLabel={locating ? t.capture.locating : t.capture.captureGps}
          accessibilityState={{ disabled: locating }}
        >
          <Ionicons name="locate" size={19} color={palette.forest} />
          <Text style={styles.secondaryButtonText}>
            {locating ? t.capture.locating : t.capture.captureGps}
          </Text>
        </Pressable>
        <Pressable
          style={styles.primaryButton}
          onPress={saveDraft}
          accessibilityRole="button"
          accessibilityLabel={t.capture.saveDraft}
        >
          <Ionicons name="save" size={19} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>{t.capture.saveDraft}</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.eyebrow}>{t.capture.localData}</Text>
            <Text style={styles.cardTitle}>{t.capture.savedDrafts}</Text>
          </View>
          <Badge>{String(drafts.length)}</Badge>
        </View>
        {drafts.length === 0 ? (
          <Text style={styles.emptyText}>
            {t.capture.noDrafts}
          </Text>
        ) : (
          drafts.map((draft, index) => (
            <View
              key={draft.id}
              style={[styles.task, index === drafts.length - 1 && styles.taskLast]}
            >
              <View style={styles.taskIcon}>
                <Ionicons name="leaf" size={18} color={palette.forest} />
              </View>
              <View style={styles.taskCopy}>
                <Text style={styles.taskTitle}>{draft.farmName}</Text>
                <Text style={styles.taskDetail}>
                  {draft.producer} · {draft.areaHa} ha · {t.capture.localOnly}
                </Text>
              </View>
              <Ionicons name="cloud-offline" size={18} color={palette.amber} />
            </View>
          ))
        )}
      </View>
    </>
  );
}

function ShipmentsScreen({ t }: { t: Translation }) {
  return (
    <>
      <SectionTitle
        eyebrow={t.shipments.eyebrow}
        title={t.shipments.title}
        description={t.shipments.description}
      />
      {shipments.map((shipment) => (
        <View
          key={shipment.id}
          style={styles.card}
          accessible
          accessibilityLabel={`${t.accessibility.shipmentCard} ${shipment.id}, ${t.shipments.statuses[shipment.status]}`}
        >
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>{shipment.id}</Text>
              <Text style={styles.caption}>{t.entities[shipment.product]}</Text>
            </View>
            <Badge tone={shipment.readiness === 100 ? "success" : "warning"}>
              {t.shipments.statuses[shipment.status]}
            </Badge>
          </View>
          <View style={styles.shipmentDetail}>
            <View>
              <Text style={styles.caption}>{t.shipments.origin}</Text>
              <Text style={styles.detailValue}>{shipment.origin}, {t.shipments.ethiopia}</Text>
            </View>
            <View>
              <Text style={styles.caption}>{t.shipments.quantity}</Text>
              <Text style={styles.detailValue}>{shipment.quantity}</Text>
            </View>
          </View>
          <View style={styles.progressHeader}>
            <Text style={styles.caption}>{t.shipments.readiness}</Text>
            <Text style={styles.progressValue}>{shipment.readiness}%</Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${shipment.readiness}%` }]}
            />
          </View>
        </View>
      ))}
    </>
  );
}

function HelpScreen({ t }: { t: Translation }) {
  return (
    <>
      <SectionTitle
        eyebrow={t.help.eyebrow}
        title={t.help.title}
        description={t.help.intro}
      />

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t.help.guideTitle}</Text>
        <View style={styles.guideSteps}>
          {t.help.steps.map((step, index) => (
            <View key={step} style={styles.guideStep}>
              <View style={styles.guideNumber}>
                <Text style={styles.guideNumberText}>{index + 1}</Text>
              </View>
              <Text style={styles.guideText}>{step}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.privacyCard}>
        <Ionicons name="shield-checkmark" size={25} color={palette.forest} />
        <View style={styles.flex}>
          <Text style={styles.taskTitle}>{t.help.privacyTitle}</Text>
          <Text style={styles.taskDetail}>{t.help.privacy}</Text>
        </View>
      </View>

      <View style={styles.prototypeNotice}>
        <Ionicons name="flask" size={20} color={palette.amber} />
        <Text style={styles.prototypeText}>
          {t.help.prototype}
        </Text>
      </View>
    </>
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
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <View style={styles.modalBackdrop} accessibilityViewIsModal>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t.accessibility.dismissLanguageChooser}
        />
        <View style={styles.languageDialog}>
          <View style={styles.dialogHeader}>
            <View style={styles.flex}>
              <Text style={styles.cardTitle}>{t.languageChooserTitle}</Text>
              <Text style={styles.taskDetail}>{t.languageChooserHint}</Text>
            </View>
            <Pressable
              onPress={onClose}
              style={styles.iconButton}
              accessibilityRole="button"
              accessibilityLabel={t.close}
            >
              <Ionicons name="close" size={22} color={palette.ink} />
            </Pressable>
          </View>
          {languages.map((item) => {
            const option = translations[item];
            const selected = language === item;
            return (
              <Pressable
                key={item}
                onPress={() => onSelect(item)}
                style={[styles.languageOption, selected && styles.languageOptionActive]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option.languageName}
              >
                <Text style={[styles.languageCode, selected && styles.languageOptionTextActive]}>
                  {option.languageCode}
                </Text>
                <Text style={[styles.languageName, selected && styles.languageOptionTextActive]}>
                  {option.languageName}
                </Text>
                {selected ? <Ionicons name="checkmark" size={20} color="#FFFFFF" /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [language, setLanguage] = useState<Language>("de");
  const [languageLoaded, setLanguageLoaded] = useState(false);
  const [languageChooserOpen, setLanguageChooserOpen] = useState(false);
  const [drafts, setDrafts] = useState<PlotDraft[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);
  const languageChosen = useRef(false);
  const selectedLanguage = useRef<Language>("de");
  const t = translations[language];

  useEffect(() => {
    let cancelled = false;

    async function loadPersistedState() {
      let startupLanguage: Language = "de";

      try {
        const storedLanguage = await AsyncStorage.getItem(LANGUAGE_STORAGE_KEY);
        if (isLanguage(storedLanguage)) {
          startupLanguage = storedLanguage;
        }
      } catch {
        // German remains the safe startup fallback if the preference cannot be read.
      }

      if (!cancelled) {
        if (!languageChosen.current) {
          selectedLanguage.current = startupLanguage;
          setLanguage(startupLanguage);
        }
        setLanguageLoaded(true);
      }

      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          if (!cancelled) {
            setDrafts(JSON.parse(stored) as PlotDraft[]);
          }
        }
      } catch {
        if (cancelled) {
          return;
        }
        const startupTranslation = translations[selectedLanguage.current];
        Alert.alert(
          startupTranslation.capture.alerts.readErrorTitle,
          startupTranslation.capture.alerts.readErrorMessage,
        );
      } finally {
        if (!cancelled) {
          setStorageLoaded(true);
        }
      }
    }

    void loadPersistedState();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storageLoaded) {
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(drafts)).catch(() => {
      Alert.alert(
        t.capture.alerts.saveErrorTitle,
        t.capture.alerts.saveErrorMessage,
      );
    });
  }, [drafts, storageLoaded, t.capture.alerts.saveErrorMessage, t.capture.alerts.saveErrorTitle]);

  function selectLanguage(nextLanguage: Language) {
    languageChosen.current = true;
    selectedLanguage.current = nextLanguage;
    setLanguage(nextLanguage);
    setLanguageChooserOpen(false);
    AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, nextLanguage).catch(() => {
      const nextTranslation = translations[nextLanguage];
      Alert.alert(
        nextTranslation.languageSaveErrorTitle,
        nextTranslation.languageSaveErrorMessage,
      );
    });
  }

  const screen = useMemo(() => {
    switch (activeTab) {
      case "suppliers":
        return <SuppliersScreen t={t} />;
      case "capture":
        return (
          <CaptureScreen
            drafts={drafts}
            onDraftSaved={(draft) => setDrafts((current) => [draft, ...current])}
            t={t}
          />
        );
      case "shipments":
        return <ShipmentsScreen t={t} />;
      case "help":
        return <HelpScreen t={t} />;
      default:
        return (
          <HomeScreen
            drafts={drafts}
            onCapture={() => setActiveTab("capture")}
            t={t}
          />
        );
    }
  }, [activeTab, drafts, t]);

  if (!languageLoaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <View
          style={styles.loading}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="SCTracker"
        >
          <ActivityIndicator size="large" color={palette.lime} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.appHeader}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>SC</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.brand}>SCTracker</Text>
          <Text style={styles.brandSubtitle}>{t.brandSubtitle}</Text>
        </View>
        <View style={styles.offlinePill}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlineText}>{t.offlineReady}</Text>
        </View>
        <Pressable
          style={styles.headerLanguageButton}
          onPress={() => setLanguageChooserOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t.accessibility.chooseLanguage}
          accessibilityHint={t.accessibility.currentLanguage}
        >
          <Ionicons name="language" size={21} color="#FFFFFF" />
          <Text style={styles.headerLanguageCode}>{t.languageCode}</Text>
        </Pressable>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        {screen}
      </ScrollView>

      <View style={styles.tabBar}>
        <TabButton
          active={activeTab === "home"}
          icon="home"
          label={t.tabs.home}
          onPress={() => setActiveTab("home")}
        />
        <TabButton
          active={activeTab === "suppliers"}
          icon="people"
          label={t.tabs.suppliers}
          onPress={() => setActiveTab("suppliers")}
        />
        <Pressable
          style={styles.captureTab}
          onPress={() => setActiveTab("capture")}
          accessibilityRole="tab"
          accessibilityState={{ selected: activeTab === "capture" }}
          accessibilityLabel={t.tabs.capture}
        >
          <Ionicons name="locate" size={25} color="#FFFFFF" />
        </Pressable>
        <TabButton
          active={activeTab === "shipments"}
          icon="cube"
          label={t.tabs.shipments}
          onPress={() => setActiveTab("shipments")}
        />
        <TabButton
          active={activeTab === "help"}
          icon="help-circle"
          label={t.tabs.help}
          onPress={() => setActiveTab("help")}
        />
      </View>
      <LanguageChooser
        visible={languageChooserOpen}
        language={language}
        onSelect={selectLanguage}
        onClose={() => setLanguageChooserOpen(false)}
        t={t}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight : 0,
    backgroundColor: palette.ink,
  },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  appHeader: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 18,
    backgroundColor: palette.ink,
  },
  brandMark: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
    backgroundColor: palette.lime,
  },
  brandMarkText: {
    color: palette.ink,
    fontSize: 14,
    fontWeight: "900",
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "800",
  },
  brandSubtitle: {
    marginTop: 1,
    color: "#9DB0A6",
    fontSize: 10,
  },
  offlinePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
  },
  offlineDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.lime,
  },
  offlineText: {
    color: "#D9E2DC",
    fontSize: 9,
    fontWeight: "700",
  },
  headerLanguageButton: {
    minWidth: 45,
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  headerLanguageCode: {
    color: "#FFFFFF",
    fontSize: 9,
    fontWeight: "800",
  },
  scroll: {
    flex: 1,
    backgroundColor: palette.paper,
  },
  content: {
    gap: 14,
    padding: 17,
    paddingBottom: 28,
  },
  hero: {
    minHeight: 205,
    flexDirection: "row",
    alignItems: "center",
    padding: 23,
    borderRadius: 22,
    backgroundColor: palette.forestDark,
  },
  heroCopy: {
    flex: 1,
    paddingRight: 12,
  },
  heroEyebrow: {
    marginBottom: 9,
    color: palette.lime,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.3,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    fontSize: 25,
    fontWeight: "700",
  },
  heroText: {
    marginTop: 7,
    color: "#CED9D2",
    fontSize: 12,
    lineHeight: 18,
  },
  heroTags: {
    flexDirection: "row",
    gap: 7,
    marginTop: 18,
  },
  heroTag: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    overflow: "hidden",
    borderRadius: 6,
    color: "#EFF3F0",
    backgroundColor: "rgba(255,255,255,0.08)",
    fontSize: 9,
    fontWeight: "700",
  },
  score: {
    width: 80,
    height: 80,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 6,
    borderColor: palette.lime,
    borderRadius: 40,
  },
  scoreValue: {
    color: "#FFFFFF",
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    fontSize: 21,
    fontWeight: "700",
  },
  scoreLabel: {
    color: "#C6D4CC",
    fontSize: 8,
  },
  metricRow: {
    flexDirection: "row",
    gap: 12,
  },
  metricCard: {
    flex: 1,
    minHeight: 122,
    padding: 17,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 15,
    backgroundColor: palette.panel,
  },
  metricValue: {
    marginTop: 12,
    color: palette.ink,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    fontSize: 24,
    fontWeight: "700",
  },
  metricLabel: {
    marginTop: 3,
    color: palette.muted,
    fontSize: 10,
  },
  card: {
    padding: 18,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 15,
    backgroundColor: palette.panel,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 14,
  },
  eyebrow: {
    marginBottom: 5,
    color: palette.forest,
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 1.25,
  },
  cardTitle: {
    color: palette.ink,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    fontSize: 17,
    fontWeight: "700",
  },
  task: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  taskLast: {
    borderBottomWidth: 0,
    paddingBottom: 0,
  },
  taskIcon: {
    width: 35,
    height: 35,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    backgroundColor: palette.paper,
  },
  taskCopy: {
    flex: 1,
  },
  taskTitle: {
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  taskDetail: {
    marginTop: 3,
    color: palette.muted,
    fontSize: 10,
    lineHeight: 15,
  },
  primaryButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    marginTop: 1,
    borderRadius: 11,
    backgroundColor: palette.forest,
  },
  primaryButtonText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  secondaryButton: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: palette.forest,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  secondaryButtonText: {
    color: palette.forest,
    fontSize: 12,
    fontWeight: "800",
  },
  badge: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 7,
    backgroundColor: "#E9EBE7",
  },
  badgeSuccess: {
    backgroundColor: palette.softGreen,
  },
  badgeWarning: {
    backgroundColor: palette.softAmber,
  },
  badgeText: {
    color: palette.muted,
    fontSize: 9,
    fontWeight: "800",
  },
  badgeTextSuccess: {
    color: palette.forest,
  },
  badgeTextWarning: {
    color: "#83530C",
  },
  sectionTitle: {
    marginBottom: 7,
    paddingTop: 4,
  },
  heading: {
    color: palette.ink,
    fontFamily: Platform.select({ ios: "Georgia", android: "serif" }),
    fontSize: 28,
    fontWeight: "700",
  },
  description: {
    marginTop: 8,
    color: palette.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  supplierIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  initial: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: palette.softGreen,
  },
  initialText: {
    color: palette.forest,
    fontSize: 17,
    fontWeight: "900",
  },
  flex: {
    flex: 1,
  },
  caption: {
    marginTop: 4,
    color: palette.muted,
    fontSize: 9,
  },
  supplierStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  statValue: {
    color: palette.ink,
    fontSize: 18,
    fontWeight: "800",
  },
  statDivider: {
    width: 1,
    height: 31,
    backgroundColor: palette.line,
  },
  inputLabel: {
    marginBottom: 6,
    color: palette.ink,
    fontSize: 11,
    fontWeight: "700",
  },
  input: {
    minHeight: 48,
    marginBottom: 15,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 10,
    color: palette.ink,
    backgroundColor: "#FFFFFF",
    fontSize: 13,
  },
  locationBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginBottom: 13,
    padding: 13,
    borderRadius: 11,
    backgroundColor: palette.paper,
  },
  locationIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    backgroundColor: "#FFFFFF",
  },
  emptyText: {
    paddingVertical: 12,
    color: palette.muted,
    fontSize: 11,
    textAlign: "center",
  },
  shipmentDetail: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  detailValue: {
    marginTop: 4,
    color: palette.ink,
    fontSize: 12,
    fontWeight: "700",
  },
  progressHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 8,
  },
  progressValue: {
    color: palette.forest,
    fontSize: 10,
    fontWeight: "800",
  },
  progressTrack: {
    height: 8,
    marginTop: 8,
    overflow: "hidden",
    borderRadius: 4,
    backgroundColor: "#E5E7E1",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
    backgroundColor: palette.forest,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(10,25,18,0.62)",
  },
  languageDialog: {
    gap: 9,
    padding: 20,
    borderRadius: 18,
    backgroundColor: palette.panel,
  },
  dialogHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 8,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: palette.paper,
  },
  languageOption: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  languageOptionActive: {
    borderColor: palette.forest,
    backgroundColor: palette.forest,
  },
  languageCode: {
    width: 36,
    color: palette.forest,
    fontSize: 11,
    fontWeight: "900",
  },
  languageName: {
    flex: 1,
    color: palette.ink,
    fontSize: 14,
    fontWeight: "700",
  },
  languageOptionTextActive: {
    color: "#FFFFFF",
  },
  guideSteps: {
    gap: 15,
    marginTop: 20,
  },
  guideStep: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  guideNumber: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: palette.softGreen,
  },
  guideNumberText: {
    color: palette.forest,
    fontSize: 11,
    fontWeight: "900",
  },
  guideText: {
    flex: 1,
    paddingTop: 4,
    color: palette.ink,
    fontSize: 12,
    lineHeight: 18,
  },
  privacyCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    padding: 18,
    borderRadius: 15,
    backgroundColor: palette.softGreen,
  },
  prototypeNotice: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 12,
  },
  prototypeText: {
    color: palette.muted,
    fontSize: 9,
    fontWeight: "700",
  },
  tabBar: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingHorizontal: 8,
    paddingBottom: Platform.OS === "ios" ? 9 : 4,
    borderTopWidth: 1,
    borderTopColor: palette.line,
    backgroundColor: palette.panel,
  },
  tabButton: {
    width: 62,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
  },
  tabLabel: {
    color: palette.muted,
    fontSize: 8,
    fontWeight: "600",
  },
  tabLabelActive: {
    color: palette.forest,
    fontWeight: "800",
  },
  captureTab: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    marginTop: -23,
    borderWidth: 4,
    borderColor: palette.panel,
    borderRadius: 26,
    backgroundColor: palette.forest,
  },
});
