// utils/geo.ts
import { Platform, PermissionsAndroid } from "react-native";
import Geolocation from "react-native-geolocation-service";

export async function ensureLocationPermission(): Promise<boolean> {
  if (Platform.OS === "ios") {
    const status = await Geolocation.requestAuthorization("whenInUse");
    return status === "granted";
  }
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}
