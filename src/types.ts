export type UserRole = 'admin' | 'customer';
export type CustomerStatus = 'active' | 'suspended' | 'pending';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  planId: string | null;
  status: CustomerStatus;
  nextPaymentDate: string | null;
  lastReminderSentForDate: string | null;
  createdAt: string;
}

export interface Plan {
  id: string;
  name: string;
  speedMbps: number;
  priceKes: number;
  durationDays: number;
  description: string;
  createdAt: string;
}

export interface TicketReply {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: UserRole;
  message: string;
  createdAt: string;
}

export interface SupportTicket {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  subject: string;
  message: string;
  status: 'open' | 'replied' | 'closed';
  replies: TicketReply[];
  createdAt: string;
}

export interface ConnectedDevice {
  id: string;
  name: string;
  address: string; // IP or MAC address
  connectedAt: string;
  downloadMbps: number;
  uploadMbps: number;
  speedLimitMbps: number;
  status: 'connected' | 'disconnected';
  source: 'manual' | 'router-poll';
}

export interface RebootEvent {
  id: string;
  triggeredBy: string;
  timestamp: string;
  status: 'queued' | 'completed';
  note: string;
}

export interface RouterConfig {
  publicAddress: string;
  checkIntervalMinutes: number;
  consecutiveFailures: number;
  lastCheckedAt: string | null;
  lastStatus: 'online' | 'offline' | 'unconfigured';
  lastLatencyMs: number | null;
  lastError: string | null;
  lastRebootAt: string | null;
  autoRebootEnabled: boolean;
  autoRebootDay: number; // 0 (Sunday) - 6 (Saturday)
  autoRebootTime: string; // "HH:MM" in Africa/Nairobi
  rebootHistory: RebootEvent[];
}

export interface UptimeRecord {
  id: string;
  timestamp: string;
  status: 'online' | 'offline';
  latencyMs: number | null;
  detail: string;
}

export interface AppNotification {
  id: string;
  targetUserId: string; // user.id or 'admin'
  title: string;
  body: string;
  type: 'payment_reminder' | 'router_alert' | 'support_reply' | 'billing_update' | 'system';
  read: boolean;
  createdAt: string;
}

export interface JobStatusSummary {
  lastBillingCheckAt: string | null;
  lastBillingCheckDateNairobi: string;
  lastRouterCheckAt: string | null;
  routerCheckIntervalMinutes: number;
}
