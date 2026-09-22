import { AlertTriangle, ChevronDown, ChevronRight, UserX } from 'lucide-react';
import React, { useState } from 'react';
import { MigrationSheetReview, User } from '../types';

interface MigrationReviewTableProps {
  reviews: MigrationSheetReview[];
  existingUsers: User[];
  onChange: (index: number, patch: Partial<MigrationSheetReview>) => void;
}

const balanceSourceLabel: Record<MigrationSheetReview['balanceSource'], string> = {
  initial_solde: '"Initial solde" column',
  remaining: '"Remaining" column',
  none: 'not found in sheet',
};

export const MigrationReviewTable: React.FC<MigrationReviewTableProps> = ({ reviews, existingUsers, onChange }) => {
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggleExpanded = (i: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  return (
    <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-zinc-700">
          <thead className="bg-zinc-50/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-100">
            <tr>
              <th className="px-4 py-3 font-semibold">Sheet</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Details</th>
              <th className="px-4 py-3 font-semibold">Opening Balance</th>
              <th className="px-4 py-3 font-semibold">Left the company?</th>
              <th className="px-4 py-3 font-semibold">Leave History</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {reviews.map((r, i) => {
              const isExpanded = expanded.has(i);
              return (
                <React.Fragment key={r.sheetName}>
                  <tr className="hover:bg-zinc-50/60 transition-colors align-top">
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-zinc-900">{r.employeeName}</div>
                      {r.isEmpty && (
                        <span className="mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500 border border-zinc-200">
                          Empty sheet — nothing to import
                        </span>
                      )}
                      {r.action === 'map' && r.matchConfidence !== 'none' && (
                        <span className="mt-1 block text-[10px] text-emerald-600 font-medium">
                          Matched existing account by {r.matchConfidence === 'exact_name' ? 'name' : 'email'}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      <select
                        value={r.action}
                        onChange={(e) => onChange(i, { action: e.target.value as MigrationSheetReview['action'] })}
                        className="px-2 py-1 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-800 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                      >
                        <option value="create">Create new user</option>
                        <option value="map">Map to existing user</option>
                        <option value="skip">Skip</option>
                      </select>
                    </td>

                    <td className="px-4 py-3.5 min-w-56">
                      {r.action === 'map' && (
                        <select
                          value={r.mappedUserId ?? ''}
                          onChange={(e) => onChange(i, { mappedUserId: e.target.value || null })}
                          className="w-full px-2 py-1 bg-white border border-zinc-200 rounded-lg text-xs text-zinc-700 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                        >
                          <option value="">Select existing user…</option>
                          {existingUsers.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name} ({u.email})
                            </option>
                          ))}
                        </select>
                      )}

                      {r.action === 'create' && (
                        <div className="space-y-1.5">
                          <input
                            type="email"
                            value={r.newUserEmail}
                            onChange={(e) => onChange(i, { newUserEmail: e.target.value })}
                            placeholder="email@martechlabs.io"
                            className="w-full px-2 py-1 bg-white border border-zinc-200 rounded-lg text-xs font-mono text-zinc-700 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                          />
                          <input
                            type="text"
                            value={r.newUserPosition}
                            onChange={(e) => onChange(i, { newUserPosition: e.target.value })}
                            placeholder="Position"
                            className="w-full px-2 py-1 bg-white border border-zinc-200 rounded-lg text-[11px] text-zinc-600 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                          />
                        </div>
                      )}

                      {r.action === 'skip' && <span className="text-zinc-400 text-[11px]">Nothing will be written</span>}
                    </td>

                    <td className="px-4 py-3.5">
                      <input
                        type="number"
                        step="0.25"
                        value={r.openingBalance}
                        onChange={(e) => onChange(i, { openingBalance: Number(e.target.value) })}
                        disabled={r.action === 'skip'}
                        className="w-20 px-2 py-1 bg-white border border-zinc-200 rounded-lg text-xs font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden disabled:bg-zinc-100 disabled:text-zinc-400"
                      />
                      <div className="text-[10px] text-zinc-400 mt-1 max-w-32">
                        {r.balanceSource === 'none' ? (
                          <span className="inline-flex items-center gap-1 text-amber-600">
                            <AlertTriangle className="w-3 h-3 shrink-0" /> No balance found — verify
                          </span>
                        ) : (
                          <>from {balanceSourceLabel[r.balanceSource]}</>
                        )}
                      </div>
                    </td>

                    <td className="px-4 py-3.5">
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={r.isTerminated}
                          disabled={r.action === 'skip'}
                          onChange={(e) => onChange(i, { isTerminated: e.target.checked })}
                          className="rounded border-zinc-300"
                        />
                        <span className="flex items-center gap-1 text-[11px] font-medium text-zinc-700">
                          <UserX className="w-3 h-3 text-rose-500" /> Inactive
                        </span>
                      </label>
                      {r.isTerminated && (
                        <input
                          type="date"
                          value={r.terminationDate ?? ''}
                          onChange={(e) => onChange(i, { terminationDate: e.target.value || null })}
                          className="mt-1.5 w-full px-2 py-1 bg-white border border-zinc-200 rounded-lg text-[11px] text-zinc-700 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                        />
                      )}
                    </td>

                    <td className="px-4 py-3.5">
                      {r.leaveRows.length > 0 ? (
                        <button
                          onClick={() => toggleExpanded(i)}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-zinc-700 hover:text-zinc-900 cursor-pointer"
                        >
                          {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          {r.leaveRows.length} record{r.leaveRows.length === 1 ? '' : 's'}
                        </button>
                      ) : (
                        <span className="text-zinc-400 text-[11px]">None</span>
                      )}
                    </td>
                  </tr>

                  {isExpanded && r.leaveRows.length > 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-4 pt-0 bg-zinc-50/60">
                        <div className="rounded-xl border border-zinc-200 overflow-hidden">
                          <table className="w-full text-[11px]">
                            <thead className="bg-white text-zinc-400 uppercase tracking-wider">
                              <tr>
                                <th className="px-3 py-2 text-left font-semibold">Start</th>
                                <th className="px-3 py-2 text-left font-semibold">End</th>
                                <th className="px-3 py-2 text-left font-semibold">Return</th>
                                <th className="px-3 py-2 text-left font-semibold">Days</th>
                                <th className="px-3 py-2 text-left font-semibold">Type</th>
                                <th className="px-3 py-2 text-left font-semibold">Note</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-100 bg-white">
                              {r.leaveRows.map((lr, ri) => (
                                <tr key={ri}>
                                  <td className="px-3 py-1.5">{lr.start_date}</td>
                                  <td className="px-3 py-1.5">{lr.end_date}</td>
                                  <td className="px-3 py-1.5">{lr.return_date ?? '—'}</td>
                                  <td className="px-3 py-1.5">{lr.days_count}</td>
                                  <td className="px-3 py-1.5">{lr.type}</td>
                                  <td className="px-3 py-1.5 text-zinc-500 truncate max-w-xs">{lr.note || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
