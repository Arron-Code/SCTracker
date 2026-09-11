import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
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

type Tab = "home" | "suppliers" | "capture" | "shipments" | "help";
type Language = "de" | "en" | "am";

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

const copy = {
  de: {
    title: "Kaffee-Feldarbeit",
    guideTitle: "Kurzanleitung",
    guideIntro:
      "Die mobile App ist für Lieferanten, Kooperativen und Feldteams gedacht.",
    steps: [
      "Lieferanten- und Produzentendaten prüfen.",
      "GPS am Plot erfassen und Fläche dokumentieren.",
      "Entwurf offline speichern.",
      "Vor der Synchronisation Angaben und Einwilligung kontrollieren.",
    ],
    privacy:
      "Standort- und Personendaten nur mit Berechtigung erfassen. Keine Zugangsdaten in Notizen speichern.",
  },
  en: {
    title: "Coffee field work",
    guideTitle: "Quick guide",
    guideIntro:
      "The mobile app is designed for suppliers, cooperatives, and field teams.",
    steps: [
      "Review supplier and producer data.",
      "Capture GPS at the plot and document the area.",
      "Save the draft offline.",
      "Review the data and consent before synchronisation.",
    ],
    privacy:
      "Capture location and personal data only with permission. Never store credentials in notes.",
  },
  am: {
    title: "የቡና የመስክ ሥራ",
    guideTitle: "አጭር መመሪያ",
    guideIntro:
      "የሞባይል መተግበሪያው ለአቅራቢዎች፣ ለማህበራት እና ለመስክ ቡድኖች የተዘጋጀ ነው።",
    steps: [
      "የአቅራቢና የአምራች መረጃን ያረጋግጡ።",
      "በመሬቱ ላይ GPS ይመዝግቡ እና ስፋቱን ያስገቡ።",
      "ረቂቁን ያለ ኢንተርኔት ያስቀምጡ።",
      "ከማስተላለፍ በፊት መረጃውንና ፈቃዱን ያረጋግጡ።",
    ],
    privacy:
      "የአካባቢና የግል መረጃን በፈቃድ ብቻ ይመዝግቡ። የመግቢያ ቁልፎችን በማስታወሻ ውስጥ አያስቀምጡ።",
  },
};

const suppliers = [
  {
    id: "SUP-00018",
    name: "Kaffa Cooperative Union",
    region: "Jimma · Oromia",
    producers: 94,
    plots: 112,
    status: "Vollständig",
    tone: "success" as const,
  },
  {
    id: "SUP-00023",
    name: "Jimma Highland Export",
    region: "Jimma · Oromia",
    producers: 11,
    plots: 14,
    status: "Korrektur",
    tone: "warning" as const,
  },
  {
    id: "SUP-00031",
    name: "Sidama Coffee Farmers",
    region: "Sidama",
    producers: 38,
    plots: 47,
    status: "Eingeladen",
    tone: "neutral" as const,
  },
];

const shipments = [
  {
    id: "IMP-2026-0142",
    product: "Washed Arabica",
    origin: "Jimma, Äthiopien",
    quantity: "18.500 kg",
    readiness: 72,
    status: "In Prüfung",
  },
  {
    id: "IMP-2026-0137",
    product: "Natural Arabica",
    origin: "Sidama, Äthiopien",
    quantity: "12.800 kg",
    readiness: 100,
    status: "Bereit",
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
    <Pressable style={styles.tabButton} onPress={onPress}>
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
}: {
  drafts: PlotDraft[];
  onCapture: () => void;
}) {
  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroCopy}>
          <Text style={styles.heroEyebrow}>AKTIVE KAFFEE-SENDUNG</Text>
          <Text style={styles.heroTitle}>IMP-2026-0142</Text>
          <Text style={styles.heroText}>
            Washed Arabica · Jimma → Hamburg
          </Text>
          <View style={styles.heroTags}>
            <Text style={styles.heroTag}>18.500 kg</Text>
            <Text style={styles.heroTag}>126 Plots</Text>
          </View>
        </View>
        <View style={styles.score}>
          <Text style={styles.scoreValue}>78%</Text>
          <Text style={styles.scoreLabel}>vollständig</Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Ionicons name="people" size={22} color={palette.forest} />
          <Text style={styles.metricValue}>8/10</Text>
          <Text style={styles.metricLabel}>Lieferanten bereit</Text>
        </View>
        <View style={styles.metricCard}>
          <Ionicons name="cloud-offline" size={22} color={palette.amber} />
          <Text style={styles.metricValue}>{drafts.length}</Text>
          <Text style={styles.metricLabel}>Lokale Entwürfe</Text>
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.eyebrow}>HEUTE</Text>
            <Text style={styles.cardTitle}>Nächste Schritte</Text>
          </View>
          <Badge tone="warning">3 offen</Badge>
        </View>
        {[
          ["warning", "Plot ET-JIM-044", "Polygon vor Ort erneut erfassen"],
          ["document-text", "Legalitätsnachweis", "Kaffa Cooperative prüfen"],
          ["cube", "Batch B-2026-091", "120 kg Differenz klären"],
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

      <Pressable style={styles.primaryButton} onPress={onCapture}>
        <Ionicons name="locate" size={20} color="#FFFFFF" />
        <Text style={styles.primaryButtonText}>Neuen Kaffee-Plot erfassen</Text>
      </Pressable>
    </>
  );
}

function SuppliersScreen() {
  return (
    <>
      <SectionTitle
        eyebrow="SUPPLIER INTAKE"
        title="Kaffee-Lieferanten"
        description="Kooperativen, Exporteure und Produzenten im aktuellen Pilot."
      />
      {suppliers.map((supplier) => (
        <View key={supplier.id} style={styles.card}>
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
            <Badge tone={supplier.tone}>{supplier.status}</Badge>
          </View>
          <View style={styles.supplierStats}>
            <View>
              <Text style={styles.statValue}>{supplier.producers}</Text>
              <Text style={styles.caption}>Produzenten</Text>
            </View>
            <View style={styles.statDivider} />
            <View>
              <Text style={styles.statValue}>{supplier.plots}</Text>
              <Text style={styles.caption}>Kaffee-Plots</Text>
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
}: {
  drafts: PlotDraft[];
  onDraftSaved: (draft: PlotDraft) => void;
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
          "Standort nicht freigegeben",
          "Die GPS-Berechtigung wird benötigt, um den Kaffee-Plot vor Ort zu erfassen.",
        );
        return;
      }

      const result = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setLocation(result);
    } catch {
      Alert.alert(
        "GPS nicht verfügbar",
        "Der aktuelle Standort konnte nicht gelesen werden. Bitte versuchen Sie es im Freien erneut.",
      );
    } finally {
      setLocating(false);
    }
  }

  function saveDraft() {
    if (!producer.trim() || !farmName.trim() || !areaHa.trim() || !location) {
      Alert.alert(
        "Angaben unvollständig",
        "Produzent, Plotname, Fläche und GPS-Position sind erforderlich.",
      );
      return;
    }

    const parsedArea = Number(areaHa.replace(",", "."));
    if (!Number.isFinite(parsedArea) || parsedArea <= 0) {
      Alert.alert("Fläche ungültig", "Bitte geben Sie eine positive Fläche in Hektar an.");
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
      "Offline gespeichert",
      "Der Plot-Entwurf bleibt auf diesem Gerät, bis eine sichere Backend-Synchronisation konfiguriert ist.",
    );
  }

  return (
    <>
      <SectionTitle
        eyebrow="OFFLINE MAPPING"
        title="Kaffee-Plot erfassen"
        description="GPS vor Ort aufnehmen und als lokalen Entwurf speichern."
      />

      <View style={styles.card}>
        <Text style={styles.inputLabel}>Produzent</Text>
        <TextInput
          value={producer}
          onChangeText={setProducer}
          placeholder="z. B. Abebe Bekele"
          placeholderTextColor="#98A29C"
          style={styles.input}
        />

        <Text style={styles.inputLabel}>Plot- oder Farmname</Text>
        <TextInput
          value={farmName}
          onChangeText={setFarmName}
          placeholder="z. B. Keta Plot 04"
          placeholderTextColor="#98A29C"
          style={styles.input}
        />

        <Text style={styles.inputLabel}>Fläche in Hektar</Text>
        <TextInput
          value={areaHa}
          onChangeText={setAreaHa}
          placeholder="2,50"
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
              {location ? "GPS-Position erfasst" : "GPS-Position fehlt"}
            </Text>
            <Text style={styles.taskDetail}>
              {location
                ? `${location.coords.latitude.toFixed(6)}, ${location.coords.longitude.toFixed(6)}`
                : "Position direkt am Kaffee-Plot aufnehmen"}
            </Text>
          </View>
        </View>

        <Pressable
          style={styles.secondaryButton}
          onPress={captureLocation}
          disabled={locating}
        >
          <Ionicons name="locate" size={19} color={palette.forest} />
          <Text style={styles.secondaryButtonText}>
            {locating ? "Position wird ermittelt ..." : "GPS erfassen"}
          </Text>
        </Pressable>
        <Pressable style={styles.primaryButton} onPress={saveDraft}>
          <Ionicons name="save" size={19} color="#FFFFFF" />
          <Text style={styles.primaryButtonText}>Offline-Entwurf speichern</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.eyebrow}>LOKALE DATEN</Text>
            <Text style={styles.cardTitle}>Gespeicherte Entwürfe</Text>
          </View>
          <Badge>{String(drafts.length)}</Badge>
        </View>
        {drafts.length === 0 ? (
          <Text style={styles.emptyText}>
            Noch keine Plot-Entwürfe auf diesem Gerät.
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
                  {draft.producer} · {draft.areaHa} ha · nur lokal
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

function ShipmentsScreen() {
  return (
    <>
      <SectionTitle
        eyebrow="CHAIN OF CUSTODY"
        title="Kaffee-Sendungen"
        description="Mengenbilanz und Bereitschaft für den Compliance-Review."
      />
      {shipments.map((shipment) => (
        <View key={shipment.id} style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>{shipment.id}</Text>
              <Text style={styles.caption}>{shipment.product}</Text>
            </View>
            <Badge tone={shipment.readiness === 100 ? "success" : "warning"}>
              {shipment.status}
            </Badge>
          </View>
          <View style={styles.shipmentDetail}>
            <View>
              <Text style={styles.caption}>Herkunft</Text>
              <Text style={styles.detailValue}>{shipment.origin}</Text>
            </View>
            <View>
              <Text style={styles.caption}>Menge</Text>
              <Text style={styles.detailValue}>{shipment.quantity}</Text>
            </View>
          </View>
          <View style={styles.progressHeader}>
            <Text style={styles.caption}>DDS-Bereitschaft</Text>
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

function HelpScreen({
  language,
  setLanguage,
}: {
  language: Language;
  setLanguage: (language: Language) => void;
}) {
  const content = copy[language];
  return (
    <>
      <SectionTitle
        eyebrow="FIELD GUIDE"
        title={content.title}
        description={content.guideIntro}
      />
      <View style={styles.languageSwitch}>
        {(["de", "en", "am"] as Language[]).map((item) => (
          <Pressable
            key={item}
            onPress={() => setLanguage(item)}
            style={[
              styles.languageButton,
              language === item && styles.languageButtonActive,
            ]}
          >
            <Text
              style={[
                styles.languageButtonText,
                language === item && styles.languageButtonTextActive,
              ]}
            >
              {item === "de" ? "DE" : item === "en" ? "EN" : "አማ"}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{content.guideTitle}</Text>
        <View style={styles.guideSteps}>
          {content.steps.map((step, index) => (
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
          <Text style={styles.taskTitle}>Datenschutz</Text>
          <Text style={styles.taskDetail}>{content.privacy}</Text>
        </View>
      </View>

      <View style={styles.prototypeNotice}>
        <Ionicons name="flask" size={20} color={palette.amber} />
        <Text style={styles.prototypeText}>
          Prototyp · nur Kaffee · keine Live-EU-Einreichung
        </Text>
      </View>
    </>
  );
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("home");
  const [language, setLanguage] = useState<Language>("de");
  const [drafts, setDrafts] = useState<PlotDraft[]>([]);
  const [storageLoaded, setStorageLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored) {
          setDrafts(JSON.parse(stored) as PlotDraft[]);
        }
      })
      .catch(() => {
        Alert.alert(
          "Lokale Daten nicht verfügbar",
          "Gespeicherte Plot-Entwürfe konnten nicht gelesen werden.",
        );
      })
      .finally(() => setStorageLoaded(true));
  }, []);

  useEffect(() => {
    if (!storageLoaded) {
      return;
    }

    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(drafts)).catch(() => {
      Alert.alert(
        "Speichern fehlgeschlagen",
        "Der Plot-Entwurf konnte nicht sicher auf diesem Gerät gespeichert werden.",
      );
    });
  }, [drafts, storageLoaded]);

  const screen = useMemo(() => {
    switch (activeTab) {
      case "suppliers":
        return <SuppliersScreen />;
      case "capture":
        return (
          <CaptureScreen
            drafts={drafts}
            onDraftSaved={(draft) => setDrafts((current) => [draft, ...current])}
          />
        );
      case "shipments":
        return <ShipmentsScreen />;
      case "help":
        return <HelpScreen language={language} setLanguage={setLanguage} />;
      default:
        return (
          <HomeScreen
            drafts={drafts}
            onCapture={() => setActiveTab("capture")}
          />
        );
    }
  }, [activeTab, drafts, language]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.appHeader}>
        <View style={styles.brandMark}>
          <Text style={styles.brandMarkText}>SC</Text>
        </View>
        <View style={styles.flex}>
          <Text style={styles.brand}>SCTracker</Text>
          <Text style={styles.brandSubtitle}>Coffee Evidence</Text>
        </View>
        <View style={styles.offlinePill}>
          <View style={styles.offlineDot} />
          <Text style={styles.offlineText}>Offline bereit</Text>
        </View>
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
          label="Start"
          onPress={() => setActiveTab("home")}
        />
        <TabButton
          active={activeTab === "suppliers"}
          icon="people"
          label="Partner"
          onPress={() => setActiveTab("suppliers")}
        />
        <Pressable
          style={styles.captureTab}
          onPress={() => setActiveTab("capture")}
          accessibilityLabel="Kaffee-Plot erfassen"
        >
          <Ionicons name="locate" size={25} color="#FFFFFF" />
        </Pressable>
        <TabButton
          active={activeTab === "shipments"}
          icon="cube"
          label="Sendungen"
          onPress={() => setActiveTab("shipments")}
        />
        <TabButton
          active={activeTab === "help"}
          icon="help-circle"
          label="Hilfe"
          onPress={() => setActiveTab("help")}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? NativeStatusBar.currentHeight : 0,
    backgroundColor: palette.ink,
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
  languageSwitch: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 1,
  },
  languageButton: {
    minWidth: 56,
    alignItems: "center",
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 9,
    backgroundColor: palette.panel,
  },
  languageButtonActive: {
    borderColor: palette.forest,
    backgroundColor: palette.forest,
  },
  languageButtonText: {
    color: palette.muted,
    fontSize: 11,
    fontWeight: "800",
  },
  languageButtonTextActive: {
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
