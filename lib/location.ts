export type SearchLocation = { lat: number; lng: number; label?: string };
type Failure = "permission" | "unavailable" | "timeout" | "insecure" | "unsupported";
export class LocationError extends Error {
  constructor(public reason: Failure) { super(locationErrorMessage(reason)); }
}
export function locationErrorMessage(reason: Failure): string {
  switch (reason) {
    case "permission": return "Location access is blocked. Allow location for Sunspot in your browser’s site settings and check your device’s Location Services. Or choose a city below.";
    case "timeout": return "Your device took too long to find a location. Try again near a window or with Wi-Fi enabled, or choose a city below.";
    case "unavailable": return "Your device couldn’t provide a location. Check that Location Services and Wi-Fi are on and your browser has location access. You can also choose a city below.";
    case "insecure": return "Device location needs a secure connection. Open Sunspot over HTTPS (or localhost on this computer), or choose a city below.";
    case "unsupported": return "Device location isn’t available in this browser. Choose a city below to find nearby viewpoints.";
  }
}
function position(geo: Pick<Geolocation, "getCurrentPosition">, options: PositionOptions): Promise<SearchLocation> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (result: SearchLocation | LocationError) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (result instanceof LocationError) reject(result); else resolve(result);
    };
    // Some embedded browsers never invoke either callback. Always release the UI.
    const timer = setTimeout(() => finish(new LocationError("timeout")), (options.timeout ?? 20000) + 1000);
    try {
      geo.getCurrentPosition(p => {
        const { latitude: lat, longitude: lng } = p.coords;
        finish(Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : new LocationError("unavailable"));
      }, e => finish(new LocationError(e.code === 1 ? "permission" : e.code === 3 ? "timeout" : "unavailable")), options);
    } catch (error) {
      finish(new LocationError(error instanceof Error && error.name === "SecurityError" ? "permission" : "unavailable"));
    }
  });
}
export async function findDeviceLocation(geo: Pick<Geolocation, "getCurrentPosition"> | undefined, secure: boolean, onRetry: () => void = () => {}): Promise<SearchLocation> {
  if (!secure) throw new LocationError("insecure");
  if (!geo) throw new LocationError("unsupported");
  try {
    return await position(geo, { enableHighAccuracy: false, timeout: 8000, maximumAge: 300000 });
  } catch (error) {
    // Permission failures need user action; repeating that request cannot help.
    if (error instanceof LocationError && error.reason === "permission") throw error;
    onRetry();
    return position(geo, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }
}

// Approximate city centers, used only after an explicit choice, never as device coordinates.
export const BAY_AREA_CITIES: (SearchLocation & { label: string })[] = [
  { label: "Berkeley", lat: 37.8715, lng: -122.2730 },
  { label: "Concord", lat: 37.9780, lng: -122.0311 },
  { label: "Cupertino", lat: 37.3230, lng: -122.0322 },
  { label: "Daly City", lat: 37.6879, lng: -122.4702 },
  { label: "Fairfield", lat: 38.2494, lng: -122.0400 },
  { label: "Fremont", lat: 37.5483, lng: -121.9886 },
  { label: "Half Moon Bay", lat: 37.4636, lng: -122.4286 },
  { label: "Hayward", lat: 37.6688, lng: -122.0808 },
  { label: "Livermore", lat: 37.6819, lng: -121.7680 },
  { label: "Mountain View", lat: 37.3861, lng: -122.0839 },
  { label: "Napa", lat: 38.2975, lng: -122.2869 },
  { label: "Oakland", lat: 37.8044, lng: -122.2712 },
  { label: "Palo Alto", lat: 37.4419, lng: -122.1430 },
  { label: "Redwood City", lat: 37.4852, lng: -122.2364 },
  { label: "San Francisco", lat: 37.7749, lng: -122.4194 },
  { label: "San Jose", lat: 37.3382, lng: -121.8863 },
  { label: "San Mateo", lat: 37.5630, lng: -122.3255 },
  { label: "San Rafael", lat: 37.9735, lng: -122.5311 },
  { label: "Santa Clara", lat: 37.3541, lng: -121.9552 },
  { label: "Santa Rosa", lat: 38.4404, lng: -122.7141 },
  { label: "Sunnyvale", lat: 37.3688, lng: -122.0363 },
  { label: "Vallejo", lat: 38.1041, lng: -122.2566 },
  { label: "Walnut Creek", lat: 37.9101, lng: -122.0652 },
];
