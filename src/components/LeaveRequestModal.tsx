import {
    AlertTriangle,
    ShieldAlert,
    Sparkles,
    X
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { ApiService } from '../services/api';
import { HalfDayType, Holiday, LeaveType, SpecialLeaveType, User } from '../types';
import { MAX_PENDING_REQUESTS } from '../utils/constants';
import {
    addDays,
    calculateLeaveDays,
    formatDate,
    formatFriendlyDate,
    getLeadTimeError,
    hasDateOverlap
} from '../utils/dateUtils';

interface LeaveRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onSuccess: () => void;
}

export const LeaveRequestModal: React.FC<LeaveRequestModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onSuccess,
}) => {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [existingRequests, setExistingRequests] = useState<any[]>([]);

  useEffect(() => {
    ApiService.getHolidays().then(setHolidays).catch(() => {});
    ApiService.getRequests().then((reqs) =>
      setExistingRequests(reqs.filter((r) => r.user_id === currentUser.id))
    ).catch(() => {});
  }, [currentUser.id]);

  // Check concurrent pending requests limit
  const pendingRequestsCount = existingRequests.filter((r) => r.status === 'Pending').length;
  const hasExceededPendingLimit = pendingRequestsCount >= MAX_PENDING_REQUESTS;

  // Form states
  const todayStr = formatDate(new Date());
  const defaultStartStr = addDays(todayStr, 1); // default type is Vacation, which needs 24h notice
  const [startDate, setStartDate] = useState(defaultStartStr);
  const [endDate, setEndDate] = useState(defaultStartStr);
  const [leaveType, setLeaveType] = useState<LeaveType>('Vacation');
  const [isSpecial, setIsSpecial] = useState(false);
  const [specialType, setSpecialType] = useState<SpecialLeaveType>('Maternity');
  const [isHalfDay, setIsHalfDay] = useState(false);
  const [halfDayType, setHalfDayType] = useState<HalfDayType>('AM');
  const [isShortAuth, setIsShortAuth] = useState(false);
  const [note, setNote] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);

  // When short authorization is toggled
  useEffect(() => {
    if (isShortAuth) {
      setLeaveType('Authorization');
      setEndDate(startDate);
      setIsHalfDay(false);
    } else if (leaveType === 'Authorization') {
      setLeaveType('Vacation');
    }
  }, [isShortAuth, startDate]);

  // When half day is toggled
  useEffect(() => {
    if (isHalfDay) {
      setEndDate(startDate);
      setIsShortAuth(false);
    }
  }, [isHalfDay, startDate]);

  // Real-time date engine calculation
  const calculation = useMemo(() => {
    return calculateLeaveDays(
      startDate,
      endDate,
      holidays,
      isHalfDay ? halfDayType : 'None',
      isShortAuth
    );
  }, [startDate, endDate, holidays, isHalfDay, halfDayType, isShortAuth]);

  // Check overlap with existing active requests
  const overlapExists = useMemo(() => {
    if (!startDate || !endDate) return false;
    return hasDateOverlap(startDate, endDate, existingRequests);
  }, [startDate, endDate, existingRequests]);

  // Lead-time policy: 24h notice minimum; 15 days for requests over 3 days
  const leadTimeError = useMemo(() => {
    return getLeadTimeError(leaveType, startDate, calculation.effectiveWorkingDays);
  }, [leaveType, startDate, calculation.effectiveWorkingDays]);

  // Check negative balance
  const resultingBalance = +(currentUser.current_balance - calculation.effectiveWorkingDays).toFixed(2);
  const isNegativeBalance = resultingBalance < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (hasExceededPendingLimit) {
      setErrorMsg('Policy Limit Reached: Max 2 concurrent Pending requests allowed per employee.');
      return;
    }
    if (!calculation.isValid) {
      setErrorMsg(calculation.error || 'Invalid date selection');
      return;
    }
    if (overlapExists) {
      setErrorMsg('Date Overlap: You already have an active leave request covering this date range.');
      return;
    }
    if (leadTimeError) {
      setErrorMsg(leadTimeError);
      return;
    }
    if (isNegativeBalance && !note.trim()) {
      setErrorMsg('Mandatory Note: A detailed explanation note is required for negative leave balance requests.');
      return;
    }

    setSubmitting(true);
    try {
      await ApiService.addRequest({
        user_id: currentUser.id,
        start_date: startDate,
        end_date: endDate,
        return_date: calculation.returnDate,
        days_count: calculation.effectiveWorkingDays,
        type: leaveType,
        is_special: isSpecial,
        special_type: isSpecial ? specialType : 'None',
        half_day_type: isHalfDay ? halfDayType : 'None',
        is_short_authorization: isShortAuth,
        note: note.trim(),
        is_legacy_backfill: false,
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Failed to submit leave request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="relative bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-xl w-full p-6 transition-all my-8 animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-100">
          <div>
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">Request Time Off</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Weekends and Tunisian holidays don't count against your leave.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
            aria-label="Close modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Pending limit warning if applicable */}
        {hasExceededPendingLimit && (
          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900">
              <span className="font-semibold">You're at the limit:</span> you already have {pendingRequestsCount} pending requests. Wait for one to be resolved before submitting another.
            </div>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-sm">
          
          {/* Leave Type Selector */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1.5">Leave Category</label>
            <div className="grid grid-cols-3 gap-2">
              {(['Vacation', 'Emergency', 'Sick Leave'] as LeaveType[]).map((t) => (
                <button
                  type="button"
                  key={t}
                  disabled={isShortAuth}
                  onClick={() => setLeaveType(t)}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-medium transition-all text-center cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                    leaveType === t
                      ? 'bg-zinc-900 border-zinc-900 text-white font-semibold shadow-xs'
                      : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            {isShortAuth && (
              <p className="text-[11px] text-zinc-400 mt-1.5">
                Category is set to "Authorization" automatically for 2-hour requests.
              </p>
            )}
          </div>

          {/* Partial Day Controls */}
          <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200/80 space-y-2.5">
            <div className="text-xs font-semibold text-zinc-700">Duration</div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="durationMode"
                  checked={!isHalfDay && !isShortAuth}
                  onChange={() => {
                    setIsHalfDay(false);
                    setIsShortAuth(false);
                  }}
                  className="text-zinc-900 focus:ring-zinc-900"
                />
                <span className="font-medium text-zinc-800">Full Day(s)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="durationMode"
                  checked={isHalfDay}
                  onChange={() => setIsHalfDay(true)}
                  className="text-zinc-900 focus:ring-zinc-900"
                />
                <span className="font-medium text-zinc-800">Half Day (0.5d)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="radio"
                  name="durationMode"
                  checked={isShortAuth}
                  onChange={() => setIsShortAuth(true)}
                  className="text-zinc-900 focus:ring-zinc-900"
                />
                <span className="font-medium text-zinc-800">2-Hour Authorization (0.25d)</span>
              </label>
            </div>

            <label className="flex items-center gap-2 cursor-pointer select-none text-xs pt-1.5 border-t border-zinc-200">
              <input
                type="checkbox"
                checked={isSpecial}
                onChange={(e) => setIsSpecial(e.target.checked)}
                className="rounded text-zinc-900 focus:ring-zinc-900 w-3.5 h-3.5"
              />
              <span className="font-medium text-zinc-800">Special Event</span>
            </label>

            {!isHalfDay && !isShortAuth && (
              <p className="text-[11px] text-zinc-400 pt-1">
                Pick any start and end date below to request one or more full days.
              </p>
            )}

            {isShortAuth && (
              <p className="text-[11px] text-zinc-400 pt-1">
                Based on an 8-hour workday: 2 hours = 0.25 day.
              </p>
            )}

            {isSpecial && (
              <p className="text-[11px] text-zinc-400 pt-1">
                Tracked separately for HR records, but still deducted from your regular leave balance below.
              </p>
            )}

            {/* Half day selector */}
            {isHalfDay && (
              <div className="pt-2 flex items-center gap-3 border-t border-zinc-200 text-xs">
                <span className="text-zinc-500 font-medium">Session:</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="halfDaySession"
                    checked={halfDayType === 'AM'}
                    onChange={() => setHalfDayType('AM')}
                    className="text-zinc-900 focus:ring-zinc-900"
                  />
                  <span>Morning (AM)</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    name="halfDaySession"
                    checked={halfDayType === 'PM'}
                    onChange={() => setHalfDayType('PM')}
                    className="text-zinc-900 focus:ring-zinc-900"
                  />
                  <span>Afternoon (PM)</span>
                </label>
              </div>
            )}

            {/* Special leave selector */}
            {isSpecial && (
              <div className="pt-2 flex items-center gap-3 border-t border-zinc-200 text-xs">
                <span className="text-zinc-500 font-medium">Category:</span>
                {(['Maternity', 'Paternity', 'Bereavement'] as SpecialLeaveType[]).map((st) => (
                  <label key={st} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="specialType"
                      checked={specialType === st}
                      onChange={() => setSpecialType(st)}
                      className="text-zinc-900 focus:ring-zinc-900"
                    />
                    <span>{st}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Date Picker Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Start Date (Inclusive)
              </label>
              <input
                id="input-start-date"
                type="date"
                value={startDate}
                min={leaveType === 'Emergency' || leaveType === 'Sick Leave' ? undefined : addDays(todayStr, 1)}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (isHalfDay || isShortAuth || e.target.value > endDate) {
                    setEndDate(e.target.value);
                  }
                }}
                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                End Date (Inclusive)
              </label>
              <input
                id="input-end-date"
                type="date"
                value={endDate}
                disabled={isHalfDay || isShortAuth}
                onChange={(e) => setEndDate(e.target.value)}
                min={startDate}
                className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden disabled:bg-zinc-100 disabled:text-zinc-400"
                required
              />
            </div>
          </div>

          {/* Smart Date Calculation Engine Card */}
          <div className="bg-zinc-50/80 p-3.5 rounded-xl border border-zinc-200/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-900 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-zinc-600" />
                Working Days Calculation
              </span>
              <span className="text-sm font-bold text-zinc-900 bg-white px-2.5 py-0.5 rounded-lg border border-zinc-200">
                {calculation.effectiveWorkingDays} {calculation.effectiveWorkingDays === 1 ? 'day' : 'days'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs pt-1.5 border-t border-zinc-200/60">
              <span className="text-zinc-600 font-medium">Return to Office:</span>
              <span className="font-semibold text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200">
                {calculation.returnDate ? formatFriendlyDate(calculation.returnDate) : '—'}
              </span>
            </div>

            {calculation.holidaysEncountered.length > 0 && (
              <div className="text-[11px] text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200">
                <span className="font-semibold">Excluded Tunisian Holiday:</span>{' '}
                {calculation.holidaysEncountered.map((h) => h.name).join(', ')}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowBreakdown((v) => !v)}
              className="text-[11px] text-zinc-400 hover:text-zinc-600 underline cursor-pointer"
            >
              {showBreakdown ? 'Hide' : 'Show'} calculation details
            </button>

            {showBreakdown && (
              <div className="grid grid-cols-3 gap-2 text-[11px] text-zinc-500 pt-1.5 border-t border-zinc-200/60">
                <div>
                  <span className="block text-zinc-400">Calendar Days:</span>
                  <span className="font-semibold text-zinc-800">{calculation.totalCalendarDays}</span>
                </div>
                <div>
                  <span className="block text-zinc-400">Weekend Days:</span>
                  <span className="font-semibold text-zinc-800">{calculation.weekendDays}</span>
                </div>
                <div>
                  <span className="block text-zinc-400">Official Holidays:</span>
                  <span className="font-semibold text-zinc-800">{calculation.holidayDays}</span>
                </div>
              </div>
            )}
          </div>

          {/* Overlap Error Display */}
          {overlapExists && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>Date Conflict:</strong> You already have an active request overlapping this timeframe.
              </span>
            </div>
          )}

          {/* Lead-Time Policy Error Display */}
          {!overlapExists && leadTimeError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2.5 text-xs text-rose-800">
              <ShieldAlert className="w-4 h-4 text-rose-600 shrink-0" />
              <span>
                <strong>Notice Required:</strong> {leadTimeError}
              </span>
            </div>
          )}

          {/* Negative Balance Alert & Requirement */}
          {isNegativeBalance && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-1.5">
              <div className="flex items-center gap-2 text-rose-900 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                <span>Negative Balance Request ({resultingBalance} days)</span>
              </div>
              <p className="text-xs text-rose-700">
                You have <strong>{currentUser.current_balance} days</strong> available — this request would put you at <strong>{resultingBalance} days</strong>. Explain why below; your manager will see it when reviewing.
              </p>
            </div>
          )}

          {/* Reason / Note Input */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-zinc-700">
                Reason / Explanation {isNegativeBalance && <span className="text-rose-600 font-bold">* (Required)</span>}
              </label>
              <span className="text-[10px] text-zinc-400">Hidden on Team Calendar</span>
            </div>
            <textarea
              id="input-leave-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                isNegativeBalance
                  ? 'Please explain the reason for this negative balance request...'
                  : 'Optional note for your approving manager...'
              }
              className={`w-full px-3 py-2 bg-white border rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden ${
                isNegativeBalance && !note.trim() ? 'border-rose-300 bg-rose-50/20' : 'border-zinc-200'
              }`}
            />
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2.5 bg-rose-100 text-rose-800 text-xs rounded-xl font-medium">
              {errorMsg}
            </div>
          )}

          {/* Modal Footer Actions */}
          <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="btn-submit-request"
              type="submit"
              disabled={submitting || hasExceededPendingLimit || overlapExists || !!leadTimeError || (isNegativeBalance && !note.trim())}
              className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400 rounded-xl shadow-xs transition-all cursor-pointer"
            >
              {submitting ? 'Submitting...' : 'Submit Request'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
