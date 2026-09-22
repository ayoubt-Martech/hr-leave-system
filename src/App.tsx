import { useCallback, useEffect, useState } from 'react';
import { AdminPanel } from './components/AdminPanel';
import { EmployeeDashboard } from './components/EmployeeDashboard';
import { ExcelMigrationModal } from './components/ExcelMigrationModal';
import { LeaveRequestModal } from './components/LeaveRequestModal';
import { LoginModal } from './components/LoginModal';
import { ManagerDashboard } from './components/ManagerDashboard';
import { Navbar } from './components/Navbar';
import { TeamCalendar } from './components/TeamCalendar';
import { ApiService, AuthService } from './services/api';
import { User } from './types';

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'my-leaves' | 'approvals' | 'calendar' | 'admin' | 'migration'>('my-leaves');
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [pendingApprovalsCount, setPendingApprovalsCount] = useState(0);
  const [accrualRate, setAccrualRate] = useState<number>(1.5);
  const [maxCarryOver, setMaxCarryOver] = useState<number>(0);

  // ── Bootstrap: pick up OAuth token from URL or localStorage ──────────────
  useEffect(() => {
    AuthService.bootstrap().then((user) => {
      setCurrentUser(user);
      setLoading(false);
    });
  }, []);

  // ── Live policy settings for the footer (kept in sync with AdminPanel) ────
  useEffect(() => {
    if (!currentUser) return;
    ApiService.getSettingValue<number>('monthly_accrual_rate', 1.5).then(setAccrualRate);
    ApiService.getSettingValue<number>('max_carry_over_days', 0).then(setMaxCarryOver);
  }, [currentUser, refreshKey]);

  // ── Refresh current user data from API ────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setRefreshKey((k) => k + 1);
    if (currentUser) {
      const updated = await ApiService.getUserById(currentUser.id);
      if (updated) setCurrentUser(updated);
    }
  }, [currentUser]);

  // ── Compute pending approvals count ──────────────────────────────────────
  useEffect(() => {
    if (!currentUser) { setPendingApprovalsCount(0); return; }

    ApiService.getRequests().then((requests) => {
      ApiService.getUsers().then((allUsers) => {
        const count = requests.filter((r) => {
          if (r.status !== 'Pending' && r.status !== 'CancellationRequested') return false;
          if (currentUser.role === 'SuperAdmin') return r.user_id !== currentUser.id;
          const applicant = allUsers.find((u) => u.id === r.user_id);
          return applicant?.manager_ids.includes(currentUser.id) ?? false;
        }).length;
        setPendingApprovalsCount(count);
      });
    }).catch(() => {});
  }, [currentUser, refreshKey]);

  // ── Role guard: redirect away from restricted tabs ────────────────────────
  useEffect(() => {
    if (currentUser?.role !== 'SuperAdmin' && (activeTab === 'admin' || activeTab === 'migration')) {
      setActiveTab('my-leaves');
      return;
    }
    if (currentUser?.role === 'Employee' && activeTab === 'approvals') {
      setActiveTab('my-leaves');
    }
  }, [currentUser, activeTab]);

  const handleLoginSuccess = (user: User) => {
    setCurrentUser(user);
    setRefreshKey((k) => k + 1);
  };

  const handleLogout = async () => {
    await AuthService.logout();
    setCurrentUser(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center">
        <div className="text-sm text-zinc-500 animate-pulse">Loading MMG-HR…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50/60 flex flex-col font-sans text-zinc-900 antialiased selection:bg-zinc-200 selection:text-zinc-900">

      {/* Top Navigation */}
      <Navbar
        currentUser={currentUser}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenNewRequest={() => setIsRequestModalOpen(true)}
        pendingApprovalsCount={pendingApprovalsCount}
        onLogout={handleLogout}
      />

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        {currentUser ? (
          <>
            {activeTab === 'my-leaves' && (
              <EmployeeDashboard
                key={`emp_${refreshKey}`}
                currentUser={currentUser}
                onOpenNewRequest={() => setIsRequestModalOpen(true)}
                onRequestUpdated={handleRefresh}
              />
            )}

            {activeTab === 'approvals' && (
              <ManagerDashboard
                key={`mgr_${refreshKey}`}
                currentUser={currentUser}
                onRequestUpdated={handleRefresh}
                onOpenNewRequest={() => setIsRequestModalOpen(true)}
              />
            )}

            {activeTab === 'calendar' && (
              <TeamCalendar key={`cal_${refreshKey}`} currentUser={currentUser} />
            )}

            {activeTab === 'admin' && currentUser.role === 'SuperAdmin' && (
              <AdminPanel key={`adm_${refreshKey}`} currentUser={currentUser} onRefresh={handleRefresh} />
            )}

            {activeTab === 'migration' && currentUser.role === 'SuperAdmin' && (
              <ExcelMigrationModal
                key={`mig_${refreshKey}`}
                onMigrationComplete={handleRefresh}
              />
            )}
          </>
        ) : (
          <div className="py-20 text-center">
            <h2 className="text-xl font-bold text-zinc-900 tracking-tight">Please Sign In to Access MMG-HR</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Authentication requires a whitelisted Momentum Marketing Group Google Workspace account.
            </p>
          </div>
        )}
      </main>

      {/* Leave Request Modal */}
      {currentUser && (
        <LeaveRequestModal
          isOpen={isRequestModalOpen}
          onClose={() => setIsRequestModalOpen(false)}
          currentUser={currentUser}
          onSuccess={() => {
            handleRefresh();
            setActiveTab('my-leaves');
          }}
        />
      )}

      {/* Login Modal (shown when signed out) */}
      <LoginModal
        isOpen={currentUser === null}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Footer */}
      <footer className="border-t border-zinc-200/80 bg-white py-3.5 text-center text-xs text-zinc-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-zinc-700">MMG-HR</span>
            <span className="text-zinc-300">•</span>
            <span>Momentum Marketing Group Leave Management</span>
            <span className="text-zinc-300">•</span>
            <span>5-Day Workweek (Mon–Fri)</span>
          </div>
          <div className="text-[11px] text-zinc-400 font-mono">
            Accrual: {accrualRate}d/mo ({Number.isInteger(accrualRate * 12) ? accrualRate * 12 : (accrualRate * 12).toFixed(1)}d/yr) • Carry-Over: {maxCarryOver === 0 ? 'Unlimited' : `Max ${maxCarryOver}d`}
          </div>
        </div>
      </footer>
    </div>
  );
}
