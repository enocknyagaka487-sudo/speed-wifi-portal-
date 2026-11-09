import React, { useState } from 'react';
import {
  MessageSquare,
  Send,
  Wifi,
} from 'lucide-react';
import { Plan, SupportTicket, User } from '../types';
import {
  apiRequest,
  formatKes,
  formatNairobiDateTime,
} from '../api';

export type CustomerTab = 'overview' | 'support';

interface CustomerDashboardProps {
  activeTab: CustomerTab;
  user: User;
  plans: Plan[];
  tickets: SupportTicket[];
  onRefreshAll: () => Promise<void>;
  onNotify: (message: string, isError?: boolean) => void;
}

export default function CustomerDashboard({
  activeTab,
  user,
  plans,
  tickets,
  onRefreshAll,
  onNotify,
}: CustomerDashboardProps) {
  const [selectingPlanId, setSelectingPlanId] = useState<string | null>(null);

  // Support issue form state
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [submittingIssue, setSubmittingIssue] = useState(false);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [sendingReplyId, setSendingReplyId] = useState<string | null>(null);

  const currentPlan = plans.find((p) => p.id === user.planId) || null;

  async function handleSelectPlan(plan: Plan) {
    setSelectingPlanId(plan.id);
    try {
      await apiRequest(`/api/plans/${plan.id}/select`, {
        method: 'POST',
      });
      await onRefreshAll();
      onNotify(`Activated ${plan.name} (${formatKes(plan.priceKes)}).`);
    } catch (err: any) {
      onNotify(err.message || 'Could not select plan', true);
    } finally {
      setSelectingPlanId(null);
    }
  }

  async function handleSubmitIssue(e: React.FormEvent) {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      onNotify('Please provide both an issue subject and description.', true);
      return;
    }
    setSubmittingIssue(true);
    try {
      await apiRequest('/api/tickets', {
        method: 'POST',
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
        }),
      });
      setSubject('');
      setMessage('');
      await onRefreshAll();
      onNotify('Your issue has been submitted to support.');
    } catch (err: any) {
      onNotify(err.message || 'Failed to submit support issue', true);
    } finally {
      setSubmittingIssue(false);
    }
  }

  async function handleSendCustomerReply(ticketId: string) {
    const text = (replyDrafts[ticketId] || '').trim();
    if (!text) return;
    setSendingReplyId(ticketId);
    try {
      await apiRequest(`/api/tickets/${ticketId}/reply`, {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      setReplyDrafts((prev) => ({ ...prev, [ticketId]: '' }));
      await onRefreshAll();
      onNotify('Reply sent.');
    } catch (err: any) {
      onNotify(err.message || 'Failed to send reply', true);
    } finally {
      setSendingReplyId(null);
    }
  }

  return (
    <div className="space-y-8">
      {/* Current Subscription & Payment Status Card */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="text-xs font-medium text-slate-400">Current Wi-Fi Subscription</div>
            <h1 className="text-2xl font-bold text-slate-100 mt-1">
              {currentPlan ? currentPlan.name : 'No Plan Selected'}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {user.status === 'suspended' ? (
                <span className="text-red-400 font-medium">
                  Account Suspended — Please settle your balance or contact support below.
                </span>
              ) : currentPlan ? (
                <span>
                  Active Speed: <strong className="font-mono text-slate-200">{currentPlan.speedMbps} Mbps</strong> · Billing Cycle: {currentPlan.durationDays} days
                </span>
              ) : (
                <span>Pick a Wi-Fi plan below to activate your internet connection.</span>
              )}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:text-right">
            <div>
              <div className="text-xs text-slate-400">Plan Price</div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-100 mt-0.5">
                {currentPlan ? formatKes(currentPlan.priceKes) : 'KES 0'}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-400">Exact Next Payment Date (Nairobi)</div>
              <div className="text-base font-semibold font-mono tabular-nums text-sky-400 mt-1">
                {formatNairobiDateTime(user.nextPaymentDate)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {activeTab === 'overview' && (
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-slate-100">Available Wi-Fi Plans</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Select or switch your Wi-Fi package. Your next payment date is calculated automatically upon activation.
            </p>
          </div>

          {plans.length === 0 ? (
            <div className="py-12 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
              <Wifi className="w-8 h-8 text-slate-500 mx-auto mb-2" />
              <h3 className="text-sm font-medium text-slate-200">No Wi-Fi Plans Available Yet</h3>
              <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                The administrator has not published any Wi-Fi plans yet. Please check back shortly.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan) => {
                const isCurrent = user.planId === plan.id;
                return (
                  <div
                    key={plan.id}
                    className={`border rounded-xl p-6 flex flex-col justify-between transition-colors ${
                      isCurrent
                        ? 'border-sky-500 bg-sky-950/20'
                        : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-lg font-semibold text-slate-100">{plan.name}</h3>
                        <span className="font-mono text-sm font-semibold text-sky-400 tabular-nums">
                          {plan.speedMbps} Mbps
                        </span>
                      </div>

                      <div className="mt-4 flex items-baseline gap-1">
                        <span className="text-2xl font-bold font-mono tabular-nums text-slate-100">
                          {formatKes(plan.priceKes)}
                        </span>
                        <span className="text-xs text-slate-400">/ {plan.durationDays} days</span>
                      </div>

                      {plan.description && (
                        <p className="text-sm text-slate-400 mt-3 leading-relaxed">
                          {plan.description}
                        </p>
                      )}
                    </div>

                    <div className="mt-6 pt-4 border-t border-slate-800">
                      <button
                        type="button"
                        disabled={selectingPlanId === plan.id || user.status === 'suspended'}
                        onClick={() => handleSelectPlan(plan)}
                        className={`w-full px-4 py-2 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                          isCurrent
                            ? 'bg-slate-800 text-slate-100 border border-slate-700 hover:bg-slate-700'
                            : 'bg-sky-600 text-white hover:bg-sky-500'
                        } disabled:opacity-50`}
                      >
                        {selectingPlanId === plan.id
                          ? 'Activating...'
                          : isCurrent
                          ? 'Renew / Reset Cycle'
                          : 'Select This Plan'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Report Issue Form */}
          <section className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-100">Report an Issue</h2>
            <p className="text-sm text-slate-400 mt-0.5 mb-5">
              Experiencing slow speeds, router drops, or billing questions? Message the admin directly.
            </p>

            <form onSubmit={handleSubmitIssue} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Intermittent connection in Apartment 4B"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Issue Details
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Describe what you are experiencing..."
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>

              <button
                type="submit"
                disabled={submittingIssue}
                className="px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {submittingIssue ? 'Submitting...' : 'Submit Issue'}
              </button>
            </form>
          </section>

          {/* My Tickets & Admin Replies */}
          <section className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6">
            <h2 className="text-lg font-semibold text-slate-100 mb-1">
              Your Support History &amp; Replies ({tickets.length})
            </h2>
            <p className="text-sm text-slate-400 mb-5">
              View admin responses and follow up on open issues
            </p>

            {tickets.length === 0 ? (
              <div className="py-12 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
                <MessageSquare className="w-8 h-8 text-slate-500 mx-auto mb-2" />
                <h3 className="text-sm font-medium text-slate-200">No Reported Issues</h3>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                  When you submit a support request, admin replies will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-5">
                {tickets.map((ticket) => (
                  <div
                    key={ticket.id}
                    className="border border-slate-800 bg-slate-950/40 rounded-lg p-5 space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-base font-semibold text-slate-100">{ticket.subject}</h3>
                      <span className="text-xs text-slate-400 font-mono">
                        {formatNairobiDateTime(ticket.createdAt)} · Status: {ticket.status}
                      </span>
                    </div>

                    <p className="text-sm text-slate-200 bg-slate-900 p-3 rounded-lg border border-slate-800">
                      {ticket.message}
                    </p>

                    {ticket.replies.length > 0 && (
                      <div className="space-y-2.5 pl-4 border-l border-slate-700 pt-1">
                        {ticket.replies.map((reply) => (
                          <div key={reply.id} className="text-sm">
                            <div className="text-xs text-slate-400">
                              <span className="font-semibold text-slate-200">
                                {reply.senderRole === 'admin' ? 'Admin Support' : reply.senderName}
                              </span>
                              <span aria-hidden="true"> · </span>
                              <span className="font-mono">
                                {formatNairobiDateTime(reply.createdAt)}
                              </span>
                            </div>
                            <p className="text-slate-300 mt-0.5">{reply.message}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {ticket.status !== 'closed' && (
                      <div className="flex items-center gap-2 pt-2">
                        <input
                          type="text"
                          placeholder="Add a follow-up message..."
                          value={replyDrafts[ticket.id] || ''}
                          onChange={(e) =>
                            setReplyDrafts((prev) => ({
                              ...prev,
                              [ticket.id]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleSendCustomerReply(ticket.id);
                            }
                          }}
                          className="flex-1 px-3 py-1.5 text-sm bg-slate-900 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleSendCustomerReply(ticket.id)}
                          disabled={sendingReplyId === ticket.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Reply
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
