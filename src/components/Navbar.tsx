import {
    Bell,
    ChevronDown,
    FileSpreadsheet,
    LogOut,
    PlusCircle,
    Shield,
    Users
} from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { ApiService, AuthService } from '../services/api';
import { EmailAlert, User } from '../types';

interface NavbarProps {
  currentUser: User | null;
  activeTab: 'my-leaves' | 'approvals' | 'calendar' | 'admin' | 'migration';
  setActiveTab: (tab: 'my-leaves' | 'approvals' | 'calendar' | 'admin' | 'migration') => void;
  onOpenNewRequest: () => void;
  pendingApprovalsCount: number;
  onLogout: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeTab,
  setActiveTab,
  onOpenNewRequest,
  pendingApprovalsCount,
  onLogout,
}) => {
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [emailAlerts, setEmailAlerts] = useState<EmailAlert[]>([]);

  const isManagerOrAdmin = currentUser?.role === 'Manager' || currentUser?.role === 'SuperAdmin';
  const isSuperAdmin = currentUser?.role === 'SuperAdmin';
  const unreadAlertsCount = emailAlerts.filter((a) => !a.read).length;

  useEffect(() => {
    if (!isManagerOrAdmin) return;
    ApiService.getEmailAlerts().then(setEmailAlerts).catch(() => {});
  }, [isManagerOrAdmin, currentUser?.id]);

  const handleAlertClick = async (alertId: string) => {
    await ApiService.markAlertRead(alertId).catch(() => {});
    setEmailAlerts((prev) => prev.map((a) => a.id === alertId ? { ...a, read: true } : a));
    setShowNotifications(false);
    setActiveTab('approvals');
  };

  const handleLogout = async () => {
    setShowUserMenu(false);
    await onLogout();
  };

  const getRoleBadgeColor = (role?: string) => {
    switch (role) {
      case 'SuperAdmin': return 'bg-purple-50 text-purple-700 border-purple-200/80';
      case 'Manager': return 'bg-blue-50 text-blue-700 border-blue-200/80';
      default: return 'bg-zinc-100 text-zinc-700 border-zinc-200/80';
    }
  };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-zinc-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">

          {/* Logo */}
          <button
            type="button"
            onClick={() => setActiveTab('my-leaves')}
            className="flex items-center gap-3 cursor-pointer text-left hover:opacity-80 transition-opacity"
            aria-label="Go to homepage"
          >
            <div className="w-9 h-9 rounded-xl bg-zinc-950 flex items-center justify-center text-white shadow-sm ring-1 ring-zinc-800">
              <span className="font-black text-sm tracking-tight text-white flex items-center">
                M<span className="text-blue-400">H</span>
              </span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-zinc-900 tracking-tight">MMG-HR</span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-md bg-zinc-100 text-zinc-600 border border-zinc-200/70">
                  MMG
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 hidden sm:block">Time-Off & Leave Management</p>
            </div>
          </button>

          {/* Nav tabs */}
          <nav className="hidden md:flex items-center bg-zinc-100/80 p-1 rounded-xl border border-zinc-200/60">
            <button
              onClick={() => setActiveTab('my-leaves')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'my-leaves' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
              }`}
            >
              My Leaves
            </button>

            {isManagerOrAdmin && (
              <button
                onClick={() => setActiveTab('approvals')}
                className={`relative px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'approvals' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                }`}
              >
                <span>Approvals</span>
                {pendingApprovalsCount > 0 && (
                  <span className="px-1.5 py-0.2 text-[10px] font-bold bg-amber-500 text-white rounded-full">
                    {pendingApprovalsCount}
                  </span>
                )}
              </button>
            )}

            <button
              onClick={() => setActiveTab('calendar')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'calendar' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-zinc-500" />
              <span>Team Calendar</span>
            </button>

            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('admin')}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'admin' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200/50'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-purple-600" />
                <span>Administration</span>
              </button>
            )}

            {isSuperAdmin && (
              <button
                onClick={() => setActiveTab('migration')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'migration' ? 'bg-white text-zinc-900 shadow-xs' : 'text-zinc-500 hover:text-zinc-800 hover:bg-zinc-200/50'
                }`}
                title="Absence Leave.xlsx Migration"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden lg:inline">Excel Migration</span>
              </button>
            )}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2.5">
            {currentUser && (
              <button
                onClick={onOpenNewRequest}
                className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-semibold shadow-xs transition-all cursor-pointer"
              >
                <PlusCircle className="w-3.5 h-3.5 text-blue-400" />
                <span>Request Leave</span>
              </button>
            )}

            {/* Notifications bell */}
            {isManagerOrAdmin && (
              <div className="relative">
                <button
                  onClick={() => setShowNotifications(!showNotifications)}
                  className="p-2 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 relative transition-colors cursor-pointer"
                >
                  <Bell className="w-4.5 h-4.5" />
                  {unreadAlertsCount > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full ring-2 ring-white" />
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-xl border border-zinc-200/90 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2.5 border-b border-zinc-100 flex items-center justify-between">
                      <div className="font-semibold text-xs text-zinc-900 uppercase tracking-wider">Notifications</div>
                      {unreadAlertsCount > 0 && (
                        <button
                          onClick={async () => { await ApiService.markAllAlertsRead(); setEmailAlerts((prev) => prev.map((a) => ({ ...a, read: true }))); }}
                          className="text-[11px] text-blue-600 hover:underline cursor-pointer"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    <div className="max-h-72 overflow-y-auto divide-y divide-zinc-100">
                      {emailAlerts.length === 0 ? (
                        <div className="p-4 text-center text-xs text-zinc-500">No notifications.</div>
                      ) : (
                        emailAlerts.map((alert) => (
                          <div
                            key={alert.id}
                            onClick={() => handleAlertClick(alert.id)}
                            className={`p-3 text-xs hover:bg-zinc-50 cursor-pointer transition-colors ${!alert.read ? 'bg-blue-50/40 font-medium' : ''}`}
                          >
                            <div className="text-zinc-900 font-semibold">{alert.subject}</div>
                            <div className="text-zinc-500 line-clamp-2 mt-0.5">{alert.preview}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* User menu */}
            {currentUser ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu(!showUserMenu)}
                  className="flex items-center gap-2 p-1.5 rounded-xl border border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 transition-all cursor-pointer"
                >
                  <img
                    src={currentUser.avatar_url || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.full_name)}`}
                    alt={currentUser.full_name}
                    className="w-7 h-7 rounded-lg object-cover bg-zinc-100"
                  />
                  <div className="hidden xl:block">
                    <div className="text-xs font-semibold text-zinc-900 leading-tight">{currentUser.full_name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className={`text-[9px] px-1 py-0.2 rounded border font-semibold ${getRoleBadgeColor(currentUser.role)}`}>
                        {currentUser.role}
                      </span>
                      <span className="text-[9px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-1 rounded">
                        {currentUser.current_balance}d
                      </span>
                    </div>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400 ml-0.5" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-zinc-200 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                    <div className="px-4 py-2.5 border-b border-zinc-100">
                      <div className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">Signed In As</div>
                      <div className="font-semibold text-sm text-zinc-900">{currentUser.full_name}</div>
                      <div className="text-xs text-zinc-500 font-mono truncate">{currentUser.email}</div>
                      <div className="mt-2 flex items-center justify-between text-xs bg-zinc-50 p-2 rounded-lg border border-zinc-200/70">
                        <span className="text-zinc-600">Available Balance:</span>
                        <span className="font-bold text-zinc-900">{currentUser.current_balance} days</span>
                      </div>
                    </div>

                    <div className="border-t border-zinc-100 mt-2 pt-1 px-1">
                      <button
                        onClick={handleLogout}
                        className="w-full text-left px-3 py-2 rounded-lg text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 font-medium cursor-pointer"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Sign Out</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={() => AuthService.loginWithGoogle()}
                className="px-3.5 py-1.5 rounded-lg bg-zinc-900 text-white text-xs font-semibold hover:bg-zinc-800 cursor-pointer"
              >
                Sign In
              </button>
            )}
          </div>
        </div>

        {/* Mobile sub-nav */}
        <div className="md:hidden flex items-center justify-between overflow-x-auto py-2.5 border-t border-zinc-100 text-xs gap-1">
          {(['my-leaves', ...(isManagerOrAdmin ? ['approvals'] : []), 'calendar', ...(isSuperAdmin ? ['admin', 'migration'] : [])] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-3 py-1 rounded-md font-semibold whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                activeTab === tab ? 'bg-zinc-900 text-white' : 'text-zinc-600'
              }`}
            >
              <span className="capitalize">{tab === 'my-leaves' ? 'My Leaves' : tab === 'admin' ? 'Admin' : tab.charAt(0).toUpperCase() + tab.slice(1)}</span>
              {tab === 'approvals' && pendingApprovalsCount > 0 && (
                <span className="px-1.5 text-[10px] bg-amber-500 text-white rounded-full">{pendingApprovalsCount}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
};
