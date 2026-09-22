import {
    AlertTriangle,
    Check,
    Clock,
    FileText,
    RotateCcw,
    Users,
    X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import { LeaveRequest, User } from '../types';
import { formatFriendlyDate } from '../utils/dateUtils';
import { usePagination } from '../utils/usePagination';
import { useToast } from '../utils/useToast';
import { LoadingState } from './LoadingState';
import { PaginationControls } from './PaginationControls';
import { ToastBanner } from './ToastBanner';

interface ManagerDashboardProps {
  currentUser: User;
  onRequestUpdated: () => void;
  onOpenNewRequest: () => void;
}

export const ManagerDashboard: React.FC<ManagerDashboardProps> = ({
  currentUser,
  onRequestUpdated,
  onOpenNewRequest,
}) => {
  const [activeTab, setActiveTab] = useState<'pending' | 'cancellations' | 'team'>('pending');
  const [declineTargetId, setDeclineTargetId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState('');
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [allRequests, setAllRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([ApiService.getUsers(), ApiService.getRequests()]).then(([users, requests]) => {
      setAllUsers(users);
      setAllRequests(requests);
      setLoading(false);
    });
  }, []);

  // Scope: if SuperAdmin, can review all requests (Universal fallback approver). If Manager, reviews assigned employees (manager_ids includes currentUser.id)
  const isSuperAdmin = currentUser.role === 'SuperAdmin';

  // Assigned team members
  const managedUsers = allUsers.filter((u) => (isSuperAdmin ? u.id !== currentUser.id : u.manager_ids.includes(currentUser.id)));
  const managedUserIds = new Set(managedUsers.map((u) => u.id));

  // Pending requests for this manager
  const pendingRequests = allRequests.filter(
    (r) => r.status === 'Pending' && managedUserIds.has(r.user_id)
  );

  // Cancellation requested for this manager
  const cancellationRequests = allRequests.filter(
    (r) => r.status === 'CancellationRequested' && managedUserIds.has(r.user_id)
  );

  const teamRosterPagination = usePagination(managedUsers, 10);
  const { toast, showError, dismiss: dismissToast } = useToast();

  // Approve a pending leave request
  const handleApprove = async (req: LeaveRequest) => {
    try {
      await ApiService.reviewRequest(req.id, 'approve');
      onRequestUpdated();
      setAllRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'Approved' } : r));
    } catch (err: any) {
      showError(err.message ?? 'Failed to approve request');
    }
  };

  // Decline a pending leave request
  const handleConfirmDecline = async () => {
    if (!declineTargetId) return;
    try {
      await ApiService.reviewRequest(declineTargetId, 'decline', declineReason.trim() || undefined);
      setDeclineTargetId(null);
      setDeclineReason('');
      onRequestUpdated();
      setAllRequests((prev) => prev.map((r) => r.id === declineTargetId ? { ...r, status: 'Declined' } : r));
    } catch (err: any) {
      showError(err.message ?? 'Failed to decline request');
    }
  };

  // Approve a cancellation request (RESTORES BALANCE to employee!)
  const handleApproveCancellation = async (req: LeaveRequest) => {
    try {
      await ApiService.reviewRequest(req.id, 'approve_cancellation');
      onRequestUpdated();
      setAllRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'Cancelled' } : r));
    } catch (err: any) {
      showError(err.message ?? 'Failed to approve cancellation');
    }
  };

  // Reject a cancellation request (leaves it as Approved)
  const handleRejectCancellation = async (req: LeaveRequest) => {
    try {
      await ApiService.reviewRequest(req.id, 'reject_cancellation');
      onRequestUpdated();
      setAllRequests((prev) => prev.map((r) => r.id === req.id ? { ...r, status: 'Approved' } : r));
    } catch (err: any) {
      showError(err.message ?? 'Failed to reject cancellation');
    }
  };

  const handleViewAttachment = async (requestId: string) => {
    try {
      await ApiService.viewAttachment(requestId);
    } catch (err: any) {
      showError(err.message ?? 'Failed to open proof document');
    }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              {isSuperAdmin ? 'Universal Approvals & Management' : 'Manager Approvals'}
            </h1>
            <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold bg-zinc-100 text-zinc-700 border border-zinc-200/80">
              {isSuperAdmin ? 'SuperAdmin Fallback' : 'Team Lead'}
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            {isSuperAdmin
              ? "You can review and approve time-off requests for anyone at Momentum Marketing Group."
              : `Review requests and cancellations for your team (${managedUsers.length} members).`}
          </p>
        </div>

        {/* Manager can also request leave for themselves */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenNewRequest}
            className="px-3.5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            + Request My Leave
          </button>
        </div>
      </div>

      <ToastBanner toast={toast} onDismiss={dismissToast} />

      {loading ? (
        <LoadingState label="Loading approvals…" />
      ) : (
        <>
      {/* Tabs for Pending / Cancellations / Team */}
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('pending')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'pending'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Pending Approvals</span>
          {pendingRequests.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === 'pending' ? 'bg-amber-400 text-zinc-950' : 'bg-amber-100 text-amber-800'}`}>
              {pendingRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('cancellations')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'cancellations'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Cancellation Requests</span>
          {cancellationRequests.length > 0 && (
            <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${activeTab === 'cancellations' ? 'bg-purple-300 text-zinc-950' : 'bg-purple-100 text-purple-800'}`}>
              {cancellationRequests.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('team')}
          className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'team'
              ? 'bg-zinc-900 text-white shadow-xs'
              : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Team Roster ({managedUsers.length})</span>
        </button>
      </div>

      {/* TAB 1: PENDING APPROVALS */}
      {activeTab === 'pending' && (
        <div className="space-y-4">
          {pendingRequests.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-zinc-200/80">
              <Clock className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
              <h3 className="text-sm font-bold text-zinc-800">All caught up!</h3>
              <p className="text-xs text-zinc-500 mt-1">
                Nothing needs your attention right now.
              </p>
            </div>
          ) : (
            pendingRequests.map((req) => {
              const employee = allUsers.find((u) => u.id === req.user_id);
              if (!employee) return null;

              // Check if negative balance occurs
              const resultingBalance = +(employee.current_balance - req.days_count).toFixed(2);
              const isNegative = resultingBalance < 0;

              return (
                <div
                  key={req.id}
                  className={`bg-white rounded-2xl p-5 border shadow-xs transition-all ${
                    isNegative
                      ? 'border-rose-300 bg-rose-50/20 ring-1 ring-rose-200'
                      : 'border-zinc-200/80 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    
                    {/* Employee Info */}
                    <div className="flex items-start gap-3">
                      <img
                        src={employee.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(employee.full_name)}`}
                        alt={employee.full_name}
                        className="w-10 h-10 rounded-xl object-cover border border-zinc-200"
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-zinc-900">{employee.full_name}</h3>
                          <span className="text-[11px] text-zinc-500">{employee.position}</span>
                        </div>
                        <div className="text-xs text-zinc-400 font-mono mt-0.5">{employee.email}</div>
                        
                        {/* Balance pill */}
                        <div className="mt-2 flex items-center gap-2 text-xs">
                          <span className="text-zinc-500 text-[11px]">Available balance:</span>
                          <span className="font-bold text-zinc-900 px-2 py-0.5 bg-zinc-100 rounded text-xs border border-zinc-200/70">
                            {employee.current_balance} days
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Request Details */}
                    <div className="bg-zinc-50 p-3.5 rounded-xl border border-zinc-200/80 text-xs space-y-1.5 min-w-72">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-zinc-900 text-xs">{req.type}</span>
                        <span className="font-bold text-zinc-900 bg-white px-2 py-0.5 rounded border border-zinc-200 text-xs">
                          {req.days_count} {req.days_count === 1 ? 'day' : 'days'}
                        </span>
                      </div>
                      
                      <div className="text-zinc-600">
                        <span className="text-zinc-400">Duration: </span>
                        <strong className="text-zinc-800">
                          {formatFriendlyDate(req.start_date)} → {formatFriendlyDate(req.end_date)}
                        </strong>
                      </div>

                      <div className="text-zinc-600">
                        <span className="text-zinc-400">Return to Office: </span>
                        <strong className="text-zinc-800">{formatFriendlyDate(req.return_date)}</strong>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleApprove(req)}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve</span>
                      </button>

                      <button
                        onClick={() => setDeclineTargetId(req.id)}
                        className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Decline</span>
                      </button>
                    </div>

                  </div>

                  {/* NEGATIVE BALANCE WARNING SECTION */}
                  {isNegative && (
                    <div className="mt-4 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1">
                      <div className="flex items-center gap-1.5 text-rose-900 font-bold text-xs">
                        <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                        <span>Negative Balance Warning: Projected balance is {resultingBalance} days</span>
                      </div>
                      <p className="text-rose-700 text-[11px]">
                        Approving this will put their balance at {resultingBalance} days.
                      </p>
                      <div className="mt-2 bg-white p-2.5 rounded-lg border border-rose-200">
                        <div className="text-[10px] uppercase font-bold text-rose-800 mb-0.5">Employee Explanation:</div>
                        <div className="text-zinc-800 italic text-xs">"{req.note || 'No explanation provided'}"</div>
                      </div>
                    </div>
                  )}

                  {/* Standard Employee Note (if not negative) */}
                  {!isNegative && req.note && (
                    <div className="mt-3 text-xs bg-zinc-50 p-2.5 rounded-lg border border-zinc-200/60 text-zinc-700">
                      <span className="font-semibold text-zinc-900">Employee Note: </span>
                      <span>{req.note}</span>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 2: CANCELLATIONS AWAITING RE-APPROVAL */}
      {activeTab === 'cancellations' && (
        <div className="space-y-4">
          <div className="p-3.5 bg-purple-50 border border-purple-200/80 rounded-xl text-xs text-purple-900">
            <strong>Good to know:</strong> pending requests can be cancelled right away. Approved leaves need your re-approval to cancel and get the balance back.
          </div>

          {cancellationRequests.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-zinc-200/80">
              <RotateCcw className="w-8 h-8 mx-auto text-zinc-300 mb-2" />
              <h3 className="text-sm font-bold text-zinc-800">No cancellation requests</h3>
              <p className="text-xs text-zinc-500 mt-1">
                You're all caught up here too.
              </p>
            </div>
          ) : (
            cancellationRequests.map((req) => {
              const employee = allUsers.find((u) => u.id === req.user_id);
              if (!employee) return null;

              return (
                <div
                  key={req.id}
                  className="bg-white rounded-2xl p-5 border border-purple-200/80 shadow-xs space-y-3"
                >
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={employee.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(employee.full_name)}`}
                        alt={employee.full_name}
                        className="w-10 h-10 rounded-xl object-cover border border-zinc-200"
                      />
                      <div>
                        <div className="font-bold text-sm text-zinc-900">{employee.full_name}</div>
                        <div className="text-xs text-zinc-500">{employee.position}</div>
                        <div className="text-[11px] text-purple-700 font-semibold mt-0.5">
                          Restores +{req.days_count} days ({employee.current_balance}d → {employee.current_balance + req.days_count}d)
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-zinc-600 bg-zinc-50 p-2.5 rounded-xl border border-zinc-200">
                      <div>
                        <strong>Leave Type:</strong> {req.type} ({req.days_count} days)
                      </div>
                      <div>
                        <strong>Dates:</strong> {formatFriendlyDate(req.start_date)} → {formatFriendlyDate(req.end_date)}
                      </div>
                      {req.action_reason && (
                        <div className="text-purple-900 mt-1">
                          <strong>Reason:</strong> "{req.action_reason}"
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleApproveCancellation(req)}
                        className="px-3.5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Approve & Restore</span>
                      </button>

                      <button
                        onClick={() => handleRejectCancellation(req)}
                        className="px-3 py-2 rounded-xl border border-zinc-200 text-zinc-700 hover:bg-zinc-100 text-xs font-medium transition-colors cursor-pointer"
                      >
                        Keep Approved
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: DIRECT TEAM ROSTER */}
      {activeTab === 'team' && (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="p-5 border-b border-zinc-100">
            <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider">Team Allowance Roster</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Balances and pending requests for each team member.</p>
          </div>

          <div className="divide-y divide-zinc-100">
            {teamRosterPagination.pageItems.map((user) => {
              const userPendingCount = allRequests.filter(
                (r) => r.user_id === user.id && r.status === 'Pending'
              ).length;
              const userApprovedCount = allRequests.filter(
                (r) => r.user_id === user.id && r.status === 'Approved'
              ).length;
              const sickLeaveProofs = allRequests.filter(
                (r) => r.user_id === user.id && r.type === 'Sick Leave' && r.attachment
              );

              return (
                <div key={user.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-50/60 transition-colors text-xs">
                  <div className="flex items-center gap-3">
                    <img
                      src={user.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.full_name)}`}
                      alt={user.full_name}
                      className="w-9 h-9 rounded-lg object-cover shrink-0"
                    />
                    <div>
                      <div className="font-semibold text-zinc-900 text-sm flex items-center gap-2">
                        <span>{user.full_name}</span>
                        {!user.is_active && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded font-bold">
                            Deactivated
                          </span>
                        )}
                      </div>
                      <div className="text-zinc-500">{user.position} • {user.email}</div>
                      {sickLeaveProofs.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          {sickLeaveProofs.map((req) => (
                            <button
                              key={req.id}
                              onClick={() => handleViewAttachment(req.id)}
                              title={req.attachment?.filename}
                              className="px-2 py-0.5 rounded-md text-emerald-700 hover:bg-emerald-50 border border-emerald-200 text-[10px] font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                            >
                              <FileText className="w-3 h-3" />
                              <span>Proof: {formatFriendlyDate(req.start_date)}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 sm:gap-6 flex-wrap sm:flex-nowrap sm:text-right pl-12 sm:pl-0">
                    <div>
                      <span className="block text-zinc-400 text-[10px] uppercase font-semibold">Available</span>
                      <span className={`font-bold text-sm ${user.current_balance < 0 ? 'text-rose-600' : 'text-zinc-900'}`}>
                        {user.current_balance} days
                      </span>
                    </div>

                    <div>
                      <span className="block text-zinc-400 text-[10px] uppercase font-semibold">Pending</span>
                      <span className={`font-bold text-sm ${userPendingCount > 0 ? 'text-amber-600' : 'text-zinc-500'}`}>
                        {userPendingCount}
                      </span>
                    </div>

                    <div>
                      <span className="block text-zinc-400 text-[10px] uppercase font-semibold">Approved (All-Time)</span>
                      <span className="font-bold text-sm text-emerald-600">{userApprovedCount}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <PaginationControls
            page={teamRosterPagination.page}
            totalPages={teamRosterPagination.totalPages}
            onPageChange={teamRosterPagination.setPage}
            startIndex={teamRosterPagination.startIndex}
            endIndex={teamRosterPagination.endIndex}
            totalItems={teamRosterPagination.totalItems}
            itemLabel="team members"
          />
        </div>
      )}
        </>
      )}

      {/* Decline Reason Modal */}
      {declineTargetId && (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-xl border border-zinc-200">
            <h3 className="text-sm font-bold text-zinc-900">Decline Leave Request</h3>
            <p className="text-xs text-zinc-500 mt-1">
              Let them know why — they'll see this note on their request.
            </p>
            <textarea
              rows={3}
              value={declineReason}
              onChange={(e) => setDeclineReason(e.target.value)}
              placeholder="e.g. Critical project milestone scheduled during this period..."
              className="mt-3 w-full p-2.5 text-xs border border-zinc-300 rounded-lg outline-hidden focus:ring-2 focus:ring-zinc-900"
            />
            <div className="mt-4 flex items-center justify-end gap-2 text-xs font-semibold">
              <button
                onClick={() => setDeclineTargetId(null)}
                className="px-3 py-1.5 text-zinc-600 hover:bg-zinc-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDecline}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold cursor-pointer"
              >
                Confirm Decline
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
