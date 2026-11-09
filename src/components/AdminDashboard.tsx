import React, { useState } from 'react';
import {
  Clock,
  CreditCard,
  Edit3,
  MessageSquare,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import {
  ConnectedDevice,
  JobStatusSummary,
  Plan,
  RouterConfig,
  SupportTicket,
  UptimeRecord,
  User,
} from '../types';
import {
  apiRequest,
  formatKes,
  formatNairobiDateTime,
} from '../api';
import NetworkDashboard from './NetworkDashboard';

export type AdminTab = 'network' | 'plans' | 'customers' | 'support';

interface AdminDashboardProps {
  activeTab: AdminTab;
  plans: Plan[];
  customers: User[];
  tickets: SupportTicket[];
  devices: ConnectedDevice[];
  routerConfig: RouterConfig;
  uptimeRecords: UptimeRecord[];
  jobLogs: JobStatusSummary | null;
  onRefreshAll: () => Promise<void>;
  onNotify: (message: string, isError?: boolean) => void;
}

export default function AdminDashboard({
  activeTab,
  plans,
  customers,
  tickets,
  devices,
  routerConfig,
  uptimeRecords,
  jobLogs,
  onRefreshAll,
  onNotify,
}: AdminDashboardProps) {
  // Plans CRUD state
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [planName, setPlanName] = useState('');
  const [planSpeed, setPlanSpeed] = useState('');
  const [planPrice, setPlanPrice] = useState('');
  const [planDuration, setPlanDuration] = useState('30');
  const [planDesc, setPlanDesc] = useState('');
  const [savingPlan, setSavingPlan] = useState(false);

  // Customer search / filter
  const [customerSearch, setCustomerSearch] = useState('');
  const [runningBillingCheck, setRunningBillingCheck] = useState(false);

  // Support reply state
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);
  const [ticketFilter, setTicketFilter] = useState<'all' | 'open' | 'replied' | 'closed'>('all');

  function startEditPlan(plan: Plan) {
    setEditingPlanId(plan.id);
    setPlanName(plan.name);
    setPlanSpeed(String(plan.speedMbps));
    setPlanPrice(String(plan.priceKes));
    setPlanDuration(String(plan.durationDays));
    setPlanDesc(plan.description || '');
  }

  function resetPlanForm() {
    setEditingPlanId(null);
    setPlanName('');
    setPlanSpeed('');
    setPlanPrice('');
    setPlanDuration('30');
    setPlanDesc('');
  }

  async function handleSavePlan(e: React.FormEvent) {
    e.preventDefault();
    setSavingPlan(true);
    try {
      const payload = {
        name: planName.trim(),
        speedMbps: Number(planSpeed),
        priceKes: Number(planPrice),
        durationDays: Number(planDuration) || 30,
        description: planDesc.trim(),
      };

      if (editingPlanId) {
        await apiRequest(`/api/plans/${editingPlanId}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        onNotify('Wi-Fi plan updated.');
      } else {
        await apiRequest('/api/plans', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        onNotify('New Wi-Fi plan published.');
      }
      resetPlanForm();
      await onRefreshAll();
    } catch (err: any) {
      onNotify(err.message || 'Failed to save plan', true);
    } finally {
      setSavingPlan(false);
    }
  }

  async function handleDeletePlan(plan: Plan) {
    try {
      await apiRequest(`/api/plans/${plan.id}`, { method: 'DELETE' });
      if (editingPlanId === plan.id) resetPlanForm();
      await onRefreshAll();
      onNotify(`Deleted plan "${plan.name}".`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to delete plan', true);
    }
  }

  async function handleMarkPaid(customer: User) {
    try {
      await apiRequest(`/api/customers/${customer.id}/mark-paid`, {
        method: 'POST',
      });
      await onRefreshAll();
      onNotify(`Marked ${customer.name} as paid and extended due date.`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to mark customer paid', true);
    }
  }

  async function handleToggleCustomerStatus(customer: User) {
    try {
      await apiRequest(`/api/customers/${customer.id}/toggle-status`, {
        method: 'POST',
      });
      await onRefreshAll();
      onNotify(
        customer.status === 'suspended'
          ? `Activated ${customer.name}.`
          : `Suspended ${customer.name}.`
      );
    } catch (err: any) {
      onNotify(err.message || 'Failed to update customer status', true);
    }
  }

  async function handleRunBillingCheckNow() {
    setRunningBillingCheck(true);
    try {
      const res = await apiRequest<{ result: { remindersSent: number } }>(
        '/api/jobs/run-billing-check',
        { method: 'POST' }
      );
      await onRefreshAll();
      onNotify(
        `3-day due-date check completed (${res.result.remindersSent} reminder${
          res.result.remindersSent === 1 ? '' : 's'
        } sent).`
      );
    } catch (err: any) {
      onNotify(err.message || 'Failed to run billing check', true);
    } finally {
      setRunningBillingCheck(false);
    }
  }

  async function handleSendReply(ticketId: string) {
    const text = (replyDrafts[ticketId] || '').trim();
    if (!text) {
      onNotify('Please enter a reply message.', true);
      return;
    }
    setSendingReplyId(ticketId);
    try {
      await apiRequest(`/api/tickets/${ticketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      setReplyDrafts((prev) => ({ ...prev, [ticketId]: '' }));
      await onRefreshAll();
      onNotify('Reply sent to customer.');
    } catch (err: any) {
      onNotify(err.message || 'Failed to send reply', true);
    } finally {
      setSendingReplyId(null);
    }
  }

  async function handleChangeTicketStatus(
    ticketId: string,
    status: 'open' | 'replied' | 'closed'
  ) {
    try {
      await apiRequest(`/api/tickets/${ticketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await onRefreshAll();
      onNotify(`Ticket marked as ${status}.`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update ticket status', true);
    }
  }

  const filteredCustomers = customers.filter((c) => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;
    return c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
  });

  const filteredTickets = tickets.filter((t) =>
    ticketFilter === 'all' ? true : t.status === ticketFilter
  );

  return (
    <div className="space-y-8">
      {/* KPI Overview Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Connected Devices</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-100 mt-1">
            {devices.filter((d) => d.status === 'connected').length}{' '}
            <span className="text-sm font-normal text-slate-400">/ {devices.length} total</span>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Router: {routerConfig.lastStatus === 'online' ? 'Online' : routerConfig.lastStatus === 'offline' ? 'Offline' : 'Unconfigured'}
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Registered Customers</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-100 mt-1">
            {customers.length}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            {customers.filter((c) => c.status === 'active').length} active ·{' '}
            {customers.filter((c) => c.status === 'suspended').length} suspended
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Published Wi-Fi Plans</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-100 mt-1">
            {plans.length}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Priced in Kenyan Shillings (KES)
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="text-xs text-slate-400">Open Support Tickets</div>
          <div className="text-2xl font-bold font-mono tabular-nums text-slate-100 mt-1">
            {tickets.filter((t) => t.status === 'open').length}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            {tickets.length} total issues logged
          </div>
        </div>
      </div>

      {/* TAB 1: NETWORK & ROUTER CONTROLS */}
      {activeTab === 'network' && (
        <NetworkDashboard
          devices={devices}
          routerConfig={routerConfig}
          uptimeRecords={uptimeRecords}
          jobLogs={jobLogs}
          onRefresh={onRefreshAll}
          onNotify={onNotify}
        />
      )}

      {/* TAB 2: WI-FI PLANS MANAGER */}
      {activeTab === 'plans' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Post / Edit Plan Form */}
          <section className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-100">
              {editingPlanId ? 'Edit Wi-Fi Plan' : 'Post New Wi-Fi Plan'}
            </h2>
            <p className="text-sm text-slate-400 mt-0.5 mb-5">
              Define plan speed, billing duration, and price in KES for customers to select
            </p>

            <form onSubmit={handleSavePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Plan Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Home Fiber 20 Mbps"
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Speed (Mbps)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="20"
                    value={planSpeed}
                    onChange={(e) => setPlanSpeed(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Price (KES)
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    placeholder="2500"
                    value={planPrice}
                    onChange={(e) => setPlanPrice(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm font-mono bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Billing Cycle (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  required
                  value={planDuration}
                  onChange={(e) => setPlanDuration(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm font-mono bg-slate-950 text-slate-100 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Description / Details
                </label>
                <textarea
                  rows={3}
                  placeholder="Unlimited monthly data, 24/7 support, suitable for streaming and remote work."
                  value={planDesc}
                  onChange={(e) => setPlanDesc(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={savingPlan}
                  className="px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                >
                  {savingPlan
                    ? 'Saving...'
                    : editingPlanId
                    ? 'Update Plan'
                    : 'Publish Plan'}
                </button>
                {editingPlanId && (
                  <button
                    type="button"
                    onClick={resetPlanForm}
                    className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </section>

          {/* Published Plans List */}
          <section className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">
              Published Wi-Fi Plans ({plans.length})
            </h2>
            <p className="text-sm text-slate-400 mb-5">
              Plans visible to customers in their subscription selector
            </p>

            {plans.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
                <CreditCard className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <h3 className="text-sm font-medium text-slate-200">No Plans Posted Yet</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  Use the form on the left to publish your first Wi-Fi plan in KES.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800">
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="py-4 first:pt-0 last:pb-0 flex flex-wrap items-start justify-between gap-4"
                  >
                    <div>
                      <div className="text-base font-semibold text-slate-100">{plan.name}</div>
                      <div className="text-xs text-sky-400 font-mono tabular-nums mt-0.5">
                        {plan.speedMbps} Mbps · {formatKes(plan.priceKes)} · {plan.durationDays} days cycle
                      </div>
                      {plan.description && (
                        <p className="text-sm text-slate-400 mt-1.5 max-w-xl">{plan.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => startEditPlan(plan)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeletePlan(plan)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-300 bg-red-950/60 hover:bg-red-900/70 border border-red-800/70 rounded-lg transition-colors whitespace-nowrap"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* TAB 3: CUSTOMERS LIST & BILLING */}
      {activeTab === 'customers' && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Subscriber Accounts &amp; Billing</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Daily 9:00 AM Nairobi job reminds active customers 3 days before their payment due date
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <input
                type="search"
                placeholder="Search name or email..."
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                className="px-3 py-1.5 text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <button
                type="button"
                onClick={handleRunBillingCheckNow}
                disabled={runningBillingCheck}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                <Clock className="w-3.5 h-3.5" />
                {runningBillingCheck ? 'Running Check...' : 'Run 3-Day Reminder Check Now'}
              </button>
            </div>
          </div>

          {filteredCustomers.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
              <Users className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <h3 className="text-sm font-medium text-slate-200">No Customers Registered Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                When subscribers sign up with their email and password, they will appear here with their chosen plan and next payment due date.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400">
                    <th className="py-3 pr-4">Customer</th>
                    <th className="py-3 px-4">Current Plan</th>
                    <th className="py-3 px-4">Account Status</th>
                    <th className="py-3 px-4">Next Payment Due (Nairobi)</th>
                    <th className="py-3 pl-4 text-right">Billing &amp; Access Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-sm">
                  {filteredCustomers.map((customer) => {
                    const plan = plans.find((p) => p.id === customer.planId);
                    const isOverdue =
                      customer.nextPaymentDate &&
                      new Date(customer.nextPaymentDate).getTime() < Date.now();

                    return (
                      <tr key={customer.id} className="hover:bg-slate-800/40 transition-colors">
                        <td className="py-3.5 pr-4">
                          <div className="font-medium text-slate-100">{customer.name}</div>
                          <div className="text-xs text-slate-400">{customer.email}</div>
                        </td>

                        <td className="py-3.5 px-4">
                          {plan ? (
                            <div>
                              <div className="font-medium text-slate-100">{plan.name}</div>
                              <div className="text-xs text-slate-400 font-mono tabular-nums">
                                {plan.speedMbps} Mbps · {formatKes(plan.priceKes)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-500">No plan selected</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 text-xs font-medium">
                          {customer.status === 'active' && (
                            <span className="text-emerald-400">Active</span>
                          )}
                          {customer.status === 'suspended' && (
                            <span className="text-red-400">Suspended</span>
                          )}
                          {customer.status === 'pending' && (
                            <span className="text-amber-400">Pending Plan</span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                          <span className={isOverdue ? 'text-red-400 font-semibold' : 'text-slate-200'}>
                            {formatNairobiDateTime(customer.nextPaymentDate)}
                          </span>
                          {isOverdue && (
                            <span className="block text-[11px] text-red-400">Overdue</span>
                          )}
                        </td>

                        <td className="py-3.5 pl-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleMarkPaid(customer)}
                              className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors whitespace-nowrap"
                            >
                              Mark Paid
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleCustomerStatus(customer)}
                              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                                customer.status === 'suspended'
                                  ? 'text-sky-300 bg-sky-950/60 hover:bg-sky-900/70 border border-sky-800/70'
                                  : 'text-red-300 bg-red-950/60 hover:bg-red-900/70 border border-red-800/70'
                              }`}
                            >
                              {customer.status === 'suspended' ? 'Activate' : 'Suspend'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: SUPPORT INBOX */}
      {activeTab === 'support' && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Customer Support Inbox</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Read reported issues from customers and reply directly to their portal
              </p>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-lg">
              {(['all', 'open', 'replied', 'closed'] as const).map((statusKey) => (
                <button
                  key={statusKey}
                  type="button"
                  onClick={() => setTicketFilter(statusKey)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap ${
                    ticketFilter === statusKey
                      ? 'bg-slate-800 text-slate-100 shadow-xs'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {statusKey}
                </button>
              ))}
            </div>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
              <MessageSquare className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <h3 className="text-sm font-medium text-slate-200">No Support Issues Found</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                Issues reported by customers will appear here with a reply box.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredTickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="border border-slate-800 bg-slate-950/40 rounded-lg p-5 space-y-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h3 className="text-base font-semibold text-slate-100">{ticket.subject}</h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        <span>{ticket.userName}</span>
                        <span aria-hidden="true"> · </span>
                        <span>{ticket.userEmail}</span>
                        <span aria-hidden="true"> · </span>
                        <span className="font-mono">{formatNairobiDateTime(ticket.createdAt)}</span>
                        <span aria-hidden="true"> · </span>
                        <span
                          className={
                            ticket.status === 'open'
                              ? 'text-amber-400 font-medium'
                              : ticket.status === 'replied'
                              ? 'text-emerald-400 font-medium'
                              : 'text-slate-500'
                          }
                        >
                          Status: {ticket.status}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {ticket.status !== 'closed' ? (
                        <button
                          type="button"
                          onClick={() => handleChangeTicketStatus(ticket.id, 'closed')}
                          className="px-2.5 py-1 text-xs font-medium text-slate-300 hover:text-white bg-slate-800 border border-slate-700 rounded-md"
                        >
                          Close Issue
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleChangeTicketStatus(ticket.id, 'open')}
                          className="px-2.5 py-1 text-xs font-medium text-sky-300 bg-sky-950/60 border border-sky-800/70 rounded-md"
                        >
                          Reopen
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-sm text-slate-200 bg-slate-900 p-3.5 rounded-lg border border-slate-800">
                    {ticket.message}
                  </p>

                  {/* Replies Thread */}
                  {ticket.replies.length > 0 && (
                    <div className="space-y-2.5 pl-4 border-l border-slate-700">
                      {ticket.replies.map((reply) => (
                        <div key={reply.id} className="text-sm">
                          <div className="text-xs text-slate-400">
                            <span className="font-semibold text-slate-200">
                              {reply.senderName} ({reply.senderRole})
                            </span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono">{formatNairobiDateTime(reply.createdAt)}</span>
                          </div>
                          <p className="text-slate-300 mt-0.5">{reply.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Admin Reply Box */}
                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="text"
                      placeholder="Write a reply to this customer..."
                      value={replyDrafts[ticket.id] || ''}
                      onChange={(e) =>
                        setReplyDrafts((prev) => ({ ...prev, [ticket.id]: e.target.value }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleSendReply(ticket.id);
                        }
                      }}
                      className="flex-1 px-3.5 py-2 text-sm bg-slate-900 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSendReply(ticket.id)}
                      disabled={sendingReplyId === ticket.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      {sendingReplyId === ticket.id ? 'Sending...' : 'Send Reply'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
