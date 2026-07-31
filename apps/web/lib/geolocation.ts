// Mandatory location capture for attendance punches. Returns the current GPS position or throws
// a clear, user-facing message — the caller MUST block the punch on rejection (location is required).

export type PunchCoords = { lat: number; lng: number; accuracy?: number; area?: string };

/**
 * Reverse-geocode coordinates to a short human area/landmark via OpenStreetMap Nominatim (free,
 * no API key). Best-effort: returns undefined on any failure so a punch is NEVER blocked by it.
 * Runs on the client at punch time; the result is stored on the attendance row so the team-location
 * table shows a dynamic area rather than a hardcoded office.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | undefined> {
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(url, { headers: { 'Accept': 'application/json' }, signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return undefined;
    const j = await res.json() as { name?: string; address?: Record<string, string> };
    const a = j.address ?? {};
    // Prefer a specific landmark/neighbourhood, then locality, then city — kept short.
    const parts = [
      j.name || a.neighbourhood || a.suburb || a.hamlet || a.road,
      a.city || a.town || a.village || a.county,
    ].filter(Boolean);
    const label = [...new Set(parts)].slice(0, 2).join(', ');
    return label || undefined;
  } catch { return undefined; }
}

/** Get the device's current location. Rejects with a human-readable message on denial/failure. */
export function getCurrentLocation(): Promise<PunchCoords> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(new Error('Location isn’t available on this device, so you can’t punch here.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy }),
      err => {
        const msg =
          err.code === err.PERMISSION_DENIED
            ? 'Location is required to punch. Please allow location access in your browser and try again.'
            : err.code === err.TIMEOUT
            ? 'Couldn’t get your location in time. Please try again.'
            : 'Couldn’t get your location. Please enable GPS/location and try again.';
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 0 },
    );
  });
}

/** A Google Maps link for a stored punch location (no API key needed). */
export function mapLink(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`;
}
