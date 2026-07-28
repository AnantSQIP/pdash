// Mandatory location capture for attendance punches. Returns the current GPS position or throws
// a clear, user-facing message — the caller MUST block the punch on rejection (location is required).

export type PunchCoords = { lat: number; lng: number; accuracy?: number };

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
