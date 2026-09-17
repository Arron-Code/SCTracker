import { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import MapView, { Circle, Marker } from "react-native-maps";
import type { Geofence, Position } from "./domain";
import { distanceMeters, positionAtDistance } from "./geofence";

type Labels = {
  title: string;
  centerHint: string;
  radius: string;
  save: string;
  cancel: string;
};

export function GeofenceEditor({
  visible,
  value,
  labels,
  onSave,
  onClose,
}: {
  visible: boolean;
  value: Geofence | null;
  labels: Labels;
  onSave: (value: Geofence) => void;
  onClose: () => void;
}) {
  const [center, setCenter] = useState<Position>([0, 0]);
  const [radius, setRadius] = useState(100);
  const [radiusText, setRadiusText] = useState("100");

  useEffect(() => {
    if (!value) return;
    setCenter(value.center);
    setRadius(value.radiusMeters);
    setRadiusText(String(Math.round(value.radiusMeters)));
  }, [value]);

  if (!value) return null;
  const radiusHandle = positionAtDistance(center, radius);
  const delta = Math.max(0.005, (radius / 111_320) * 5);

  function applyRadiusText(text: string) {
    setRadiusText(text);
    const parsed = Number(text.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 1) setRadius(parsed);
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <Text style={styles.title}>{labels.title}</Text>
        <Text style={styles.hint}>{labels.centerHint}</Text>
        <MapView
          style={styles.map}
          region={{
            latitude: center[1],
            longitude: center[0],
            latitudeDelta: delta,
            longitudeDelta: delta,
          }}
        >
          <Circle
            center={{ latitude: center[1], longitude: center[0] }}
            radius={radius}
            fillColor="rgba(31,90,67,0.22)"
            strokeColor="#1F5A43"
            strokeWidth={3}
          />
          <Marker
            coordinate={{ latitude: center[1], longitude: center[0] }}
            draggable
            pinColor="#1F5A43"
            onDragEnd={(event) =>
              setCenter([
                event.nativeEvent.coordinate.longitude,
                event.nativeEvent.coordinate.latitude,
              ])
            }
          />
          <Marker
            coordinate={{ latitude: radiusHandle[1], longitude: radiusHandle[0] }}
            draggable
            pinColor="#C88124"
            onDragEnd={(event) => {
              const nextRadius = Math.max(
                1,
                distanceMeters(center, [
                  event.nativeEvent.coordinate.longitude,
                  event.nativeEvent.coordinate.latitude,
                ]),
              );
              setRadius(nextRadius);
              setRadiusText(String(Math.round(nextRadius)));
            }}
          />
        </MapView>
        <Text style={styles.label}>{labels.radius}</Text>
        <TextInput
          value={radiusText}
          onChangeText={applyRadiusText}
          keyboardType="decimal-pad"
          style={styles.input}
          accessibilityLabel={labels.radius}
        />
        <Text style={styles.coordinates}>
          {center[1].toFixed(6)}, {center[0].toFixed(6)}
        </Text>
        <View style={styles.actions}>
          <Pressable style={[styles.button, styles.secondary]} onPress={onClose}>
            <Text style={styles.secondaryText}>{labels.cancel}</Text>
          </Pressable>
          <Pressable
            style={styles.button}
            onPress={() =>
              onSave({
                ...value,
                center,
                radiusMeters: radius,
                updatedAt: new Date().toISOString(),
              })
            }
          >
            <Text style={styles.buttonText}>{labels.save}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 10, padding: 18, paddingTop: 52, backgroundColor: "#F4F2EA" },
  title: { color: "#14251D", fontSize: 24, fontWeight: "800" },
  hint: { color: "#68766F", fontSize: 12, lineHeight: 18 },
  map: { flex: 1, minHeight: 360, borderRadius: 14 },
  label: { color: "#14251D", fontSize: 11, fontWeight: "700" },
  input: {
    minHeight: 46,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#DDE0D8",
    borderRadius: 9,
    color: "#14251D",
    backgroundColor: "#FFFFFF",
  },
  coordinates: { color: "#68766F", fontSize: 10 },
  actions: { flexDirection: "row", gap: 9 },
  button: {
    minHeight: 46,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    backgroundColor: "#1F5A43",
  },
  secondary: { borderWidth: 1, borderColor: "#1F5A43", backgroundColor: "#FFFFFF" },
  buttonText: { color: "#FFFFFF", fontWeight: "800" },
  secondaryText: { color: "#1F5A43", fontWeight: "800" },
});
