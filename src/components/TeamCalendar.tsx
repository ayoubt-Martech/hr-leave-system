import {
    ChevronLeft,
    ChevronRight,
    Filter,
    ShieldCheck
} from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import { ApiService } from '../services/api';
import { CalendarLeaveEntry, Holiday, User } from '../types';
import { formatDate, getMatchingHoliday, isWeekend } from '../utils/dateUtils';
import { LoadingState } from './LoadingState';

interface TeamCalendarProps {
  currentUser: User | null;
}

export const TeamCalendar: React.FC<TeamCalendarProps> = ({ currentUser }) => {
  // Current view month/year
  const [viewDate, setViewDate] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const [selectedUserFilter, setSelectedUserFilter] = useState<string>('All');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('All');
  const [users, setUsers] = useState<User[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [calendarEntries, setCalendarEntries] = useState<CalendarLeaveEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      ApiService.getUsers(),
      ApiService.getHolidays(),
      ApiService.getCalendarRequests(),
    ]).then(([u, h, r]) => {
      setUsers(u);
      setHolidays(h);
      setCalendarEntries(r);
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  // Month navigation
  const prevMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1));
  };
  const nextMonth = () => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1));
  };
  const setToday = () => {
    const now = new Date();
    setViewDate(new Date(now.getFullYear(), now.getMonth(), 1));
  };

  const currentYear = viewDate.getFullYear();
  const currentMonth = viewDate.getMonth();

  // Month label
  const monthTitle = viewDate.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  // Days in month
  const calendarGrid = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    const lastDayOfMonth = new Date(currentYear, currentMonth + 1, 0);

    // Monday as start of week: 0=Mon, 6=Sun
    let startDay = firstDayOfMonth.getDay() - 1;
    if (startDay === -1) startDay = 6;

    const totalDays = lastDayOfMonth.getDate();
    const daysArray = [];

    // Previous month padding
    const prevMonthLastDay = new Date(currentYear, currentMonth, 0).getDate();
    for (let i = startDay - 1; i >= 0; i--) {
      const d = new Date(currentYear, currentMonth - 1, prevMonthLastDay - i);
      daysArray.push({
        date: d,
        dateStr: formatDate(d),
        isCurrentMonth: false,
      });
    }

    // Current month days
    for (let i = 1; i <= totalDays; i++) {
      const d = new Date(currentYear, currentMonth, i);
      daysArray.push({
        date: d,
        dateStr: formatDate(d),
        isCurrentMonth: true,
      });
    }

    // Trailing days
    const remaining = 42 - daysArray.length;
    for (let i = 1; i <= remaining; i++) {
      const d = new Date(currentYear, currentMonth + 1, i);
      daysArray.push({
        date: d,
        dateStr: formatDate(d),
        isCurrentMonth: false,
      });
    }

    return daysArray;
  }, [currentYear, currentMonth]);

  // Filter requests
  const filteredRequests = useMemo(() => {
    return calendarEntries.filter((r) => {
      if (selectedUserFilter !== 'All' && r.user_id !== selectedUserFilter) return false;
      if (selectedTypeFilter !== 'All' && r.type !== selectedTypeFilter) return false;
      return true;
    });
  }, [calendarEntries, selectedUserFilter, selectedTypeFilter]);

  // Find requests active on a specific date
  const getRequestsForDate = (dateStr: string) => {
    return filteredRequests.filter((r) => {
      return dateStr >= r.start_date && dateStr <= r.end_date;
    });
  };

  const getLeaveColor = (type: string) => {
    switch (type) {
      case 'Sick Leave':
        return 'bg-rose-50 text-rose-700 border-rose-200/80';
      case 'Emergency':
        return 'bg-amber-50 text-amber-700 border-amber-200/80';
      case 'Authorization':
        return 'bg-purple-50 text-purple-700 border-purple-200/80';
      default:
        return 'bg-blue-50 text-blue-700 border-blue-200/80';
    }
  };

  const getStatusLabel = (status: string) => {
    if (status === 'Pending') return 'Pending';
    if (status === 'CancellationRequested') return 'Cancelling';
    return null;
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">Team Leave Calendar</h1>
            <span className="text-[11px] px-2 py-0.5 bg-emerald-50 text-emerald-700 font-semibold rounded-md border border-emerald-200/80">
              Approved + Pending
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            See who's off, who's already requested time off, and what holidays are coming up — check here before submitting to avoid overlap.
          </p>
        </div>

        {/* Confidentiality notice */}
        <div className="bg-zinc-50 px-3 py-2 rounded-xl border border-zinc-200/80 text-[11px] text-zinc-600 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Notes stay private — only whoever reviews your request can see them.</span>
        </div>
      </div>

      {loading ? (
        <LoadingState label="Loading team calendar…" />
      ) : (
        <>
      {/* Calendar Controls & Filters */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-[0_1px_2px_rgba(0,0,0,0.02)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        
        {/* Month Navigation */}
        <div className="flex items-center gap-2">
          <button
            onClick={prevMonth}
            className="p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors cursor-pointer"
            aria-label="Previous month"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="font-bold text-sm text-zinc-900 min-w-44 text-center tracking-tight">
            {monthTitle}
          </div>
          <button
            onClick={nextMonth}
            className="p-2 rounded-xl text-zinc-600 hover:bg-zinc-100 border border-zinc-200 transition-colors cursor-pointer"
            aria-label="Next month"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            onClick={setToday}
            className="px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 border border-zinc-200 rounded-xl transition-colors ml-1 cursor-pointer"
          >
            Current Month
          </button>
        </div>

        {/* Filter Dropdowns */}
        <div className="flex flex-wrap items-center gap-2.5 text-xs">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-zinc-400" />
            <span className="text-zinc-500 font-medium">Team Member:</span>
            <select
              value={selectedUserFilter}
              onChange={(e) => setSelectedUserFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-800 font-medium focus:ring-2 focus:ring-zinc-900 outline-hidden"
            >
              <option value="All">All Members</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-zinc-500 font-medium">Category:</span>
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="px-2.5 py-1.5 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-800 font-medium focus:ring-2 focus:ring-zinc-900 outline-hidden"
            >
              <option value="All">All Types</option>
              <option value="Vacation">Vacation</option>
              <option value="Emergency">Emergency</option>
              <option value="Sick Leave">Sick Leave</option>
              <option value="Authorization">Authorization</option>
            </select>
          </div>
        </div>

      </div>

      {/* Main Calendar Grid */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
        {/* Days of Week Header */}
        <div className="grid grid-cols-7 bg-zinc-50 border-b border-zinc-200 text-center text-xs font-semibold text-zinc-600 py-2.5">
          <div>Mon</div>
          <div>Tue</div>
          <div>Wed</div>
          <div>Thu</div>
          <div>Fri</div>
          <div className="text-zinc-400 font-normal">Sat</div>
          <div className="text-zinc-400 font-normal">Sun</div>
        </div>

        {/* Days Cells */}
        <div className="grid grid-cols-7 auto-rows-fr divide-x divide-y divide-zinc-100 text-xs">
          {calendarGrid.map((dayItem, idx) => {
            const date = dayItem.date;
            const isWknd = isWeekend(date);
            const holiday = getMatchingHoliday(date, holidays);
            const dayRequests = getRequestsForDate(dayItem.dateStr);

            return (
              <div
                key={idx}
                className={`min-h-28 p-2 flex flex-col transition-colors ${
                  !dayItem.isCurrentMonth
                    ? 'bg-zinc-50/40 text-zinc-300'
                    : isWknd
                    ? 'bg-zinc-50/70 text-zinc-400'
                    : 'bg-white text-zinc-800'
                }`}
              >
                {/* Date number & Holiday Indicator */}
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`font-semibold text-[11px] px-1.5 py-0.5 rounded ${
                      dayItem.isCurrentMonth ? (isWknd ? 'text-zinc-400' : 'text-zinc-700') : 'text-zinc-300'
                    }`}
                  >
                    {date.getDate()}
                  </span>

                  {holiday && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-900 border border-amber-200 truncate max-w-28" title={holiday.name}>
                      🇹🇳 {holiday.name}
                    </span>
                  )}
                </div>

                {/* Holiday Full Banner if current month */}
                {holiday && dayItem.isCurrentMonth && (
                  <div className="mb-1 text-[10px] bg-amber-50/90 text-amber-800 p-1 rounded font-semibold border border-amber-200/80 leading-tight">
                    {holiday.name}
                  </div>
                )}

                {/* Leaves Stack */}
                <div className="flex-1 space-y-1 overflow-y-auto max-h-24">
                  {dayRequests.map((req) => {
                    const emp = users.find((u) => u.id === req.user_id);
                    const name = emp ? emp.full_name : 'Staff';
                    const statusLabel = getStatusLabel(req.status);
                    const isPending = req.status === 'Pending';

                    return (
                      <div
                        key={req.id}
                        className={`p-1.5 rounded-lg text-[10px] font-medium border leading-tight ${getLeaveColor(
                          req.type
                        )} ${isPending ? 'border-dashed opacity-70' : ''}`}
                        title={`${name} • ${req.type} (${req.days_count} days)${statusLabel ? ` — ${statusLabel}` : ''}`}
                      >
                        <div className="font-semibold truncate">{name}</div>
                        <div className="text-[9px] opacity-75 truncate">
                          {req.type} {req.half_day_type !== 'None' ? `(${req.half_day_type})` : ''}
                          {statusLabel ? ` · ${statusLabel}` : ''}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Calendar Legend */}
      <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 text-xs flex flex-wrap items-center justify-between gap-4 text-zinc-600 shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
        <div className="flex flex-wrap items-center gap-4">
          <span className="font-semibold text-zinc-900">Legend:</span>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
            <span>Vacation</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span>Emergency</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span>Sick Leave</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
            <span>Authorization</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400"></span>
            <span>Tunisian National Holiday</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border-2 border-dashed border-zinc-400"></span>
            <span>Dashed = Pending (not yet approved)</span>
          </div>
        </div>

        <div className="text-zinc-400 text-[11px]">
          Saturdays and Sundays are non-working days.
        </div>
      </div>
        </>
      )}

    </div>
  );
};
