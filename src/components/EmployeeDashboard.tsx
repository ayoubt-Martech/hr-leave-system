import {
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    Clock,
    FileText,
    Paperclip,
    Plus,
    RotateCcw,
    Sparkles,
    X,
    XCircle,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { ApiService } from '../services/api';
import { LeaveRequest, LeaveStatus, User } from '../types';
import { MAX_PENDING_REQUESTS } from '../utils/constants';
import { formatDate, formatFriendlyDate } from '../utils/dateUtils';
import { useConfirm } from '../utils/useConfirm';
import { usePagination } from '../utils/usePagination';
import { useToast } from '../utils/useToast';
import { ConfirmDialog } from './ConfirmDialog';
import { LoadingState } from './LoadingState';
import { PaginationControls } from './PaginationControls';
import { ToastBanner } from './ToastBanner';

interface EmployeeDashboardProps {
  currentUser: User;
  onOpenNewRequest: () => void;
  onRequestUpdated: () => void;
}

export const EmployeeDashboard: React.FC<EmployeeDashboardProps> = ({
  currentUser,
  onOpenNewRequest,
  onRequestUpdated,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    ApiService.getRequests().then((reqs) => {
      setAllRequests(reqs.filter((r) => r.user_id === currentUser.id));
      setLoading(false);
    });
  }, [currentUser.id]);

  const approvedRequests = allRequests.filter((r) => r.status === 'Approved');
  const pendingRequests = allRequests.filter((r) => r.status === 'Pending');
  const usedDays = approvedRequests.reduce((acc, r) => acc + r.days_count, 0);
  const pendingDays = pendingRequests.reduce((acc, r) => acc + r.days_count, 0);

  const todayStr = formatDate(new Date());
  const nextLeave = approvedRequests
    .filter((r) => r.start_date >= todayStr)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];

  const filteredRequests = allRequests.filter(
    (r) => filterStatus === 'All' || r.status === filterStatus
  );

  const requestsPagination = usePagination(filteredRequests, 10);
  useEffect(() => {
    requestsPagination.setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterStatus]);

  const { toast, showSuccess, showError, dismiss: dismissToast } = useToast();
  const { confirm, dialogProps: confirmDialogProps } = useConfirm();

  // Sick leave proof upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadTargetRef = useRef<string | null>(null);
  const [uploadingRequestId, setUploadingRequestId] = useState<string | null>(null);

  const triggerUpload = (requestId: string) => {
    uploadTargetRef.current = requestId;
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const requestId = uploadTargetRef.current;
    e.target.value = ''; // allow re-selecting the same file later
    if (!file || !requestId) return;

    setUploadingRequestId(requestId);
    try {
      const attachment = await ApiService.uploadAttachment(requestId, file);
      setAllRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, attachment } : r))
      );
      showSuccess('Proof document uploaded.');
    } catch (err: any) {
      showError(err.message ?? 'Failed to upload proof document');
    } finally {
      setUploadingRequestId(null);
    }
  };

  const handleViewAttachment = async (requestId: string) => {
    try {
      await ApiService.viewAttachment(requestId);
    } catch (err: any) {
      showError(err.message ?? 'Failed to open proof document');
    }
  };

  const handleCancelPending = async (requestId: string) => {
    const ok = await confirm({
      title: 'Cancel this request?',
      message: 'This pending leave request will be cancelled.',
      confirmLabel: 'Cancel Request',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await ApiService.cancelRequest(requestId);
      onRequestUpdated();
      setAllRequests((prev) =>
        prev.map((r) => (r.id === requestId ? { ...r, status: 'Cancelled' } : r))
      );
    } catch (err: any) {
      showError(err.message ?? 'Failed to cancel request');
    }
  };

  const [cancellingRequest, setCancellingRequest] = useState<LeaveRequest | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelSubmitting, setCancelSubmitting] = useState(false);

  const openCancelModal = (req: LeaveRequest) => {
    setCancellingRequest(req);
    setCancelReason('');
    setCancelError(null);
  };

  const handleConfirmCancellation = async () => {
    if (!cancellingRequest) return;
    if (!cancelReason.trim()) {
      setCancelError('Please provide a reason for this cancellation.');
      return;
    }
    setCancelSubmitting(true);
    setCancelError(null);
    try {
      await ApiService.cancelRequest(cancellingRequest.id, cancelReason.trim());
      onRequestUpdated();
      setAllRequests((prev) =>
        prev.map((r) =>
          r.id === cancellingRequest.id ? { ...r, status: 'CancellationRequested' } : r
        )
      );
      setCancellingRequest(null);
    } catch (err: any) {
      setCancelError(err.message ?? 'Failed to request cancellation');
    } finally {
      setCancelSubmitting(false);
    }
  };

  const getStatusBadge = (status: LeaveStatus) => {
    switch (status) {
      case 'Approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80">
            <CheckCircle2 className="w-3 h-3" /> Approved
          </span>
        );
      case 'Pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200/80">
            <Clock className="w-3 h-3" /> In Review
          </span>
        );
      case 'Declined':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200/80">
            <XCircle className="w-3 h-3" /> Declined
          </span>
        );
      case 'CancellationRequested':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200/80">
            <RotateCcw className="w-3 h-3" /> Cancel Requested
          </span>
        );
      case 'Cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-zinc-100 text-zinc-600 border border-zinc-200/80">
            Cancelled
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">{currentUser.full_name}</h1>
            <span className="text-[11px] px-2 py-0.5 bg-zinc-100 text-zinc-600 font-medium rounded-md border border-zinc-200/80">
              {currentUser.position}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">Your leave balance and time-off, at a glance.</p>
        </div>
        <button
          onClick={onOpenNewRequest}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5 text-blue-400" />
          <span>Request Time Off</span>
        </button>
      </div>

      <ToastBanner toast={toast} onDismiss={dismissToast} />

      {loading ? (
        <LoadingState label="Loading your leave data…" />
      ) : (
        <>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-zinc-200/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Available Allowance</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200/60">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className={`text-3xl font-extrabold tracking-tight ${currentUser.current_balance < 0 ? 'text-rose-600' : 'text-zinc-900'}`}>
              {currentUser.current_balance}
            </span>
            <span className="text-xs text-zinc-500">working days</span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">Initial Balance: {currentUser.initial_balance}d</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-zinc-200/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Next Time Off</span>
            <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-200/60">
              <CalendarDays className="w-3.5 h-3.5" />
            </div>
          </div>
          {nextLeave ? (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-900">{nextLeave.days_count}</span>
                <span className="text-xs text-zinc-500">{nextLeave.days_count === 1 ? 'day' : 'days'}</span>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">
                Starts {formatFriendlyDate(nextLeave.start_date)} ({nextLeave.type})
              </div>
            </>
          ) : (
            <>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold tracking-tight text-zinc-300">—</span>
              </div>
              <div className="mt-2 text-[11px] text-zinc-500">No upcoming leave scheduled</div>
            </>
          )}
        </div>

        <div className="bg-white rounded-2xl p-5 border border-zinc-200/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Total Taken (All-Time)</span>
            <div className="w-7 h-7 rounded-lg bg-zinc-100 text-zinc-700 flex items-center justify-center border border-zinc-200/60">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-zinc-900">{usedDays}</span>
            <span className="text-xs text-zinc-500">days taken</span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">{approvedRequests.length} approved period(s)</div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-zinc-200/80">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Pending Review</span>
            <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center border border-amber-200/60">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold tracking-tight text-amber-600">{pendingDays}</span>
            <span className="text-xs text-zinc-500">days in queue</span>
          </div>
          <div className="mt-2 text-[11px] text-zinc-500">{pendingRequests.length} active (max {MAX_PENDING_REQUESTS})</div>
        </div>
      </div>

      {/* History Table */}
      <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="p-5 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">Leave History & Requests</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Every request you've submitted, and when you're due back.</p>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
            {['All', 'Pending', 'Approved', 'Declined', 'CancellationRequested', 'Cancelled'].map((st) => (
              <button
                key={st}
                onClick={() => setFilterStatus(st)}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  filterStatus === st ? 'bg-zinc-900 text-white font-semibold' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200/70'
                }`}
              >
                {st === 'CancellationRequested' ? 'Cancellation' : st}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-zinc-700">
            <thead className="bg-zinc-50/80 text-zinc-500 uppercase text-[10px] tracking-wider border-b border-zinc-100">
              <tr>
                <th className="px-5 py-3 font-semibold">Type</th>
                <th className="px-5 py-3 font-semibold">Period</th>
                <th className="px-5 py-3 font-semibold">Days</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Note</th>
                <th className="px-5 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredRequests.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-zinc-400">
                    <CalendarDays className="w-7 h-7 mx-auto text-zinc-300 mb-2" />
                    <p className="text-sm font-medium text-zinc-600">No leave requests found</p>
                    <p className="text-xs text-zinc-400 mt-0.5">Click "Request Time Off" above to submit a new leave application.</p>
                  </td>
                </tr>
              ) : (
                requestsPagination.pageItems.map((req) => (
                  <tr key={req.id} className="hover:bg-zinc-50/60 transition-colors">
                    <td className="px-5 py-4">
                      <div className="font-semibold text-zinc-900">{req.type}</div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                        {req.is_special && req.special_type && req.special_type !== 'None' && (
                          <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-200/80 px-1.5 py-0.2 rounded font-medium">{req.special_type}</span>
                        )}
                        {req.half_day_type !== 'None' && (
                          <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200/80 px-1.5 py-0.2 rounded font-medium">Half-Day ({req.half_day_type})</span>
                        )}
                        {req.is_short_authorization && (
                          <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200/80 px-1.5 py-0.2 rounded font-medium">2h Auth</span>
                        )}
                        {req.is_legacy_backfill && (
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200/80 px-1.5 py-0.2 rounded font-mono">Legacy</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-zinc-900">
                        {formatFriendlyDate(req.start_date)}
                        {req.start_date !== req.end_date && ` → ${formatFriendlyDate(req.end_date)}`}
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        Return to Office: <span className="font-semibold text-zinc-800">{formatFriendlyDate(req.return_date)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <span className="font-bold text-sm text-zinc-900">{req.days_count}</span>{' '}
                      <span className="text-zinc-500 text-[11px]">day(s)</span>
                    </td>
                    <td className="px-5 py-4">{getStatusBadge(req.status)}</td>
                    <td className="px-5 py-4 max-w-xs">
                      {req.note ? (
                        <span className="text-zinc-600 line-clamp-2">{req.note}</span>
                      ) : (
                        <span className="text-zinc-400 italic">—</span>
                      )}
                      {req.action_reason && (
                        <div className="mt-1 text-[10px] text-purple-700 bg-purple-50 p-1 rounded border border-purple-200">
                          {req.action_reason}
                        </div>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        {req.status === 'Pending' && (
                          <button
                            onClick={() => handleCancelPending(req.id)}
                            className="px-2.5 py-1 rounded-md text-rose-600 hover:bg-rose-50 border border-rose-200 text-xs font-medium transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                        )}
                        {req.status === 'Approved' && (
                          <button
                            onClick={() => openCancelModal(req)}
                            className="px-2.5 py-1 rounded-md text-zinc-700 hover:bg-zinc-100 border border-zinc-200 text-xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Cancel Leave</span>
                          </button>
                        )}
                        {req.status === 'CancellationRequested' && (
                          <span className="text-[11px] text-zinc-400 italic">Awaiting Manager</span>
                        )}
                        {(req.status === 'Declined' || req.status === 'Cancelled') && (
                          <span className="text-[11px] text-zinc-300">—</span>
                        )}
                        {req.status === 'Approved' && req.type === 'Sick Leave' && (
                          req.attachment ? (
                            <button
                              onClick={() => handleViewAttachment(req.id)}
                              className="px-2.5 py-1 rounded-md text-emerald-700 hover:bg-emerald-50 border border-emerald-200 text-xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                              title={req.attachment.filename}
                            >
                              <FileText className="w-3 h-3" />
                              <span>View Proof</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => triggerUpload(req.id)}
                              disabled={uploadingRequestId === req.id}
                              className="px-2.5 py-1 rounded-md text-blue-700 hover:bg-blue-50 border border-blue-200 text-xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Paperclip className="w-3 h-3" />
                              <span>{uploadingRequestId === req.id ? 'Uploading…' : 'Upload Proof'}</span>
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <PaginationControls
          page={requestsPagination.page}
          totalPages={requestsPagination.totalPages}
          onPageChange={requestsPagination.setPage}
          startIndex={requestsPagination.startIndex}
          endIndex={requestsPagination.endIndex}
          totalItems={requestsPagination.totalItems}
          itemLabel="requests"
        />
      </div>
        </>
      )}

      {/* Cancel Approved Leave Modal */}
      {cancellingRequest && (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-zinc-200 max-w-md w-full p-6">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900 tracking-tight">Cancel Approved Leave</h3>
              <button
                onClick={() => setCancellingRequest(null)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 rounded-lg hover:bg-zinc-100 transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 text-xs text-zinc-700">
              <div className="font-semibold text-zinc-900">{cancellingRequest.type}</div>
              <div className="mt-0.5">
                {formatFriendlyDate(cancellingRequest.start_date)}
                {cancellingRequest.start_date !== cancellingRequest.end_date &&
                  ` → ${formatFriendlyDate(cancellingRequest.end_date)}`}
                {' · '}
                {cancellingRequest.days_count} day(s)
              </div>
            </div>

            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900">
                This leave is already approved. Your manager must review and approve this
                cancellation before your balance is restored.
              </p>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-semibold text-zinc-700 mb-1">
                Reason for cancellation <span className="text-rose-600 font-bold">* (Required)</span>
              </label>
              <textarea
                rows={3}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Explain why you need to cancel this approved leave..."
                className={`w-full px-3 py-2 bg-white border rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden ${
                  cancelError ? 'border-rose-300 bg-rose-50/20' : 'border-zinc-200'
                }`}
              />
            </div>

            {cancelError && (
              <div className="mt-2 p-2.5 bg-rose-100 text-rose-800 text-xs rounded-xl font-medium">
                {cancelError}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setCancellingRequest(null)}
                className="px-4 py-2 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
              >
                Keep Leave
              </button>
              <button
                type="button"
                onClick={handleConfirmCancellation}
                disabled={cancelSubmitting}
                className="px-5 py-2 text-xs font-semibold text-white bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-300 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                {cancelSubmitting ? 'Submitting...' : 'Request Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialogProps && <ConfirmDialog {...confirmDialogProps} />}

      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/webp"
        onChange={handleFileSelected}
        className="hidden"
      />
    </div>
  );
};
