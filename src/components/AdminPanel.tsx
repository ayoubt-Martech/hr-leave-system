import {
    AlertTriangle,
    Calendar,
    Check,
    Edit2,
    Plus,
    RotateCcw,
    Save,
    Settings as SettingsIcon,
    Shield,
    Sparkles,
    Trash2,
    UserCheck,
    Users,
    X
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ApiService } from '../services/api';
import { Holiday, User, UserRole } from '../types';
import { useConfirm } from '../utils/useConfirm';
import { usePagination } from '../utils/usePagination';
import { useToast } from '../utils/useToast';
import { AssignManagersModal } from './AssignManagersModal';
import { ConfirmDialog } from './ConfirmDialog';
import { LoadingState } from './LoadingState';
import { PaginationControls } from './PaginationControls';
import { ToastBanner } from './ToastBanner';

interface AdminPanelProps {
  currentUser: User;
  onRefresh: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'former' | 'holidays' | 'settings' | 'accrual'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([ApiService.getUsers(), ApiService.getHolidays()]).then(([u, h]) => {
      setUsers(u);
      setHolidays(h);
      setLoading(false);
    });
    ApiService.getSettingValue<number>('max_carry_over_days', 0).then(setMaxCarryOver);
    ApiService.getSettingValue<number>('monthly_accrual_rate', 1.5).then(setAccrualRate);
  }, []);

  const activeEmployees = users.filter((u) => u.is_active);
  const formerEmployees = users.filter((u) => !u.is_active);
  const managers = activeEmployees.filter((u) => u.role === 'Manager' || u.role === 'SuperAdmin');

  const employeesPagination = usePagination(activeEmployees, 10);
  const formerEmployeesPagination = usePagination(formerEmployees, 10);

  // User form states
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newFullName, setNewFullName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPosition, setNewPosition] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('Employee');
  const [newManagerIds, setNewManagerIds] = useState<string[]>([]);
  const [newInitialBalance, setNewInitialBalance] = useState<number>(18);
  const [userFormError, setUserFormError] = useState<string | null>(null);

  // Edit balance modal/state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editBalanceVal, setEditBalanceVal] = useState<number>(0);

  // Assign managers modal state
  const [assigningManagersFor, setAssigningManagersFor] = useState<User | null>(null);

  // Holiday form states
  const [showAddHolidayModal, setShowAddHolidayModal] = useState(false);
  const [newHolidayName, setNewHolidayName] = useState('');
  const [newHolidayDate, setNewHolidayDate] = useState('2026-01-01');
  const [newHolidayRecurring, setNewHolidayRecurring] = useState(true);
  const [newHolidayCategory, setNewHolidayCategory] = useState<'National' | 'Religious'>('National');

  const [maxCarryOver, setMaxCarryOver] = useState<number>(0);
  const [accrualRate, setAccrualRate] = useState<number>(1.5);
  const [settingsSaved, setSettingsSaved] = useState(false);

  // Action report notifications & confirmations
  const { toast, showSuccess, showError, dismiss: dismissToast } = useToast();
  const { confirm, dialogProps: confirmDialogProps } = useConfirm();

  // Add user
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);
    const cleanEmail = newEmail.toLowerCase().trim();
    if (!cleanEmail.includes('@')) { setUserFormError('Please enter a valid email address'); return; }
    try {
      const newUser = await ApiService.addUser({
        full_name: newFullName.trim(),
        email: cleanEmail,
        position: newPosition.trim() || 'Team Member',
        role: newRole,
        manager_ids: newManagerIds,
        initial_balance: Number(newInitialBalance) || 0,
        current_balance: Number(newInitialBalance) || 0,
        is_active: true,
        created_at: new Date().toISOString(),
      });
      setUsers((prev) => [...prev, newUser]);
      setShowAddUserModal(false);
      setNewFullName(''); setNewEmail(''); setNewPosition(''); setNewRole('Employee'); setNewManagerIds([]); setNewInitialBalance(18);
      onRefresh();
      showSuccess(`"${newUser.full_name}" was added successfully.`);
    } catch (err: any) {
      setUserFormError(err.message ?? 'Failed to create user');
    }
  };

  const handleToggleActive = async (user: User) => {
    if (user.id === currentUser.id) { showError('You cannot deactivate your own SuperAdmin account.'); return; }
    try {
      const updated = await ApiService.updateUser({ ...user, is_active: !user.is_active });
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      onRefresh();
    } catch (err: any) { showError(err.message ?? 'Failed to update status'); }
  };

  const handleChangeRole = async (user: User, newRole: UserRole) => {
    try {
      const updated = await ApiService.updateUser({ ...user, role: newRole });
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      onRefresh();
    } catch (err: any) { showError(err.message ?? 'Failed to update role'); }
  };

  const handleAssignManagers = async (user: User, managerIds: string[]) => {
    try {
      const updated = await ApiService.updateUser({ ...user, manager_ids: managerIds });
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      setAssigningManagersFor(null);
      onRefresh();
    } catch (err: any) { showError(err.message ?? 'Failed to update managers'); }
  };

  const handleSaveBalance = async (user: User) => {
    try {
      const updated = await ApiService.updateUser({ ...user, current_balance: Number(editBalanceVal) });
      setUsers((prev) => prev.map((u) => u.id === updated.id ? updated : u));
      setEditingUserId(null);
      onRefresh();
    } catch (err: any) { showError(err.message ?? 'Failed to update balance'); }
  };

  // Remove-employee modal (soft delete — keeps all their historical records)
  const [removingUser, setRemovingUser] = useState<User | null>(null);
  const [removeDate, setRemoveDate] = useState('');
  const [removeReason, setRemoveReason] = useState('');
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removeSubmitting, setRemoveSubmitting] = useState(false);

  const openRemoveModal = (user: User) => {
    if (user.id === currentUser.id) { showError('You cannot remove your own SuperAdmin account.'); return; }
    setRemovingUser(user);
    setRemoveDate(new Date().toISOString().slice(0, 10));
    setRemoveReason('');
    setRemoveError(null);
  };

  const handleConfirmRemove = async () => {
    if (!removingUser) return;
    setRemoveSubmitting(true);
    setRemoveError(null);
    try {
      const updated = await ApiService.deleteUser(removingUser.id, {
        termination_date: removeDate,
        reason: removeReason.trim() || undefined,
      });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      setRemovingUser(null);
      onRefresh();
      showSuccess(`"${updated.full_name}" was removed. All their records were kept — find them under Former Employees.`);
    } catch (err: any) {
      setRemoveError(err.message ?? 'Failed to remove user');
    } finally {
      setRemoveSubmitting(false);
    }
  };

  const handleReactivateUser = async (user: User) => {
    try {
      const updated = await ApiService.updateUser({ ...user, is_active: true, termination_date: null });
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      onRefresh();
      showSuccess(`"${updated.full_name}" was reactivated.`);
    } catch (err: any) {
      showError(err.message ?? 'Failed to reactivate user');
    }
  };

  const handleAddHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newHolidayName.trim()) return;
    try {
      const created = await ApiService.addHoliday({ name: newHolidayName.trim(), date: newHolidayDate, is_recurring: newHolidayRecurring, category: newHolidayCategory });
      setHolidays((prev) => [...prev, created].sort((a, b) => a.date.localeCompare(b.date)));
      setShowAddHolidayModal(false);
      setNewHolidayName('');
      onRefresh();
      showSuccess(`Holiday "${created.name}" added to holiday schedule.`);
    } catch (err: any) { showError(err.message ?? 'Failed to add holiday'); }
  };

  const handleDeleteHoliday = async (id: string, name: string) => {
    const ok = await confirm({
      title: 'Delete this holiday?',
      message: `"${name}" will be removed from the holiday schedule.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await ApiService.deleteHoliday(id);
      setHolidays((prev) => prev.filter((h) => h.id !== id));
      onRefresh();
    } catch (err: any) { showError(err.message ?? 'Failed to delete holiday'); }
  };

  const handleSaveSettings = async () => {
    try {
      await ApiService.setSettingValue('max_carry_over_days', Number(maxCarryOver));
      await ApiService.setSettingValue('monthly_accrual_rate', Number(accrualRate));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 3000);
      onRefresh();
    } catch (err: any) { showError(err.message ?? 'Failed to save settings'); }
  };

  const handleRunAccrual = async () => {
    try {
      const res = await ApiService.triggerMonthlyAccrual();
      onRefresh();
      showSuccess(res.message);
    } catch (err: any) { showError(err.message ?? 'Failed to run accrual'); }
  };

  const handleRunCarryOver = async () => {
    const ok = await confirm({
      title: 'Run year-end carry-over?',
      message: maxCarryOver === 0
        ? 'Carry-over is set to unlimited — running this now will not change any balances, but it will mark the year-end job as done.'
        : `Balances above ${maxCarryOver} days will be reduced to ${maxCarryOver} days. This runs for real, immediately.`,
      confirmLabel: maxCarryOver === 0 ? 'Run Anyway' : 'Run Truncation',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await ApiService.triggerYearEndCarryOver();
      onRefresh();
      showSuccess(res.message);
    } catch (err: any) { showError(err.message ?? 'Failed to run carry-over'); }
  };

  return (
    <div className="space-y-6">
      
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">System Administration</h1>
            <span className="text-[11px] px-2.5 py-0.5 bg-purple-50 text-purple-700 font-semibold rounded-md border border-purple-200/80 flex items-center gap-1">
              <Shield className="w-3 h-3" /> SuperAdmin
            </span>
          </div>
          <p className="text-xs text-zinc-500 mt-1">
            Manage employees, holidays, and company-wide leave policies.
          </p>
        </div>
      </div>

      {/* Action Notification Banner */}
      <ToastBanner toast={toast} onDismiss={dismissToast} />

      {loading ? (
        <LoadingState label="Loading administration data…" />
      ) : (
        <>
      {/* Navigation Tabs */}
      <div className="flex items-center gap-1.5 border-b border-zinc-200/80 pb-2 overflow-x-auto text-xs font-semibold">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'users' ? 'bg-zinc-900 text-white shadow-xs font-semibold' : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span>Employees ({activeEmployees.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('former')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'former' ? 'bg-zinc-900 text-white shadow-xs font-semibold' : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          <UserCheck className="w-3.5 h-3.5" />
          <span>Former Employees ({formerEmployees.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('holidays')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'holidays' ? 'bg-zinc-900 text-white shadow-xs font-semibold' : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          <span>Tunisian Holidays ({holidays.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'settings' ? 'bg-zinc-900 text-white shadow-xs font-semibold' : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          <span>Policies & Carry-Over</span>
        </button>

        <button
          onClick={() => setActiveTab('accrual')}
          className={`px-3.5 py-2 rounded-xl transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
            activeTab === 'accrual' ? 'bg-zinc-900 text-white shadow-xs font-semibold' : 'text-zinc-600 hover:bg-zinc-100'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Accrual Engine</span>
        </button>
      </div>

      {/* TAB 1: USERS & ROLES */}
      {activeTab === 'users' && (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Employee Directory</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                Only employees listed here can sign in with a company Google account.
              </p>
            </div>
            <button
              onClick={() => setShowAddUserModal(true)}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add User</span>
            </button>
          </div>

          <p className="px-5 pt-2 text-[10px] text-zinc-400 sm:hidden">Swipe left for balance, status & actions →</p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-700">
              <thead className="bg-zinc-50/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-100">
                <tr>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Assigned Manager</th>
                  <th className="px-5 py-3 font-semibold">Balance</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {employeesPagination.pageItems.map((u) => {
                  const assignedManagers = users.filter((m) => u.manager_ids.includes(m.id));
                  const isEditingThis = editingUserId === u.id;

                  return (
                    <tr key={u.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-zinc-900">{u.full_name}</div>
                        <div className="text-zinc-400 font-mono text-[11px]">{u.email}</div>
                        <div className="text-zinc-400 text-[10px]">{u.position}</div>
                      </td>

                      <td className="px-5 py-3.5">
                        <select
                          value={u.role}
                          onChange={(e) => handleChangeRole(u, e.target.value as UserRole)}
                          className="px-2 py-1 bg-white border border-zinc-200 rounded-lg text-xs font-semibold text-zinc-800 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                        >
                          <option value="Employee">Employee</option>
                          <option value="Manager">Manager</option>
                          <option value="SuperAdmin">SuperAdmin</option>
                        </select>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5 max-w-44">
                          <span className="text-zinc-700 truncate">
                            {assignedManagers.length > 0
                              ? assignedManagers.map((m) => m.full_name).join(', ')
                              : <span className="text-zinc-400">None / SuperAdmin</span>}
                          </span>
                          <button
                            onClick={() => setAssigningManagersFor(u)}
                            className="text-zinc-400 hover:text-zinc-900 cursor-pointer shrink-0"
                            title="Edit assigned managers"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        {isEditingThis ? (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.25"
                              value={editBalanceVal}
                              onChange={(e) => setEditBalanceVal(Number(e.target.value))}
                              className="w-16 px-1.5 py-0.5 border border-indigo-400 rounded text-xs font-bold"
                            />
                            <button
                              onClick={() => handleSaveBalance(u)}
                              className="p-1 text-emerald-600 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingUserId(null)}
                              className="p-1 text-slate-400 hover:bg-slate-100 rounded"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900">{u.current_balance}d</span>
                            <button
                              onClick={() => {
                                setEditingUserId(u.id);
                                setEditBalanceVal(u.current_balance);
                              }}
                              className="text-zinc-400 hover:text-zinc-900 cursor-pointer"
                              title="Manually adjust balance"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                        <span className="text-[10px] text-zinc-400 block">Initial: {u.initial_balance}d</span>
                      </td>

                      <td className="px-5 py-3.5">
                        <button
                          onClick={() => handleToggleActive(u)}
                          className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border transition-all cursor-pointer ${
                            u.is_active
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200/80'
                              : 'bg-rose-50 text-rose-700 border-rose-200/80 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200/80'
                          }`}
                          title="Click to toggle Active status"
                        >
                          {u.is_active ? 'Active' : 'Deactivated'}
                        </button>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        {u.id !== currentUser.id && (
                          <button
                            onClick={() => openRemoveModal(u)}
                            className="p-1.5 text-zinc-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                            title="Remove employee"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={employeesPagination.page}
            totalPages={employeesPagination.totalPages}
            onPageChange={employeesPagination.setPage}
            startIndex={employeesPagination.startIndex}
            endIndex={employeesPagination.endIndex}
            totalItems={employeesPagination.totalItems}
            itemLabel="employees"
          />
        </div>
      )}

      {/* TAB: FORMER EMPLOYEES */}
      {activeTab === 'former' && (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="p-5 border-b border-zinc-100">
            <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Former Employees</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              People who've left the company — their full leave history stays intact.
            </p>
          </div>

          <p className="px-5 pt-2 text-[10px] text-zinc-400 sm:hidden">Swipe left for balance & actions →</p>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-zinc-700">
              <thead className="bg-zinc-50/80 text-zinc-400 uppercase text-[10px] tracking-wider border-b border-zinc-100">
                <tr>
                  <th className="px-5 py-3 font-semibold">User</th>
                  <th className="px-5 py-3 font-semibold">Role</th>
                  <th className="px-5 py-3 font-semibold">Left On</th>
                  <th className="px-5 py-3 font-semibold">Final Balance</th>
                  <th className="px-5 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {formerEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-zinc-400">
                      No former employees — everyone in the directory is currently active.
                    </td>
                  </tr>
                ) : (
                  formerEmployeesPagination.pageItems.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-50/60 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-semibold text-zinc-900">{u.full_name}</div>
                        <div className="text-zinc-400 font-mono text-[11px]">{u.email}</div>
                        <div className="text-zinc-400 text-[10px]">{u.position}</div>
                      </td>
                      <td className="px-5 py-3.5 text-zinc-600">{u.role}</td>
                      <td className="px-5 py-3.5 text-zinc-600">{u.termination_date ?? '—'}</td>
                      <td className="px-5 py-3.5">
                        <span className={`font-bold ${u.current_balance < 0 ? 'text-rose-600' : 'text-zinc-900'}`}>
                          {u.current_balance}d
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleReactivateUser(u)}
                          className="px-2.5 py-1 rounded-md text-emerald-700 hover:bg-emerald-50 border border-emerald-200 text-xs font-medium transition-colors inline-flex items-center gap-1 cursor-pointer"
                        >
                          <UserCheck className="w-3.5 h-3.5" />
                          <span>Reactivate</span>
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <PaginationControls
            page={formerEmployeesPagination.page}
            totalPages={formerEmployeesPagination.totalPages}
            onPageChange={formerEmployeesPagination.setPage}
            startIndex={formerEmployeesPagination.startIndex}
            endIndex={formerEmployeesPagination.endIndex}
            totalItems={formerEmployeesPagination.totalItems}
            itemLabel="former employees"
          />
        </div>
      )}

      {/* TAB 2: TUNISIAN HOLIDAYS */}
      {activeTab === 'holidays' && (
        <div className="bg-white rounded-2xl border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
          <div className="p-5 border-b border-zinc-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-zinc-900 tracking-tight">🇹🇳 Official Tunisian Holidays</h2>
              <p className="text-xs text-zinc-500 mt-0.5">
                These dates are automatically skipped when counting leave days.
              </p>
            </div>
            <button
              onClick={() => setShowAddHolidayModal(true)}
              className="px-3.5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Holiday</span>
            </button>
          </div>

          <div className="divide-y divide-zinc-100">
            {holidays.map((hol) => (
              <div key={hol.id} className="p-4 flex items-center justify-between hover:bg-zinc-50/60 transition-colors text-xs">
                <div>
                  <div className="font-semibold text-zinc-900 text-sm flex items-center gap-2">
                    <span>{hol.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 font-medium">
                      {hol.category || 'National'}
                    </span>
                    {hol.is_recurring && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                        Annual Recurring
                      </span>
                    )}
                  </div>
                  <div className="text-zinc-400 mt-0.5 font-mono">{hol.date}</div>
                </div>

                <button
                  onClick={() => handleDeleteHoliday(hol.id, hol.name)}
                  className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                  title="Delete holiday"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB 3: SETTINGS & CARRY OVER */}
      {activeTab === 'settings' && (
        <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6">
          <div>
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">Leave Policies & Year-End Rules</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              These apply to every employee, company-wide.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-1">
            
            {/* Carry-over limit */}
            <div className="p-5 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-2">
              <div className="text-xs font-semibold text-zinc-900">
                Year-End Carry-Over Limit (Jan 1st Truncation)
              </div>
              <p className="text-xs text-zinc-500">
                Maximum accumulated leave days an employee can carry over to the new calendar year. Set to <strong>0 for unlimited</strong> — every day carries over, nothing is truncated. Default: 0 (unlimited).
              </p>
              <div className="pt-2 flex items-center gap-3">
                <input
                  type="number"
                  min="0"
                  max="30"
                  value={maxCarryOver}
                  onChange={(e) => setMaxCarryOver(Number(e.target.value))}
                  className="w-24 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                />
                <span className="text-xs text-zinc-600 font-semibold">days max carried over</span>
              </div>
              {maxCarryOver === 0 ? (
                <div className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200/80 inline-block">
                  ∞ Unlimited — all balances carry over as-is
                </div>
              ) : (
                <div className="text-xs font-semibold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200/80 inline-block">
                  Balances above {maxCarryOver}d will be truncated down to {maxCarryOver}d on Jan 1st
                </div>
              )}
            </div>

            {/* Monthly Accrual rate */}
            <div className="p-5 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-2">
              <div className="text-xs font-semibold text-zinc-900">
                Monthly Accrual Engine Rate
              </div>
              <p className="text-xs text-zinc-500">
                Days automatically earned each month by full-time active employees. Default: 1.5 days/month (18 days/year).
              </p>
              <div className="pt-2 flex items-center gap-3">
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  max="5"
                  value={accrualRate}
                  onChange={(e) => setAccrualRate(Number(e.target.value))}
                  className="w-24 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                />
                <span className="text-xs text-zinc-600 font-semibold">days / month</span>
              </div>
            </div>

            {/* Workweek Schedule */}
            <div className="p-5 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-2">
              <div className="text-xs font-semibold text-zinc-900">
                Standard Workweek Schedule
              </div>
              <p className="text-xs text-zinc-500">
                5 days/week (Monday – Friday, 8 hours/day). Saturdays and Sundays are non-working days.
              </p>
              <div className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-lg border border-zinc-200 inline-block">
                Fixed — not configurable here
              </div>
            </div>

            {/* Partial days */}
            <div className="p-5 bg-zinc-50 rounded-xl border border-zinc-200/80 space-y-2">
              <div className="text-xs font-semibold text-zinc-900">
                Partial Days & Authorization
              </div>
              <p className="text-xs text-zinc-500">
                Supports full days, half-days (0.5 day with AM/PM selector), and short authorization (0.25 day / 2 hours).
              </p>
              <div className="text-xs font-semibold text-zinc-500 bg-zinc-100 px-2.5 py-1 rounded-lg border border-zinc-200 inline-block">
                Fixed — not configurable here
              </div>
            </div>

          </div>

          <div className="pt-4 border-t border-zinc-100 flex items-center justify-between">
            <span className="text-xs text-zinc-400">Changes apply immediately to all date and balance computations.</span>
            <button
              onClick={handleSaveSettings}
              className="px-5 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-2 cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{settingsSaved ? 'Saved' : 'Save Policies'}</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 4: ACCRUAL ENGINE & TESTING */}
      {activeTab === 'accrual' && (
        <div className="bg-white rounded-2xl p-6 border border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.02)] space-y-6">
          <div>
            <h2 className="text-base font-bold text-zinc-900 tracking-tight">Manual Accrual Controls</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              Run the same routines your server runs automatically on schedule — but right now. These make real, immediate changes to live employee balances.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            
            {/* Monthly Accrual Trigger */}
            <div className="p-5 bg-zinc-50 rounded-2xl border border-zinc-200/80 space-y-3">
              <div className="flex items-center gap-2 text-zinc-900 font-semibold text-sm">
                <Sparkles className="w-4 h-4 text-zinc-700" />
                <span>Execute Monthly Accrual</span>
              </div>
              <p className="text-xs text-zinc-500">
                Runs the real monthly accrual routine right now, instead of waiting for the scheduled job. Credits +{accrualRate} days to every active employee's balance immediately.
              </p>
              <button
                onClick={handleRunAccrual}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                Trigger Monthly Accrual (+{accrualRate}d)
              </button>
            </div>

            {/* Carry-Over Truncation Trigger */}
            <div className="p-5 bg-zinc-50 rounded-2xl border border-zinc-200/80 space-y-3">
              <div className="flex items-center gap-2 text-zinc-900 font-semibold text-sm">
                <RotateCcw className="w-4 h-4 text-zinc-700" />
                <span>Execute Year-End Carry-Over</span>
              </div>
              <p className="text-xs text-zinc-500">
                {maxCarryOver === 0
                  ? 'Runs the real Jan 1st year-end job right now. Carry-over is set to unlimited, so no balances will change.'
                  : `Runs the real Jan 1st year-end rule right now: truncates any employee balance exceeding ${maxCarryOver} days down to the limit of ${maxCarryOver} days.`}
              </p>
              <button
                onClick={handleRunCarryOver}
                className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              >
                {maxCarryOver === 0 ? 'Run Carry-Over (Unlimited — no changes)' : `Run Carry-Over Truncation (Max ${maxCarryOver}d)`}
              </button>
            </div>

          </div>

          {/* Reset Demo Data Button — removed in production build */}
          <div className="pt-6 border-t border-zinc-100 flex items-center justify-between">
            <div className="text-xs text-zinc-400">
              Accrual and carry-over jobs also run automatically via the server cron scheduler.
            </div>
          </div>

        </div>
      )}
        </>
      )}

      {/* Add User Modal */}
      {showAddUserModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-zinc-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900 tracking-tight">Add Employee</h3>
              <button onClick={() => setShowAddUserModal(false)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kais Ben Amor"
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Company Email (Google Login)</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. kais.b@martechlabs.io"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs font-mono text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Job Position</label>
                <input
                  type="text"
                  placeholder="e.g. DevOps Engineer"
                  value={newPosition}
                  onChange={(e) => setNewPosition(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Role</label>
                  <select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                  >
                    <option value="Employee">Employee</option>
                    <option value="Manager">Manager</option>
                    <option value="SuperAdmin">SuperAdmin</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Initial Balance</label>
                  <input
                    type="number"
                    step="0.5"
                    value={newInitialBalance}
                    onChange={(e) => setNewInitialBalance(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs font-bold text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Assigned Managers</label>
                {managers.length === 0 ? (
                  <p className="text-[11px] text-zinc-400">
                    No managers yet — this employee will report directly to a SuperAdmin.
                  </p>
                ) : (
                  <div className="max-h-36 overflow-y-auto border border-zinc-200 rounded-xl divide-y divide-zinc-100">
                    {managers.map((m) => (
                      <label
                        key={m.id}
                        className="flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={newManagerIds.includes(m.id)}
                          onChange={() =>
                            setNewManagerIds((prev) =>
                              prev.includes(m.id) ? prev.filter((id) => id !== m.id) : [...prev, m.id]
                            )
                          }
                          className="rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                        />
                        <span className="font-semibold text-zinc-900">{m.full_name}</span>
                        <span className="text-zinc-400">({m.position})</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {userFormError && (
                <div className="p-2 bg-rose-50 text-rose-700 rounded-xl font-medium">{userFormError}</div>
              )}

              <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="px-3.5 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl cursor-pointer"
                >
                  Add Employee
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Holiday Modal */}
      {showAddHolidayModal && (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-zinc-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900 tracking-tight">Add Holiday</h3>
              <button onClick={() => setShowAddHolidayModal(false)} className="text-zinc-400 hover:text-zinc-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddHoliday} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Holiday Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Evacuation Day"
                  value={newHolidayName}
                  onChange={(e) => setNewHolidayName(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Date</label>
                <input
                  type="date"
                  required
                  value={newHolidayDate}
                  onChange={(e) => setNewHolidayDate(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-zinc-700 mb-1">Category</label>
                  <select
                    value={newHolidayCategory}
                    onChange={(e) => setNewHolidayCategory(e.target.value as any)}
                    className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs font-semibold text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                  >
                    <option value="National">National Holiday</option>
                    <option value="Religious">Religious / Islamic</option>
                  </select>
                </div>

                <div className="pt-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={newHolidayRecurring}
                      onChange={(e) => setNewHolidayRecurring(e.target.checked)}
                      className="rounded text-zinc-900 focus:ring-zinc-900"
                    />
                    <span className="font-semibold text-zinc-700">Annual Recurring</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddHolidayModal(false)}
                  className="px-3.5 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold rounded-xl cursor-pointer"
                >
                  Add Holiday
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Remove Employee Modal */}
      {removingUser && (
        <div className="fixed inset-0 z-50 bg-zinc-950/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-zinc-200">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <h3 className="text-sm font-bold text-zinc-900 tracking-tight">Remove Employee</h3>
              <button
                onClick={() => setRemovingUser(null)}
                className="text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 p-3 bg-zinc-50 rounded-xl border border-zinc-200/80 text-xs text-zinc-700">
              <div className="font-semibold text-zinc-900">{removingUser.full_name}</div>
              <div className="text-zinc-400 font-mono text-[11px]">{removingUser.email}</div>
              <div className="text-zinc-400 text-[10px] mt-0.5">{removingUser.position}</div>
            </div>

            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-900">
                This is a soft delete — all their historical leave records are kept. They'll move
                to Former Employees and can be reactivated later if needed.
              </p>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Last Day / Termination Date</label>
                <input
                  type="date"
                  required
                  value={removeDate}
                  onChange={(e) => setRemoveDate(e.target.value)}
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 mb-1">Reason (optional)</label>
                <textarea
                  rows={2}
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="e.g. Resigned, end of contract..."
                  className="w-full px-3 py-2 border border-zinc-200 rounded-xl text-xs text-zinc-900 focus:ring-2 focus:ring-zinc-900 outline-hidden"
                />
              </div>
            </div>

            {removeError && (
              <div className="mt-3 p-2.5 bg-rose-100 text-rose-800 text-xs rounded-xl font-medium">{removeError}</div>
            )}

            <div className="mt-4 pt-3 border-t border-zinc-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRemovingUser(null)}
                className="px-3.5 py-2 text-zinc-600 hover:bg-zinc-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRemove}
                disabled={removeSubmitting || !removeDate}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-zinc-300 text-white font-semibold rounded-xl cursor-pointer"
              >
                {removeSubmitting ? 'Removing...' : 'Remove Employee'}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDialogProps && <ConfirmDialog {...confirmDialogProps} />}

      {assigningManagersFor && (
        <AssignManagersModal
          open={true}
          employee={assigningManagersFor}
          eligibleManagers={managers.filter((m) => m.id !== assigningManagersFor.id)}
          onSave={(managerIds) => handleAssignManagers(assigningManagersFor, managerIds)}
          onCancel={() => setAssigningManagersFor(null)}
        />
      )}

    </div>
  );
};
