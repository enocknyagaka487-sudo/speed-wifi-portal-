# Speed 5G Network — Wi-Fi ISP Portal & Router Operations Console

A full-stack Wi-Fi ISP management portal and router monitoring console built with a clean light ISP aesthetic, localized for Kenyan Shillings (`KES`) and East Africa Time (`Africa/Nairobi`), starting with a completely clean database and zero demo data.

## User Review & Critical Decisions

> [!IMPORTANT]
> Please review the confirmed configuration choices below before we build the application.

- **Confirmed Currency & Timezone**: All plans, billing cycles, and payment reminders use **Kenyan Shillings (KES)** and **Nairobi Time (`Africa/Nairobi`, UTC+3)**, including the daily 9:00 AM payment reminder job.
- **Confirmed Device Population Strategy**: **Live router endpoint polling plus manual device entry** — the database starts with zero fake/demo records. Admins can set their router's public endpoint for live reachability/device polling and manually register client devices (name, IP/MAC address, bandwidth telemetry, and speed caps).
- **Confirmed Visual Aesthetic**: **Clean Light ISP Portal Theme** — crisp white and cool slate surfaces (`#FFFFFF` / `#F8FAFC`), high-contrast slate typography (`#0F172A`), ISP sky-blue primary actions (`#0284C7`), and semantic status indicators (`#16A34A` green for nominal/online, `#D97706` amber for due-soon warnings, `#DC2626` crimson for offline/overdue/high-load devices).
- **Zero Demo Data Policy**: The application initializes with an empty persistent store. No pre-populated plans, customers, tickets, devices, or uptime blocks are injected.

---

## 1. Overview & Core Concept

- **What It Does**: Provides a unified ISP portal where the first registered account automatically receives **Admin** privileges and all subsequent accounts register as **Customers**. Customers select Wi-Fi plans, track their next payment due date, receive 3-day advance payment notifications, and converse with support. Admins manage plans, track customer billing ("Mark Paid", "Suspend/Activate"), reply to support tickets, and operate the **Network & Router Controls** suite.
- **Target Audience / Persona**: Local Wi-Fi ISP operators and network administrators managing subscriber billing, bandwidth shaping, and router uptime alongside residential or business Wi-Fi subscribers.
- **Key Value**: Combines subscriber self-service billing and support with real-time network topology visualization, per-device bandwidth throttling sliders, 24-hour uptime block tracking, and automated Nairobi-time billing and router health alerts.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **First-Run Onboarding & Auth**:
   - User opens the portal and sees a clean sign-in / sign-up screen indicating whether the initial Admin account has been claimed.
   - Registering the first account grants the `admin` role and opens the Admin Console. Subsequent sign-ups grant the `customer` role and open the Customer Portal.
2. **Customer Portal Flow**:
   - **Overview & Plans**: Customer views their active subscription (plan name, speed in Mbps, price in KES, account status, and exact next payment date in `Africa/Nairobi` time) or picks from available plans published by the admin.
   - **Support Center**: Customer submits a new issue (subject + description) and reads admin replies in a threaded inbox.
   - **In-App Notifications (Bell Icon)**: Displays unread alerts, including automatic reminders sent 3 days prior to payment due dates and account status changes.
3. **Admin Console Flow**:
   - **Plans Management**: Create, edit, and delete Wi-Fi plans (title, speed in Mbps, duration in days, price in KES, notes).
   - **Customer Billing & Access**: Inspect registered customers, assigned plans, status (`Active`, `Suspended`, `No Plan`), and exact due dates. Clicking **Mark Paid** advances the customer's next payment due date by the plan duration; clicking **Suspend / Activate** toggles network access immediately.
   - **Support Inbox**: View all customer tickets, filter by open/resolved status, and send direct replies.
   - **Network & Router Tab**:
     - **Router Endpoint & Health**: Enter the router's public IP or HTTP URL for 5-minute automated reachability checks (plus a **Check Now** button).
     - **Visual Network Map**: Central router node surrounded by connected client devices. Devices with high bandwidth utilization ($\ge 75\%$ of their cap or $\ge 25\text{ Mbps}$) render larger and in crimson (`#DC2626`); normal devices render in emerald/sky.
     - **24-Hour Uptime Graph**: 24 hourly blocks (or recent probe slots) rendered in semantic green (`#16A34A` online), crimson (`#DC2626` failed check), or neutral slate (unprobed).
     - **Connected Devices Table**: Lists each device's name, IP/MAC address, connected duration, live up/down speed (`Mbps`), interactive **Speed-Limit Slider** (`1–200 Mbps`), and **Disconnect** button, plus an **Add Device** dialog for manual registration.
     - **Router Reboot Controls**: **Reboot Router Now** button (queues and logs a reboot event and calls the router webhook if configured) and a **Weekly Auto-Reboot Scheduler** (day-of-week selector + `HH:MM` time picker in Nairobi time).

### Visual Identity & Theme

- **Aesthetic Direction**: Utilitarian, high-clarity ISP operations workspace following a 60-30-10 light-mode color budget.
- **Color Palette & Mood**:
  - `--background`: `#F8FAFC` (Cool Alabaster 60% canvas)
  - `--surface`: `#FFFFFF` with `1px solid #E2E8F0` hairline borders (30% structural surface)
  - `--text-primary`: `#0F172A` (Deep Slate) and `--text-secondary`: `#475569`
  - `--primary`: `#0284C7` (ISP Sky Blue 10% action accent)
  - Semantic states always paired with explicit text labels: `#16A34A` (Online / Paid / Active), `#D97706` (Due Soon / Warning), `#DC2626` (Offline / Overdue / Busy Device / Suspended)
- **Typography & Hierarchy**:
  - *Display & Navigation*: `Plus Jakarta Sans` (SemiBold/Bold 600–700, `text-wrap: balance`)
  - *Body Prose*: `DM Sans` (Regular/Medium 400–500)
  - *Telemetry & Financial Numerals*: `JetBrains Mono` with `font-variant-numeric: tabular-nums` for KES prices, Mbps speeds, IP/MAC addresses, and timestamps.
- **Component Styling & Layout**:
  - Full-width 1440px desktop layout featuring a clean top bar (Brand wordmark on the left, section navigation tabs in the center, notification bell + user account action on the right).
  - Single-elevation flat cards (`border border-slate-200 bg-white rounded-xl p-6`) with zero nested card boxes and zero decorative pill badges on static metadata.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Persistent JSON File Store on the Express Backend**
  - *Chosen Approach*: Store users, password hashes, plans, subscriptions, support tickets, devices, router configuration, uptime logs, and notifications in a structured server-side JSON database (`data/portal-db.json`) initialized completely empty.
  - *Why*: Guarantees zero demo data on first boot, persists across server restarts without external cloud credentials, and supports background jobs natively in `server.ts`.
- **Decision 2: Real HTTP/TCP Router Probing + Webhook/Manual Device Hybrid**
  - *Chosen Approach*: When the admin configures a public router URL/IP in the Network tab, the backend performs real `fetch` reachability checks every 5 minutes (recording latency and HTTP status) and optionally polls a `/devices` JSON endpoint if supported by the router agent, while also allowing manual device registration and bandwidth adjustments in the UI.
  - *Why*: Bridges the gap between cloud-hosted web apps and physical routers without injecting fake demo devices.
- **Decision 3: Nairobi-Time Background Scheduler**
  - *Chosen Approach*: A server-side scheduler ticks every minute to evaluate `Africa/Nairobi` wall-clock time for the daily 9:00 AM payment reminder check (3 days before `nextPaymentDate`) and the weekly scheduled auto-reboot window, alongside a 5-minute interval for router uptime checks (alerting admin after 2 consecutive failures).

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

### Architecture & Component Diagram

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        React 19 Frontend (Client)                        │
│                                                                          │
│  ┌────────────────────┐   ┌───────────────────────────────────────────┐  │
│  │   Auth Gate View   │   │          Top Bar & Notification Bell      │  │
│  │ (Sign In / Sign Up)│   │  (Unread Count, Alert Drawer, Sign Out)   │  │
│  └─────────┬──────────┘   └─────────────────────┬─────────────────────┘  │
│            │                                    │                        │
│            ▼                                    ▼                        │
│  ┌────────────────────┐   ┌───────────────────────────────────────────┐  │
│  │  Customer Portal   │   │               Admin Console               │  │
│  │ ├─ Plan Selector   │   │ ├─ Plans CRUD Manager (KES)               │  │
│  │ ├─ Billing Status  │   │ ├─ Customers Table (Mark Paid / Suspend)  │  │
│  │ └─ Support Tickets │   │ ├─ Support Inbox & Reply Composer         │  │
│  └─────────┬──────────┘   │ └─ Network & Router Operations Tab        │  │
│            │              │     ├─ Radial Network Topology Map (SVG)  │  │
│            │              │     ├─ 24-Hour Uptime Block Graph         │  │
│            │              │     ├─ Connected Devices & Speed Sliders  │  │
│            │              │     └─ Router Endpoint & Reboot Scheduler │  │
│            └──────────────┴─────────────────────┬─────────────────────┘  │
└─────────────────────────────────────────────────┼────────────────────────┘
                                                  │ REST API (/api/*)
                                                  ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                     Express Backend (server.ts, Port 3000)               │
│                                                                          │
│  ┌────────────────────────┐  ┌───────────────────┐  ┌─────────────────┐  │
│  │ Auth & Role Middleware │  │ Background Jobs   │  │ Router Prober   │  │
│  │ (1st User = Admin,     │  │ ├─ 9 AM Nairobi   │  │ (HTTP/IP Fetch, │  │
│  │  Session Tokens)       │  │ │  3-Day Reminder │  │  2-Fail Alert,  │  │
│  └───────────┬────────────┘  │ ├─ 5-Min Uptime   │  │  Reboot Queue)  │  │
│              │               │ └─ Weekly Reboot  │  └────────┬────────┘  │
│              ▼               └─────────┬─────────┘           │           │
│  ┌─────────────────────────────────────┴─────────────────────┴────────┐  │
│  │             Persistent Server Store (data/portal-db.json)          │  │
│  │  users · plans · tickets · devices · routerConfig · uptime · notes │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────┘
```

### Data Model & State

- **`User`**: `id`, `name`, `email`, `passwordHash`, `role` (`'admin' | 'customer'`), `planId`, `status` (`'active' | 'suspended' | 'pending'`), `nextPaymentDate` (ISO timestamp), `lastReminderSentForDate`, `createdAt`.
- **`Plan`**: `id`, `name`, `speedMbps`, `priceKes`, `durationDays`, `description`, `createdAt`.
- **`SupportTicket`**: `id`, `userId`, `userName`, `userEmail`, `subject`, `message`, `status` (`'open' | 'replied' | 'closed'`), `replies` (`Array<{ id, senderRole, senderName, message, createdAt }>`), `createdAt`.
- **`ConnectedDevice`**: `id`, `name`, `address` (IP/MAC), `connectedAt`, `downloadMbps`, `uploadMbps`, `speedLimitMbps`, `status` (`'connected' | 'disconnected'`).
- **`RouterConfig`**: `publicAddress`, `consecutiveFailures`, `lastCheckedAt`, `lastStatus` (`'online' | 'offline' | 'unconfigured'`), `lastRebootAt`, `autoRebootEnabled`, `autoRebootDay` (`0–6`), `autoRebootTime` (`'HH:MM'` in Nairobi time), `rebootHistory` (`Array<{ id, triggeredBy, timestamp }>`).
- **`UptimeRecord`**: `id`, `timestamp`, `status` (`'online' | 'offline'`), `latencyMs`, `detail`.
- **`Notification`**: `id`, `userId` (`'admin'` or customer ID), `title`, `body`, `type` (`'payment_reminder' | 'router_alert' | 'support_reply' | 'system'`), `read`, `createdAt`.

### Interactive Component & State Mapping

- **Auth Gate**: Validates email/password, creates session token, and dynamically displays a notice when 0 users exist ("First account registered will be granted Admin access").
- **Customer Plan Selection**: Selecting a plan immediately assigns `planId`, sets `status = 'active'`, computes `nextPaymentDate` (+`durationDays` in `Africa/Nairobi`), and refreshes the billing summary card.
- **Admin Customer Actions**:
  - `Mark Paid`: Extends `nextPaymentDate` by the plan's `durationDays` (from today or current due date, whichever is later), sets `status = 'active'`, and sends a payment confirmation notification to the customer.
  - `Suspend / Activate`: Toggles customer `status` between `'active'` and `'suspended'` and dispatches a notification.
- **Network Topology Map & Devices Table**:
  - Adjusting the per-device **Speed-Limit Slider** updates `speedLimitMbps` via `PATCH /api/devices/:id` and immediately recalculates whether the device is in a busy/high-load state on the radial SVG map.
  - Clicking **Disconnect** (or **Reconnect**) toggles the device's connection state and removes/restores its active link on the network map.
  - Clicking **Reboot Router Now** records a reboot event via `POST /api/router/reboot`, resets transient failure counters, and appends an entry to the reboot log.
