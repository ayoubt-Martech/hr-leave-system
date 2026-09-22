import { Holiday, DateCalculationResult, HalfDayType, LeaveType } from '../types';

/**
 * Format a Date object to YYYY-MM-DD
 */
export function formatDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD into a local Date object (setting time to noon to prevent timezone shifts)
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Check if a date falls on a weekend (Saturday = 6, Sunday = 0)
 */
export function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

/**
 * Check if a date is an active holiday
 */
export function getMatchingHoliday(d: Date, holidays: Holiday[]): Holiday | undefined {
  const dateStr = formatDate(d);
  const currentMonthDay = dateStr.slice(5); // "MM-DD"

  return holidays.find((h) => {
    if (h.date === dateStr) return true;
    if (h.is_recurring && h.date.slice(5) === currentMonthDay) return true;
    return false;
  });
}

/**
 * Check if a given date is a working day (Not a weekend and not a holiday)
 */
export function isWorkingDay(d: Date, holidays: Holiday[]): boolean {
  if (isWeekend(d)) return false;
  return !getMatchingHoliday(d, holidays);
}

/**
 * Find the next working day immediately after a given date (Return-to-work date)
 */
export function getReturnToWorkDate(endDateStr: string, holidays: Holiday[]): string {
  const current = parseDate(endDateStr);
  // Start from next calendar day
  current.setDate(current.getDate() + 1);

  // Advance day by day until a working day is found
  while (!isWorkingDay(current, holidays)) {
    current.setDate(current.getDate() + 1);
  }

  return formatDate(current);
}

/**
 * Calculate working days between startDate and endDate (inclusive),
 * excluding weekends and official Tunisian holidays.
 */
export function calculateLeaveDays(
  startDateStr: string,
  endDateStr: string,
  holidays: Holiday[],
  halfDayType: HalfDayType = 'None',
  isShortAuthorization: boolean = false
): DateCalculationResult {
  if (!startDateStr || !endDateStr) {
    return {
      totalCalendarDays: 0,
      weekendDays: 0,
      holidayDays: 0,
      holidaysEncountered: [],
      effectiveWorkingDays: 0,
      returnDate: '',
      isValid: false,
      error: 'Please select start and end dates',
    };
  }

  const start = parseDate(startDateStr);
  const end = parseDate(endDateStr);

  if (start.getTime() > end.getTime()) {
    return {
      totalCalendarDays: 0,
      weekendDays: 0,
      holidayDays: 0,
      holidaysEncountered: [],
      effectiveWorkingDays: 0,
      returnDate: '',
      isValid: false,
      error: 'End date must be on or after start date',
    };
  }

  // Short authorization (0.25 days / 2 hours)
  if (isShortAuthorization) {
    const isWorkday = isWorkingDay(start, holidays);
    return {
      totalCalendarDays: 1,
      weekendDays: isWeekend(start) ? 1 : 0,
      holidayDays: !isWeekend(start) && !isWorkday ? 1 : 0,
      holidaysEncountered: getMatchingHoliday(start, holidays) ? [getMatchingHoliday(start, holidays)!] : [],
      effectiveWorkingDays: isWorkday ? 0.25 : 0,
      returnDate: isWorkday ? formatDate(start) : getReturnToWorkDate(startDateStr, holidays),
      isValid: isWorkday,
      error: isWorkday ? undefined : 'Authorization must be requested on an official working day',
    };
  }

  // Half day (0.5 days)
  if (halfDayType !== 'None' && startDateStr === endDateStr) {
    const isWorkday = isWorkingDay(start, holidays);
    return {
      totalCalendarDays: 1,
      weekendDays: isWeekend(start) ? 1 : 0,
      holidayDays: !isWeekend(start) && !isWorkday ? 1 : 0,
      holidaysEncountered: getMatchingHoliday(start, holidays) ? [getMatchingHoliday(start, holidays)!] : [],
      effectiveWorkingDays: isWorkday ? 0.5 : 0,
      returnDate: getReturnToWorkDate(startDateStr, holidays),
      isValid: isWorkday,
      error: isWorkday ? undefined : 'Half-day must be scheduled on an active working day',
    };
  }

  let totalCalendarDays = 0;
  let weekendDays = 0;
  let holidayDays = 0;
  const holidaysEncountered: Holiday[] = [];
  let workingDaysCount = 0;

  const cur = new Date(start);
  while (cur.getTime() <= end.getTime()) {
    totalCalendarDays++;
    if (isWeekend(cur)) {
      weekendDays++;
    } else {
      const holiday = getMatchingHoliday(cur, holidays);
      if (holiday) {
        holidayDays++;
        if (!holidaysEncountered.some((h) => h.id === holiday.id)) {
          holidaysEncountered.push(holiday);
        }
      } else {
        workingDaysCount++;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  const returnDate = getReturnToWorkDate(endDateStr, holidays);

  return {
    totalCalendarDays,
    weekendDays,
    holidayDays,
    holidaysEncountered,
    effectiveWorkingDays: workingDaysCount,
    returnDate,
    isValid: workingDaysCount > 0,
    error: workingDaysCount === 0 ? 'Selected period contains no working days (all weekends or holidays)' : undefined,
  };
}

/**
 * Check if requested date range overlaps with any active (Pending or Approved) leave request
 */
export function hasDateOverlap(
  newStart: string,
  newEnd: string,
  existingRequests: { id: string; start_date: string; end_date: string; status: string }[],
  ignoreRequestId?: string
): boolean {
  const reqStart = parseDate(newStart).getTime();
  const reqEnd = parseDate(newEnd).getTime();

  return existingRequests.some((req) => {
    if (ignoreRequestId && req.id === ignoreRequestId) return false;
    if (req.status === 'Declined' || req.status === 'Cancelled') return false;

    const existStart = parseDate(req.start_date).getTime();
    const existEnd = parseDate(req.end_date).getTime();

    // Overlap condition: reqStart <= existEnd && reqEnd >= existStart
    return reqStart <= existEnd && reqEnd >= existStart;
  });
}

/**
 * Add a number of calendar days to a YYYY-MM-DD string
 */
export function addDays(dateStr: string, n: number): string {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

/**
 * Lead-time policy: Vacation/Authorization need 24h notice (no same-day
 * requests); requests over 3 working days need 15 days notice. Emergency
 * and Sick Leave are exempt since they're inherently unplannable.
 */
export function getLeadTimeError(
  type: LeaveType,
  startDate: string,
  daysCount: number,
  today: string = formatDate(new Date())
): string | null {
  if (type === 'Emergency' || type === 'Sick Leave') return null;
  if (!startDate) return null;

  if (startDate < addDays(today, 1)) {
    return 'Leave requests need at least 24 hours notice — the earliest start date is tomorrow.';
  }

  if (daysCount > 3 && startDate < addDays(today, 15)) {
    return 'Requests longer than 3 days need at least 15 days notice.';
  }

  return null;
}

/**
 * Format date for friendly human reading: "Mon, 15 Sep 2026"
 */
export function formatFriendlyDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = parseDate(dateStr);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
