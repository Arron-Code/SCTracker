import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Location from "expo-location";
import * as Notifications from "expo-notifications";
import * as TaskManager from "expo-task-manager";
import { Platform } from "react-native";
import type { Plot } from "./domain";

export const GEOFENCING_TASK = "sctracker-background-geofencing";
export const GEOFENCE_EVENTS_KEY = "sctracker.geofenceEvents.v1";

export type GeofenceEvent = {
  plotId: string;
  eventType: "enter" | "exit";
  occurredAt: string;
};

type GeofencingTaskData = {
  eventType: Location.GeofencingEventType;
  region: Location.LocationRegion;
};

if (!TaskManager.isTaskDefined(GEOFENCING_TASK)) {
  TaskManager.defineTask<GeofencingTaskData>(
    GEOFENCING_TASK,
    async ({ data, error }) => {
      if (error) {
        console.error("Geofencing task failed", error);
        return;
      }
      const plotId = data.region.identifier;
      if (!plotId) {
        console.error("Geofencing event did not include a plot identifier");
        return;
      }
      const geofenceEvent: GeofenceEvent = {
        plotId,
        eventType:
          data.eventType === Location.GeofencingEventType.Enter ? "enter" : "exit",
        occurredAt: new Date().toISOString(),
      };
      const stored = await AsyncStorage.getItem(GEOFENCE_EVENTS_KEY);
      const events = stored ? (JSON.parse(stored) as GeofenceEvent[]) : [];
      await AsyncStorage.setItem(
        GEOFENCE_EVENTS_KEY,
        JSON.stringify([geofenceEvent, ...events].slice(0, 100)),
      );
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "SCTracker Geofencing",
          body:
            geofenceEvent.eventType === "enter"
              ? "Eine gespeicherte Plot-Region wurde betreten."
              : "Eine gespeicherte Plot-Region wurde verlassen.",
          data: { plotId: geofenceEvent.plotId, eventType: geofenceEvent.eventType },
        },
        trigger: null,
      });
    },
  );
}

export async function synchronizeGeofencing(plots: Plot[]): Promise<number> {
  const regionLimit = Platform.OS === "ios" ? 20 : 100;
  const monitored = plots.filter((plot) => plot.geofence?.enabled).slice(0, regionLimit);
  const started = await Location.hasStartedGeofencingAsync(GEOFENCING_TASK);
  if (monitored.length === 0) {
    if (started) await Location.stopGeofencingAsync(GEOFENCING_TASK);
    return 0;
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") {
    throw new Error("Foreground location permission was not granted.");
  }
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") {
    throw new Error("Background location permission was not granted.");
  }
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("geofencing", {
      name: "Geofencing",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  await Notifications.requestPermissionsAsync();
  await Location.startGeofencingAsync(
    GEOFENCING_TASK,
    monitored.map((plot) => ({
      identifier: plot.id,
      latitude: plot.geofence!.center[1],
      longitude: plot.geofence!.center[0],
      radius: plot.geofence!.radiusMeters,
      notifyOnEnter: true,
      notifyOnExit: true,
    })),
  );
  return monitored.length;
}
