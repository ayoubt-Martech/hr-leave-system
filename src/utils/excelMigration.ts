import * as XLSX from 'xlsx';
import { LeaveType, User } from '../types';

/**
 * Clean non-numeric balance strings like "17( rest 2025)+18" -> 35
 * or "14 + 1.5 accrued" -> 15.5
 */
export function normalizeLegacyBalanceString(rawStr: string | number): number {
  if (typeof rawStr === 'number') {
    return isNaN(rawStr) ? 0 : rawStr;
  }
  if (!rawStr || typeof rawStr !== 'string') return 0;

  const cleaned = rawStr.trim();
  // If it's a direct number string
  if (/^-?\d+(\.\d+)?$/.test(cleaned)) {
    return parseFloat(cleaned);
  }

  // Extract all numbers that might be added together, stripping out text like "( rest 2025)"
  // Example: "17( rest 2025)+18" -> tokens ["17", "+", "18"]
  try {
    // Remove parenthetical annotations
    const withoutParens = cleaned.replace(/\([^)]*\)/g, ' ');
    // Match addition patterns like 17 + 18 or 17+18.5
    const numbers = withoutParens.match(/-?\d+(\.\d+)?/g);
    if (numbers && numbers.length > 0) {
      const sum = numbers.map(Number).reduce((acc, n) => acc + (isNaN(n) ? 0 : n), 0);
      return sum;
    }
  } catch {
    // fallback
  }

  const fallbackNumber = parseFloat(cleaned);
  return isNaN(fallbackNumber) ? 0 : fallbackNumber;
}

/**
 * Map legacy leave type text to standard LeaveType
 */
export function normalizeLeaveType(typeStr: string): LeaveType {
  if (!typeStr) return 'Vacation';
  const lower = typeStr.toLowerCase().trim();
  if (lower.includes('sick') || lower.includes('maladie')) return 'Sick Leave';
  if (lower.includes('emergency') || lower.includes('urgence')) return 'Emergency';
  if (lower.includes('auth') || lower.includes('sortie') || lower.includes('2h') || lower.includes('0.25')) return 'Authorization';
  if (lower.includes('vacation') || lower.includes('cong')) return 'Vacation';
  return 'Vacation';
}

/**
 * Normalize a full name for matching purposes: trim, collapse internal
 * whitespace, strip diacritics, lower-case.
 */
export function normalizeNameForMatching(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function at(cells: string[], i: number): string {
  return (cells[i] ?? '').toString().trim();
}

/** A "Year 2024" / "Year 2025" section marker row (loose match — one real sheet has a stray trailing quote) */
export function isYearMarkerRow(cells: string[]): boolean {
  return /^year\s+\d{4}/i.test(at(cells, 0));
}

/** The "Start date | Due date | ..." column header row — appears 0, 1, or N times per sheet */
export function isHeaderRow(cells: string[]): boolean {
  return at(cells, 0).toLowerCase().startsWith('start date');
}

/** A stray "Name +216 xx xxx xxx" row some sheets have right after the year marker */
export function isStrayNameRow(cells: string[]): boolean {
  const first = at(cells, 0);
  if (!first) return false;
  const restBlank = cells.slice(1).every((c) => (c ?? '').toString().trim() === '');
  return restBlank && /\+?\d[\d\s]{6,}\d/.test(first);
}

/** A free-text "End of contract <date>" row — the only signal for an employee who left */
export function isTerminationMarkerRow(
  cells: string[]
): { isMarker: boolean; rawText: string; parsedDate: string | null } {
  const first = at(cells, 0);
  const restBlank = cells.slice(1).every((c) => (c ?? '').toString().trim() === '');

  if (first && restBlank && /end of contract/i.test(first)) {
    const dateMatch = first.match(/([A-Za-z]+\s+\d{1,2},?\s+\d{4})/);
    let parsedDate: string | null = null;
    if (dateMatch) {
      const d = new Date(dateMatch[1]);
      if (!isNaN(d.getTime())) {
        parsedDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
    return { isMarker: true, rawText: first, parsedDate };
  }

  return { isMarker: false, rawText: '', parsedDate: null };
}

/** Every cell blank — used to filter trailing formatted-but-empty rows */
export function isBlankDataRow(cells: string[]): boolean {
  return cells.every((c) => (c ?? '').toString().trim() === '');
}

/**
 * Parse a legacy date cell into ISO YYYY-MM-DD.
 * Handles blank/"-" (no date), DD/MM/YYYY strings, and defensively an Excel serial number.
 */
export function parseLegacyDate(raw: string | number | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    const ms = Math.round((raw - 25569) * 86400 * 1000); // Excel epoch (1899-12-30) -> Unix epoch
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  const trimmed = raw.trim();
  if (trimmed === '' || trimmed === '-') return null;

  const dmy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  const parsed = new Date(trimmed);
  if (!isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
  }

  return null;
}

export interface ParsedLeaveRow {
  startDate: string;
  dueDate: string;
  recoveryDate: string | null;
  days: number;
  type: LeaveType;
  note: string;
}

export interface ParsedSheet {
  sheetName: string;
  employeeName: string;
  normalizedName: string;
  isEmpty: boolean;
  openingBalance: number | null;
  balanceSource: 'initial_solde' | 'remaining' | 'none';
  leaveRows: ParsedLeaveRow[];
  isTerminated: boolean;
  terminationDate: string | null;
  terminationRawText: string | null;
}

/**
 * Parse one worksheet of the legacy "Absence Leave.xlsx" tracker into
 * structured data. Column layout is fixed regardless of header presence:
 * [0]=Start date [1]=Due date [2]=Date of recovery [3]=Number of days
 * [4]=Remaining [5]=Initial solde [6]=Type of leave [7+]=free-text notes.
 */
export function parseWorksheet(ws: XLSX.WorkSheet, sheetName: string): ParsedSheet {
  const rawRows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '' });

  const employeeName = sheetName.trim();
  const normalizedName = normalizeNameForMatching(employeeName);

  const leaveRows: ParsedLeaveRow[] = [];
  const remainingValues: number[] = [];
  const initialSoldeValues: number[] = [];
  let isTerminated = false;
  let terminationDate: string | null = null;
  let terminationRawText: string | null = null;

  for (const rawRow of rawRows) {
    const cells = rawRow.map((c) => (c === null || c === undefined ? '' : String(c)));

    if (isBlankDataRow(cells)) continue;
    if (isYearMarkerRow(cells)) continue;

    const term = isTerminationMarkerRow(cells);
    if (term.isMarker) {
      isTerminated = true;
      terminationRawText = term.rawText;
      terminationDate = term.parsedDate;
      continue;
    }

    if (isHeaderRow(cells)) continue;
    if (isStrayNameRow(cells)) continue;

    // Balance columns can carry a value on an opening-only row OR alongside
    // a real leave row, depending on how each sheet's owner used it.
    const remainingRaw = at(cells, 4);
    const initialSoldeRaw = at(cells, 5);
    if (remainingRaw !== '') remainingValues.push(normalizeLegacyBalanceString(remainingRaw));
    if (initialSoldeRaw !== '') initialSoldeValues.push(normalizeLegacyBalanceString(initialSoldeRaw));

    const startRaw = at(cells, 0);
    if (!startRaw) continue; // opening-balance-only row, no leave entry

    const startDate = parseLegacyDate(startRaw);
    if (!startDate) continue; // unrecognized row shape — skip defensively

    const dueDate = parseLegacyDate(at(cells, 1)) ?? startDate;
    const recoveryDate = parseLegacyDate(at(cells, 2));
    const daysRaw = at(cells, 3);
    const days = daysRaw && !isNaN(parseFloat(daysRaw)) ? parseFloat(daysRaw) : 1;
    const type = normalizeLeaveType(at(cells, 6));
    const note = cells.slice(7).map((c) => c.trim()).filter(Boolean).join(' | ');

    leaveRows.push({ startDate, dueDate, recoveryDate, days, type, note });
  }

  const isEmpty =
    leaveRows.length === 0 && remainingValues.length === 0 && initialSoldeValues.length === 0 && !isTerminated;

  let openingBalance: number | null = null;
  let balanceSource: 'initial_solde' | 'remaining' | 'none' = 'none';

  if (initialSoldeValues.length > 0 || remainingValues.length > 0) {
    if (initialSoldeValues.length >= remainingValues.length) {
      balanceSource = 'initial_solde';
      openingBalance = initialSoldeValues[initialSoldeValues.length - 1];
    } else {
      balanceSource = 'remaining';
      openingBalance = remainingValues[remainingValues.length - 1];
    }
  }

  return {
    sheetName,
    employeeName,
    normalizedName,
    isEmpty,
    openingBalance,
    balanceSource,
    leaveRows,
    isTerminated,
    terminationDate,
    terminationRawText,
  };
}

/** Parse every worksheet of an uploaded legacy Absence Leave.xlsx workbook. */
export async function parseLegacyWorkbook(file: File): Promise<ParsedSheet[]> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  return wb.SheetNames.map((name) => parseWorksheet(wb.Sheets[name], name));
}

/**
 * Match a parsed sheet to an existing app user — no fuzzy guessing on HR
 * data. Tries an exact normalized-name match first (most sheets), then
 * falls back to the known-employee-email hint (catches cases like "Ayoub
 * Ben Thabet" vs. the account's actual full name "Ayoub T.").
 */
export function suggestUserMatch(
  sheet: ParsedSheet,
  existingUsers: User[],
  knownEmail?: string | null
): { matchedUserId: string | null; confidence: 'exact_name' | 'exact_email' | 'none' } {
  const byName = existingUsers.find((u) => normalizeNameForMatching(u.full_name) === sheet.normalizedName);
  if (byName) return { matchedUserId: byName.id, confidence: 'exact_name' };

  if (knownEmail) {
    const byEmail = existingUsers.find((u) => u.email.toLowerCase() === knownEmail.toLowerCase());
    if (byEmail) return { matchedUserId: byEmail.id, confidence: 'exact_email' };
  }

  return { matchedUserId: null, confidence: 'none' };
}

/**
 * Best-effort name -> email pre-fill for known current employees, provided
 * out-of-band (the legacy file itself has no emails). This is a soft
 * suggestion only — every field it seeds stays editable in the review UI,
 * never written back into the source file or treated as authoritative.
 */
const KNOWN_EMPLOYEE_EMAILS: Record<string, string> = Object.fromEntries(
  Object.entries({
    'Radhwen boulahia': 'radhwen.b@martechlabs.io',
    'Amel Omri': 'amel.o@martechlabs.io',
    'Aymen Khlil': 'aymen.k@martechlabs.io',
    'Ayoub Ben Thabet': 'ayoub.t@martechlabs.io',
    'Ghaith Jridi': 'ghaith.j@martechlabs.io',
    'Hajer Ouled Ahmed': 'hajer.o@martechlabs.io',
    'Khairy Omar Keskess': 'khairiomar.k@martechlabs.io',
    'Marwen Soltani': 'marouen.s@martechlabs.io',
    'Mohamed Ettayeb': 'mohamed.e@martechlabs.io',
    'Mouhamed Boufaied': 'mouhamed.bo@martechlabs.io',
    'Rimeh Rabeh': 'rimeh.r@martechlabs.io',
    'Wael Nalouti': 'wael.n@martechlabs.io',
  }).map(([name, email]) => [normalizeNameForMatching(name), email])
);

export function suggestKnownEmail(sheet: ParsedSheet): string | null {
  return KNOWN_EMPLOYEE_EMAILS[sheet.normalizedName] ?? null;
}

/** Fallback placeholder email for a brand-new legacy user with no known real address. */
export function generatePlaceholderEmail(fullName: string): string {
  const slug = normalizeNameForMatching(fullName).replace(/[^a-z0-9]+/g, '.').replace(/^\.+|\.+$/g, '');
  return `legacy+${slug || 'employee'}@import.local`;
}
