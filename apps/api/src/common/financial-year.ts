// Single source of truth for the Indian financial year (Apr–Mar) and the PID / patent-handle
// formats. Centralised so a formatting drift can never mint a parallel/duplicate sequence.
//
// SquarkIP is an Indian firm, so the financial year is defined in IST regardless of where the
// server runs (a UTC box must NOT bucket a 00:30-IST-Apr-1 project into the previous year).

const IST = 'Asia/Kolkata';

/** The Indian financial year (starts Apr 1) that `instant` falls in, computed in IST. */
export function financialYear(instant: Date, timeZone: string = IST): { startYear: number; label: string } {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(instant);
  const y = Number(parts.find(p => p.type === 'year')!.value);
  const m = Number(parts.find(p => p.type === 'month')!.value); // 1–12
  const startYear = m >= 4 ? y : y - 1; // FY starts in April
  const label = `${String(startYear % 100).padStart(2, '0')}_${String((startYear + 1) % 100).padStart(2, '0')}`;
  return { startYear, label }; // e.g. Apr-2026 → { 2026, "26_27" }
}

/** PID display form, e.g. SQ_26_27_001 (serial zero-padded to 3, grows past 999 naturally). */
export function formatPid(orgCode: string, fyLabel: string, serial: number): string {
  return `${orgCode}_${fyLabel}_${String(serial).padStart(3, '0')}`;
}

/** Patent handle, e.g. Pat_MLK_001 (code + serial, zero-padded to 3, grows past 999 naturally). */
export function formatPatentHandle(clientCode: string, serial: number): string {
  return `Pat_${clientCode}_${String(serial).padStart(3, '0')}`;
}

// Canonical scope keys for the atomic allocator — the ONLY place these strings are built.
export const pidScope = (organizationId: string, fyLabel: string) => `pid:${organizationId}:${fyLabel}`;
export const patentScope = (clientId: string) => `pat:${clientId}`;
