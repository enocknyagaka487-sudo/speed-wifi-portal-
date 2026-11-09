`import netlifyIdentity from 'netlify-identity-widget'
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Bell, CheckCheck, LogOut } from 'lucide-react';
import {
  AppNotification,
  ConnectedDevice,
  JobStatusSummary,
  Plan,
  RouterConfig,
  SupportTicket,
  UptimeRecord,
  User,
} from './types';
import {
  apiRequest,
  formatNairobiDateTime,
  getStoredToken,
  setStoredToken,
} from './api';
import AdminDashboard, { AdminTab } from './components/AdminDashboard';
import CustomerDashboard, { CustomerTab } from './components/CustomerDashboard';

const INITIAL_ROUTER_CONFIG: RouterConfig = {
  publicAddress: '',
  checkIntervalMinutes: 2,
  consecutiveFailures: 0,
  lastCheckedAt: null,
  lastStatus: 'unconfigured',
  lastLatencyMs: null,
  lastError: null,
  lastRebootAt: null,
  autoRebootEnabled: false,
  autoRebootDay: 0,
  autoRebootTime: '03:00',
  rebootHistory: [],
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [hasUsers, setHasUsers] = useState(true);

  // Auth form state
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [submittingAuth, setSubmittingAuth] = useState(false);

  // Navigation & Notifications
  const [adminTab, setAdminTab] = useState<AdminTab>('network');
  const [customerTab, setCustomerTab] = useState<CustomerTab>('overview');
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);

  // App Data
  const [plans, setPlans] = useState<Plan[]>([]);
  const [customers, setCustomers] = useState<User[]>([]);
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [routerConfig, setRouterConfig] = useState<RouterConfig>(INITIAL_ROUTER_CONFIG);
  const [uptimeRecords, setUptimeRecords] = useState<UptimeRecord[]>([]);
  const [jobLogs, setJobLogs] = useState<JobStatusSummary | null>(null);

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ message, isError });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const loadAllData = useCallback(async (currentUser: User) => {
    try {
      const [meRes, plansRes, ticketsRes, notesRes] = await Promise.all([
        apiRequest<{ user: User }>('/api/auth/me'),
        apiRequest<{ plans: Plan[] }>('/api/plans'),
        apiRequest<{ tickets: SupportTicket[] }>('/api/tickets'),
        apiRequest<{ notifications: AppNotification[] }>('/api/notifications'),
      ]);

      setUser(meRes.user);
      setPlans(plansRes.plans);
      setTickets(ticketsRes.tickets);
      setNotifications(notesRes.notifications);

      if (currentUser.role === 'admin') {
        const [custRes, netRes] = await Promise.all([
          apiRequest<{ customers: User[] }>('/api/customers'),
          apiRequest<{
            devices: ConnectedDevice[];
            routerConfig: RouterConfig;
            uptimeRecords: UptimeRecord[];
            jobLogs: JobStatusSummary;
          }>('/api/network/overview'),
        ]);
        setCustomers(custRes.customers);
        setDevices(netRes.devices);
        setRouterConfig(netRes.routerConfig);
        setUptimeRecords(netRes.uptimeRecords);
        setJobLogs(netRes.jobLogs);
      }
    } catch (err: any) {
      console.error('Data refresh error:', err);
    }
  }, []);

  useEffect(() => {
    async function init() {
      async function init() {
  try {
    const user = netlifyIdentity.currentUser();
    if (user) {
      setUser(user as unknown as User);
      await loadAllData(user as unknown as User);
    } else {
      setAuthMode('signup');
    }
  } catch (err) {
    console.error('Initialization error:', err);
  }
}
        setStoredToken(null);
        setUser(null);
      } finally {
        setLoadingAuth(false);
      }
    }
    init();
  }, [loadAllData]);

  // Poll every 30s while signed in so 2-minute router checks and notifications update live
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      loadAllData(user);
    }, 30000);
    return () => clearInterval(interval);
  }, [user, loadAllData]);

 ```typescript
async function handleAuthSubmit(e: React.FormEvent) {
  e.preventDefault();
  setAuthError(null);
  setSubmittingAuth(true);
  try {
    if (authMode === 'signup') {
      netlifyIdentity.open('signup');
    } else {
      netlifyIdentity.open('login');
    }
  } catch (err: any) {
    setAuthError(err.message || 'Authentication failed');
  } finally {
    setSubmittingAuth(false);
  }
}
```
  

  async function handleSignOut() {
    try {
      await apiRequest('/api/auth/signout', { method: 'POST' });
    } catch {
      // ignore
    }
    setStoredToken(null);
    setUser(null);
    setShowNotifications(false);
  }

  async function handleMarkAllRead() {
    try {
      await apiRequest('/api/notifications/read-all', { method: 'POST' });
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    } catch {
      // ignore
    }
  }

  async function handleMarkNotificationRead(id: string) {
    try {
      await apiRequest(`/api/notifications/${id}/read`, { method: 'POST' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    } catch {
      // ignore
    }
  }

  const unreadCount = notifications.filter((n) => !n.read).length;

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#0B1120] flex items-center justify-center p-6">
        <div className="text-sm text-slate-400 font-medium">Loading Wi-Fi Portal...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col justify-between">
        <header className="flex items-center justify-between gap-8 px-6 py-4 bg-slate-900/90 border-b border-slate-800">
          <a
            href="/"
            className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
          >
            Speed 5G Network
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => setAuthMode('signin')}
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('signup')}
              className="hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Create Account
            </button>
          </nav>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setAuthMode(authMode === 'signin' ? 'signup' : 'signin')}
              className="px-4 py-2 text-xs font-medium text-white bg-sky-600 rounded-lg hover:bg-sky-500 transition-colors whitespace-nowrap shrink-0"
            >
              {authMode === 'signin' ? 'Register' : 'Sign In'}
            </button>
          </div>
        </header>

        <main className="max-w-5xl w-full mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-6 space-y-4">
            <h1 className="text-3xl sm:text-4xl font-bold text-slate-100 tracking-tight">
              Subscriber Wi-Fi Portal &amp; Router Operations Console
            </h1>
            <p className="text-base text-slate-400 leading-relaxed">
              Manage high-speed Wi-Fi plans in Kenyan Shillings (KES), track exact payment due dates in Nairobi time, control connected devices with live bandwidth sliders, and monitor 24-hour router uptime.
            </p>
            <div className="pt-2 space-y-2 text-sm text-slate-400">
              <div>· First registered account automatically receives Administrator access</div>
              <div>· Subsequent accounts register as Subscriber Customers</div>
              <div>· Automated 2-minute router reachability checks &amp; 9:00 AM payment reminders</div>
            </div>
          </div>

          <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-xl p-8">
            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg mb-6">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setAuthError(null);
                }}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  authMode === 'signin'
                    ? 'bg-slate-800 text-slate-100 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setAuthError(null);
                }}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  authMode === 'signup'
                    ? 'bg-slate-800 text-slate-100 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Account
              </button>
            </div>

            {!hasUsers && authMode === 'signup' && (
              <div className="mb-5 p-3.5 rounded-lg bg-sky-950/60 border border-sky-800/70 text-xs text-sky-200">
                <strong>Initial Setup:</strong> No accounts exist yet. Creating this first account will automatically make you the <strong>Administrator</strong>.
              </div>
            )}

            {authError && (
              <div className="mb-5 p-3.5 rounded-lg bg-red-950/60 border border-red-800/70 text-xs text-red-300">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'signup' && (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Enter your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingAuth}
                className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {submittingAuth
                  ? 'Please wait...'
                  : authMode === 'signup'
                  ? hasUsers
                    ? 'Create Customer Account'
                    : 'Create Admin Account'
                  : 'Sign In to Portal'}
              </button>
            </form>
          </div>
        </main>

        <footer className="px-6 py-4 border-t border-slate-800 text-xs text-slate-500 flex items-center justify-between">
          <span>Speed 5G Network Portal</span>
          <span>East Africa Time (Africa/Nairobi) · Currency: KES</span>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0B1120] text-slate-100 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="flex items-center justify-between gap-8 px-6 py-4 bg-slate-900/95 backdrop-blur-xs border-b border-slate-800 sticky top-0 z-30">
        {/* Zone 1: Brand Title (single text element) */}
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            if (user.role === 'admin') setAdminTab('network');
            else setCustomerTab('overview');
          }}
          className="text-lg font-bold tracking-tight text-slate-100 font-display whitespace-nowrap shrink-0"
        >
          Speed 5G Network
        </a>

        {/* Zone 2: 2–4 Single-Line Navigation Links */}
        {user.role === 'admin' ? (
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-400 overflow-x-auto">
            <button
              type="button"
              onClick={() => setAdminTab('network')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                adminTab === 'network'
                  ? 'border-sky-400 text-slate-100 font-semibold'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              Network
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('plans')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                adminTab === 'plans'
                  ? 'border-sky-400 text-slate-100 font-semibold'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              Plans
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('customers')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                adminTab === 'customers'
                  ? 'border-sky-400 text-slate-100 font-semibold'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              Customers
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('support')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                adminTab === 'support'
                  ? 'border-sky-400 text-slate-100 font-semibold'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              Support Inbox
            </button>
          </nav>
        ) : (
          <nav className="flex items-center gap-6 text-sm font-medium text-slate-400">
            <button
              type="button"
              onClick={() => setCustomerTab('overview')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                customerTab === 'overview'
                  ? 'border-sky-400 text-slate-100 font-semibold'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              Plans &amp; Billing
            </button>
            <button
              type="button"
              onClick={() => setCustomerTab('support')}
              className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                customerTab === 'support'
                  ? 'border-sky-400 text-slate-100 font-semibold'
                  : 'border-transparent hover:text-slate-200'
              }`}
            >
              Support &amp; Replies
            </button>
          </nav>
        )}

        {/* Zone 3: Notification Bell + Sign Out */}
        <div className="flex items-center gap-3 shrink-0 relative">
          <button
            type="button"
            onClick={() => setShowNotifications((prev) => !prev)}
            aria-label="In-app notifications"
            className="relative p-2 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 px-1.5 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 hover:text-white transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>

          {/* Notification Bell Popover */}
          {showNotifications && (
            <div className="absolute right-0 top-12 w-80 sm:w-96 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-4 z-50">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <span className="text-xs font-semibold text-slate-100">
                  Notifications ({unreadCount} unread)
                </span>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="inline-flex items-center gap-1 text-xs text-sky-400 hover:text-sky-300 font-medium"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    Mark all read
                  </button>
                )}
              </div>

              {notifications.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  No notifications yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-800/80 max-h-80 overflow-y-auto mt-1">
                  {notifications.map((note) => (
                    <div
                      key={note.id}
                      onClick={() => handleMarkNotificationRead(note.id)}
                      className={`py-3 px-2 rounded-lg cursor-pointer transition-colors ${
                        note.read ? 'opacity-65 hover:opacity-100' : 'bg-sky-950/40'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-slate-100">
                          {note.title}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {formatNairobiDateTime(note.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                        {note.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Subheader Context Bar */}
      <div className="bg-slate-900/60 border-b border-slate-800/80 px-6 py-2.5">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs text-slate-400">
          <div>
            Signed in as <strong className="text-slate-200">{user.name}</strong> ({user.email}) · Role:{' '}
            <strong className="uppercase text-sky-400">{user.role}</strong>
          </div>
          <div className="font-mono text-slate-400">
            Timezone: Africa/Nairobi (EAT) · Router Check: Every 2 mins · Reminder Check: 9:00 AM EAT
          </div>
        </div>
      </div>

      {/* Toast Feedback Banner */}
      {toast && (
        <div className="max-w-7xl w-full mx-auto px-6 pt-4">
          <div
            className={`px-4 py-3 rounded-lg border text-xs font-medium flex items-center justify-between ${
              toast.isError
                ? 'bg-red-950/70 border-red-800 text-red-200'
                : 'bg-emerald-950/70 border-emerald-800 text-emerald-200'
            }`}
          >
            <span>{toast.message}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-slate-200 ml-4"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Main Content Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-8">
        {user.role === 'admin' ? (
          <AdminDashboard
            activeTab={adminTab}
            plans={plans}
            customers={customers}
            tickets={tickets}
            devices={devices}
            routerConfig={routerConfig}
            uptimeRecords={uptimeRecords}
            jobLogs={jobLogs}
            onRefreshAll={() => loadAllData(user)}
            onNotify={showToast}
          />
        ) : (
          <CustomerDashboard
            activeTab={customerTab}
            user={user}
            plans={plans}
            tickets={tickets}
            onRefreshAll={() => loadAllData(user)}
            onNotify={showToast}
          />
        )}
      </main>

      <footer className="px-6 py-4 border-t border-slate-800 bg-slate-900/60 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <span>Speed 5G Network — Subscriber &amp; Router Management Portal</span>
          <span>All billing dates and scheduled jobs operate in East Africa Time (Africa/Nairobi)</span>
        </div>
      </footer>
    </div>
  );
}
