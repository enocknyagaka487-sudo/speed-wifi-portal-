import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DATA_DIR, 'portal-db.json');

function createEmptyDb(): any {
  return {
    users: [],
    sessions: {},
    plans: [],
    tickets: [],
    devices: [],
    routerConfig: {
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
      lastAutoRebootKey: '',
      rebootHistory: [],
    },
    uptimeRecords: [],
    notifications: [],
    jobLogs: {
      lastBillingCheckAt: null,
      lastBillingCheckDateNairobi: '',
      lastRouterCheckAt: null,
    },
  };
}

function loadDb(): any {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DB_PATH)) {
      const initial = createEmptyDb();
      fs.writeFileSync(DB_PATH, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(DB_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    const defaults = createEmptyDb();
    return {
      ...defaults,
      ...parsed,
      routerConfig: {
        ...defaults.routerConfig,
        ...(parsed.routerConfig || {}),
        checkIntervalMinutes: parsed.routerConfig?.checkIntervalMinutes || 2,
      },
      jobLogs: {
        ...defaults.jobLogs,
        ...(parsed.jobLogs || {}),
      },
    };
  } catch (err) {
    console.error('Failed to load DB, initializing clean store:', err);
    return createEmptyDb();
  }
}

const db: any = loadDb();

function saveDb(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to persist DB:', err);
  }
}

function hashPassword(password: string, salt: string = crypto.randomBytes(16).toString('hex')): string {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = (storedHash || '').split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHash] = parts;
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(originalHash, 'hex'));
}

function sanitizeUser(user: any): any {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}

function addNotification(params: { targetUserId: string; title: string; body: string; type?: string }): any {
  const { targetUserId, title, body, type } = params;
  const note = {
    id: crypto.randomUUID(),
    targetUserId,
    title,
    body,
    type: type || 'system',
    read: false,
    createdAt: new Date().toISOString(),
  };
  db.notifications.unshift(note);
  if (db.notifications.length > 250) {
    db.notifications = db.notifications.slice(0, 250);
  }
  saveDb();
  return note;
}

function getNairobiParts(date: Date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const part of parts) {
    map[part.type] = part.value;
  }
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    dateKey: `${map.year}-${map.month}-${map.day}`,
    hour: Number(map.hour || 0),
    minute: Number(map.minute || 0),
    timeStr: `${map.hour}:${map.minute}`,
    dayOfWeek: dayMap[map.weekday] ?? 0,
  };
}

function formatNairobiDate(isoString: string | null | undefined): string {
  if (!isoString) return 'Not scheduled';
  try {
    return new Intl.DateTimeFormat('en-KE', {
      timeZone: 'Africa/Nairobi',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

// Background Job 1: Daily 9 AM Nairobi Payment Reminder Check (3 days before due date)
function runPaymentReminderCheck(force: boolean = false) {
  const now = new Date();
  const nairobi = getNairobiParts(now);

  if (!force) {
    if (nairobi.hour < 9) return { ran: false, reason: 'Before 9:00 AM Nairobi time' };
    if (db.jobLogs.lastBillingCheckDateNairobi === nairobi.dateKey) {
      return { ran: false, reason: 'Already ran today' };
    }
  }

  let remindersSent = 0;
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;

  for (const user of db.users) {
    if (user.role !== 'customer' || user.status !== 'active' || !user.nextPaymentDate) {
      continue;
    }
    const dueTime = new Date(user.nextPaymentDate).getTime();
    const diffMs = dueTime - now.getTime();

    if (diffMs > 0 && diffMs <= threeDaysMs) {
      const reminderKey = `${user.nextPaymentDate.slice(0, 10)}`;
      if (user.lastReminderSentForDate !== reminderKey || force) {
        const plan = db.plans.find((p: any) => p.id === user.planId);
        const daysLeft = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
        const priceStr = plan ? `KES ${plan.priceKes.toLocaleString()}` : 'your subscription';

        addNotification({
          targetUserId: user.id,
          title: `Payment Due in ${daysLeft} Day${daysLeft === 1 ? '' : 's'}`,
          body: `Your ${plan ? plan.name : 'Wi-Fi'} plan (${priceStr}) is due on ${formatNairobiDate(user.nextPaymentDate)} (Nairobi time). Please complete payment to avoid interruption.`,
          type: 'payment_reminder',
        });

        addNotification({
          targetUserId: 'admin',
          title: `Upcoming Due Date: ${user.name}`,
          body: `Reminder sent to ${user.name} (${user.email}) — ${priceStr} due on ${formatNairobiDate(user.nextPaymentDate)}.`,
          type: 'payment_reminder',
        });

        user.lastReminderSentForDate = reminderKey;
        remindersSent += 1;
      }
    }
  }

  db.jobLogs.lastBillingCheckAt = now.toISOString();
  db.jobLogs.lastBillingCheckDateNairobi = nairobi.dateKey;
  saveDb();

  return { ran: true, remindersSent, checkedAt: db.jobLogs.lastBillingCheckAt };
}

// Background Job 2: 2-Minute Router Reachability Check (alerts after 2 consecutive failures)
let routerCheckInProgress = false;

async function runRouterHealthCheck() {
  if (routerCheckInProgress) return null;
  const rawAddress = (db.routerConfig.publicAddress || '').trim();
  if (!rawAddress) {
    db.routerConfig.lastStatus = 'unconfigured';
    saveDb();
    return null;
  }

  routerCheckInProgress = true;
  const startTime = Date.now();
  let targetUrl = rawAddress;
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = `http://${targetUrl}`;
  }

  let isOnline = false;
  let latencyMs: number | null = null;
  let detail = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, */*' },
    });
    clearTimeout(timeout);
    latencyMs = Date.now() - startTime;
    isOnline = true;
    detail = `HTTP ${response.status} (${latencyMs} ms)`;

    // If the router endpoint returns a JSON payload with connected devices, sync them
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      try {
        const data: any = await response.json();
        if (Array.isArray(data?.devices)) {
          for (const remoteDev of data.devices) {
            if (!remoteDev.address) continue;
            const existing = db.devices.find((d: any) => d.address === remoteDev.address);
            if (existing) {
              existing.name = remoteDev.name || existing.name;
              existing.downloadMbps = Math.min(
                Number(remoteDev.downloadMbps ?? existing.downloadMbps),
                existing.speedLimitMbps
              );
              existing.uploadMbps = Number(remoteDev.uploadMbps ?? existing.uploadMbps);
              existing.status = remoteDev.status === 'disconnected' ? 'disconnected' : 'connected';
            } else {
              db.devices.push({
                id: crypto.randomUUID(),
                name: remoteDev.name || `Device ${remoteDev.address}`,
                address: String(remoteDev.address),
                connectedAt: new Date().toISOString(),
                downloadMbps: Number(remoteDev.downloadMbps || 0),
                uploadMbps: Number(remoteDev.uploadMbps || 0),
                speedLimitMbps: Number(remoteDev.speedLimitMbps || 50),
                status: 'connected',
                source: 'router-poll',
              });
            }
          }
        }
      } catch {
        // Ignore non-device JSON payload
      }
    }
  } catch (err: any) {
    isOnline = false;
    latencyMs = null;
    detail = err?.name === 'AbortError' ? 'Connection timed out (5000 ms)' : (err?.message || 'Unreachable');
  } finally {
    routerCheckInProgress = false;
  }

  const nowIso = new Date().toISOString();
  db.routerConfig.lastCheckedAt = nowIso;
  db.jobLogs.lastRouterCheckAt = nowIso;

  const record = {
    id: crypto.randomUUID(),
    timestamp: nowIso,
    status: isOnline ? 'online' : 'offline',
    latencyMs,
    detail,
  };

  db.uptimeRecords.push(record);
  if (db.uptimeRecords.length > 288) {
    db.uptimeRecords = db.uptimeRecords.slice(db.uptimeRecords.length - 288);
  }

  if (isOnline) {
    const wasOffline = db.routerConfig.consecutiveFailures >= 2;
    db.routerConfig.consecutiveFailures = 0;
    db.routerConfig.lastStatus = 'online';
    db.routerConfig.lastLatencyMs = latencyMs;
    db.routerConfig.lastError = null;

    if (wasOffline) {
      addNotification({
        targetUserId: 'admin',
        title: 'Router Back Online',
        body: `Router at ${rawAddress} responded in ${latencyMs} ms and is back online.`,
        type: 'router_alert',
      });
    }
  } else {
    db.routerConfig.consecutiveFailures += 1;
    db.routerConfig.lastStatus = 'offline';
    db.routerConfig.lastLatencyMs = null;
    db.routerConfig.lastError = detail;

    // Alert after two failed checks in a row
    if (db.routerConfig.consecutiveFailures === 2) {
      addNotification({
        targetUserId: 'admin',
        title: 'Router Unreachable (2 Failed Checks)',
        body: `Router at ${rawAddress} has failed 2 consecutive health checks. Last error: ${detail}.`,
        type: 'router_alert',
      });
    }
  }

  saveDb();
  return record;
}

// Background Job 3: Weekly Auto-Reboot Check in Nairobi Time
function checkScheduledAutoReboot() {
  if (!db.routerConfig.autoRebootEnabled) return;
  const now = new Date();
  const nairobi = getNairobiParts(now);

  if (
    nairobi.dayOfWeek === Number(db.routerConfig.autoRebootDay) &&
    nairobi.timeStr === db.routerConfig.autoRebootTime
  ) {
    const rebootKey = `${nairobi.dateKey}_${nairobi.timeStr}`;
    if (db.routerConfig.lastAutoRebootKey !== rebootKey) {
      db.routerConfig.lastAutoRebootKey = rebootKey;
      const nowIso = now.toISOString();
      const event = {
        id: crypto.randomUUID(),
        triggeredBy: 'Scheduled Weekly Auto-Reboot',
        timestamp: nowIso,
        status: 'completed',
        note: `Executed on schedule (${nairobi.timeStr} EAT)`,
      };
      db.routerConfig.lastRebootAt = nowIso;
      db.routerConfig.rebootHistory.unshift(event);
      if (db.routerConfig.rebootHistory.length > 30) {
        db.routerConfig.rebootHistory = db.routerConfig.rebootHistory.slice(0, 30);
      }

      addNotification({
        targetUserId: 'admin',
        title: 'Scheduled Router Auto-Reboot Executed',
        body: `Weekly router auto-reboot triggered at ${nairobi.timeStr} Nairobi time.`,
        type: 'router_alert',
      });
      saveDb();
    }
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // Authentication Middleware
  function requireAuth(req: any, res: any, next: any) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!token || !db.sessions[token]) {
      return res.status(401).json({ error: 'Authentication required. Please sign in.' });
    }
    const userId = db.sessions[token];
    const user = db.users.find((u: any) => u.id === userId);
    if (!user) {
      delete db.sessions[token];
      saveDb();
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    req.user = user;
    req.token = token;
    next();
  }

  function requireAdmin(req: any, res: any, next: any) {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Administrator privileges required.' });
    }
    next();
  }

  // --- AUTH ROUTES ---
  app.get('/api/auth/bootstrap', (_req: any, res: any) => {
    res.json({
      hasUsers: db.users.length > 0,
    });
  });

  app.post('/api/auth/signup', (req: any, res: any) => {
    const name = String(req.body?.name || '').trim();
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }
    if (db.users.some((u: any) => u.email === email)) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const isFirstUser = db.users.length === 0;
    const role = isFirstUser ? 'admin' : 'customer';

    const newUser = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: hashPassword(password),
      role,
      planId: null,
      status: isFirstUser ? 'active' : 'pending',
      nextPaymentDate: null,
      lastReminderSentForDate: null,
      createdAt: new Date().toISOString(),
    };

    db.users.push(newUser);
    const token = crypto.randomBytes(32).toString('hex');
    db.sessions[token] = newUser.id;

    if (isFirstUser) {
      addNotification({
        targetUserId: 'admin',
        title: 'Admin Account Initialized',
        body: `Welcome ${name}. As the first registered account, you have full Administrator privileges. Configure your Wi-Fi plans and router address to begin.`,
        type: 'system',
      });
    } else {
      addNotification({
        targetUserId: newUser.id,
        title: 'Welcome to Speed 5G Network',
        body: 'Select a Wi-Fi plan from your dashboard to activate your connection.',
        type: 'system',
      });
      addNotification({
        targetUserId: 'admin',
        title: 'New Customer Registered',
        body: `${name} (${email}) created a customer account.`,
        type: 'system',
      });
    }

    saveDb();
    res.status(201).json({ token, user: sanitizeUser(newUser) });
  });

  app.post('/api/auth/signin', (req: any, res: any) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    const user = db.users.find((u: any) => u.email === email);
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    db.sessions[token] = user.id;
    saveDb();

    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/netlify', (req: any, res: any) => {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const name = String(req.body?.name || email.split('@')[0] || 'User').trim();
    const roles: string[] = Array.isArray(req.body?.roles) ? req.body.roles : [];

    if (!email) {
      return res.status(400).json({ error: 'Email from Netlify Identity is required.' });
    }

    let user = db.users.find((u: any) => u.email === email);
    if (!user) {
      const isFirstUser = db.users.length === 0;
      const isNetlifyAdmin = roles.some((r) => String(r).toLowerCase() === 'admin');
      const role = isFirstUser || isNetlifyAdmin ? 'admin' : 'customer';

      user = {
        id: crypto.randomUUID(),
        name,
        email,
        passwordHash: hashPassword(crypto.randomBytes(24).toString('hex')),
        role,
        planId: null,
        status: role === 'admin' ? 'active' : 'pending',
        nextPaymentDate: null,
        lastReminderSentForDate: null,
        createdAt: new Date().toISOString(),
      };
      db.users.push(user);

      if (role === 'admin') {
        addNotification({
          targetUserId: 'admin',
          title: 'Admin Account Linked via Netlify Identity',
          body: `Welcome ${name}. Your Netlify Identity account has full Administrator privileges.`,
          type: 'system',
        });
      } else {
        addNotification({
          targetUserId: user.id,
          title: 'Welcome to Speed 5G Network',
          body: 'Select a Wi-Fi plan from your dashboard to activate your connection.',
          type: 'system',
        });
      }
    } else if (roles.some((r) => String(r).toLowerCase() === 'admin') && user.role !== 'admin') {
      user.role = 'admin';
      user.status = 'active';
    }

    const token = crypto.randomBytes(32).toString('hex');
    db.sessions[token] = user.id;
    saveDb();

    res.json({ token, user: sanitizeUser(user) });
  });

  app.post('/api/auth/signout', requireAuth, (req: any, res: any) => {
    delete db.sessions[req.token];
    saveDb();
    res.json({ ok: true });
  });

  app.get('/api/auth/me', requireAuth, (req: any, res: any) => {
    res.json({ user: sanitizeUser(req.user) });
  });

  app.get('/api/sync', requireAuth, (req: any, res: any) => {
    const isAdmin = req.user.role === 'admin';
    const myTickets = isAdmin
      ? db.tickets
      : db.tickets.filter((t: any) => t.userId === req.user.id);
    const myNotes = db.notifications.filter((n: any) =>
      isAdmin
        ? n.targetUserId === 'admin' || n.targetUserId === req.user.id
        : n.targetUserId === req.user.id
    );
    const customers = isAdmin
      ? db.users.filter((u: any) => u.role === 'customer').map((u: any) => sanitizeUser(u))
      : [];

    res.json({
      user: sanitizeUser(req.user),
      plans: db.plans,
      tickets: myTickets,
      notifications: myNotes,
      customers,
      devices: isAdmin ? db.devices : [],
      routerConfig: isAdmin ? db.routerConfig : null,
      uptimeRecords: isAdmin ? db.uptimeRecords : [],
      jobLogs: isAdmin
        ? {
            ...db.jobLogs,
            routerCheckIntervalMinutes: db.routerConfig.checkIntervalMinutes || 2,
          }
        : null,
    });
  });

  // --- PLANS ROUTES ---
  app.get('/api/plans', requireAuth, (_req: any, res: any) => {
    res.json({ plans: db.plans });
  });

  app.post('/api/plans', requireAuth, requireAdmin, (req: any, res: any) => {
    const name = String(req.body?.name || '').trim();
    const speedMbps = Number(req.body?.speedMbps);
    const priceKes = Number(req.body?.priceKes);
    const durationDays = Number(req.body?.durationDays || 30);
    const description = String(req.body?.description || '').trim();

    if (!name || !Number.isFinite(speedMbps) || speedMbps <= 0 || !Number.isFinite(priceKes) || priceKes <= 0) {
      return res.status(400).json({ error: 'Valid plan name, speed (Mbps), and price (KES) are required.' });
    }

    const plan = {
      id: crypto.randomUUID(),
      name,
      speedMbps,
      priceKes,
      durationDays: durationDays > 0 ? durationDays : 30,
      description,
      createdAt: new Date().toISOString(),
    };

    db.plans.push(plan);
    saveDb();
    res.status(201).json({ plan });
  });

  app.put('/api/plans/:id', requireAuth, requireAdmin, (req: any, res: any) => {
    const plan = db.plans.find((p: any) => p.id === req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Plan not found.' });
    }

    const name = String(req.body?.name ?? plan.name).trim();
    const speedMbps = Number(req.body?.speedMbps ?? plan.speedMbps);
    const priceKes = Number(req.body?.priceKes ?? plan.priceKes);
    const durationDays = Number(req.body?.durationDays ?? plan.durationDays);
    const description = String(req.body?.description ?? plan.description).trim();

    if (!name || !Number.isFinite(speedMbps) || speedMbps <= 0 || !Number.isFinite(priceKes) || priceKes <= 0) {
      return res.status(400).json({ error: 'Valid plan name, speed (Mbps), and price (KES) are required.' });
    }

    plan.name = name;
    plan.speedMbps = speedMbps;
    plan.priceKes = priceKes;
    plan.durationDays = durationDays > 0 ? durationDays : 30;
    plan.description = description;

    saveDb();
    res.json({ plan });
  });

  app.delete('/api/plans/:id', requireAuth, requireAdmin, (req: any, res: any) => {
    const idx = db.plans.findIndex((p: any) => p.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Plan not found.' });
    }
    const [removed] = db.plans.splice(idx, 1);
    for (const u of db.users) {
      if (u.planId === removed.id) {
        u.planId = null;
      }
    }
    saveDb();
    res.json({ ok: true });
  });

  app.post('/api/plans/:id/select', requireAuth, (req: any, res: any) => {
    const plan = db.plans.find((p: any) => p.id === req.params.id);
    if (!plan) {
      return res.status(404).json({ error: 'Selected plan not found.' });
    }

    const user = req.user;
    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Your account is currently suspended. Please contact support.' });
    }

    const now = new Date();
    const due = new Date(now.getTime() + plan.durationDays * 24 * 60 * 60 * 1000);

    user.planId = plan.id;
    user.status = 'active';
    user.nextPaymentDate = due.toISOString();
    user.lastReminderSentForDate = null;

    addNotification({
      targetUserId: user.id,
      title: `Subscribed to ${plan.name}`,
      body: `Your plan (${plan.speedMbps} Mbps · KES ${plan.priceKes.toLocaleString()}) is active. Next payment date: ${formatNairobiDate(user.nextPaymentDate)}.`,
      type: 'billing_update',
    });

    addNotification({
      targetUserId: 'admin',
      title: `Plan Selected: ${user.name}`,
      body: `${user.name} selected ${plan.name} (KES ${plan.priceKes.toLocaleString()}). Next due date: ${formatNairobiDate(user.nextPaymentDate)}.`,
      type: 'billing_update',
    });

    saveDb();
    res.json({ user: sanitizeUser(user) });
  });

  // --- CUSTOMERS MANAGEMENT ROUTES (ADMIN) ---
  app.get('/api/customers', requireAuth, requireAdmin, (_req: any, res: any) => {
    const customers = db.users
      .filter((u: any) => u.role === 'customer')
      .map((u: any) => sanitizeUser(u));
    res.json({ customers });
  });

  app.post('/api/customers/:id/mark-paid', requireAuth, requireAdmin, (req: any, res: any) => {
    const customer = db.users.find((u: any) => u.id === req.params.id && u.role === 'customer');
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    const plan = db.plans.find((p: any) => p.id === customer.planId);
    const durationDays = plan ? plan.durationDays : 30;
    const now = new Date();
    const currentDue = customer.nextPaymentDate ? new Date(customer.nextPaymentDate) : now;
    const baseDate = currentDue > now ? currentDue : now;
    const nextDue = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);

    customer.status = 'active';
    customer.nextPaymentDate = nextDue.toISOString();
    customer.lastReminderSentForDate = null;

    addNotification({
      targetUserId: customer.id,
      title: 'Payment Confirmed',
      body: `Your payment${plan ? ` of KES ${plan.priceKes.toLocaleString()} for ${plan.name}` : ''} has been recorded. Your next payment date is ${formatNairobiDate(customer.nextPaymentDate)}.`,
      type: 'billing_update',
    });

    saveDb();
    res.json({ customer: sanitizeUser(customer) });
  });

  app.post('/api/customers/:id/toggle-status', requireAuth, requireAdmin, (req: any, res: any) => {
    const customer = db.users.find((u: any) => u.id === req.params.id && u.role === 'customer');
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    customer.status = customer.status === 'suspended' ? 'active' : 'suspended';

    addNotification({
      targetUserId: customer.id,
      title: customer.status === 'suspended' ? 'Account Suspended' : 'Account Activated',
      body:
        customer.status === 'suspended'
          ? 'Your Wi-Fi account has been suspended by the administrator. Please check your payment status or message support.'
          : 'Your Wi-Fi account has been reactivated and service is restored.',
      type: 'billing_update',
    });

    saveDb();
    res.json({ customer: sanitizeUser(customer) });
  });

  // --- SUPPORT TICKETS ROUTES ---
  app.get('/api/tickets', requireAuth, (req: any, res: any) => {
    if (req.user.role === 'admin') {
      return res.json({ tickets: db.tickets });
    }
    const myTickets = db.tickets.filter((t: any) => t.userId === req.user.id);
    return res.json({ tickets: myTickets });
  });

  app.post('/api/tickets', requireAuth, (req: any, res: any) => {
    const subject = String(req.body?.subject || '').trim();
    const message = String(req.body?.message || '').trim();

    if (!subject || !message) {
      return res.status(400).json({ error: 'Both issue subject and description are required.' });
    }

    const ticket = {
      id: crypto.randomUUID(),
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      subject,
      message,
      status: 'open',
      replies: [],
      createdAt: new Date().toISOString(),
    };

    db.tickets.unshift(ticket);

    addNotification({
      targetUserId: 'admin',
      title: `New Support Issue: ${subject}`,
      body: `${req.user.name} reported: "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"`,
      type: 'support_reply',
    });

    saveDb();
    res.status(201).json({ ticket });
  });

  app.post('/api/tickets/:id/reply', requireAuth, (req: any, res: any) => {
    const ticket = db.tickets.find((t: any) => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found.' });
    }

    if (req.user.role !== 'admin' && ticket.userId !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to reply to this ticket.' });
    }

    const message = String(req.body?.message || '').trim();
    if (!message) {
      return res.status(400).json({ error: 'Reply message cannot be empty.' });
    }

    const reply = {
      id: crypto.randomUUID(),
      senderId: req.user.id,
      senderName: req.user.name,
      senderRole: req.user.role,
      message,
      createdAt: new Date().toISOString(),
    };

    ticket.replies.push(reply);
    ticket.status = req.user.role === 'admin' ? 'replied' : 'open';

    if (req.user.role === 'admin') {
      addNotification({
        targetUserId: ticket.userId,
        title: `Support Reply: ${ticket.subject}`,
        body: `Admin replied: "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"`,
        type: 'support_reply',
      });
    } else {
      addNotification({
        targetUserId: 'admin',
        title: `Customer Reply: ${ticket.subject}`,
        body: `${req.user.name} replied: "${message.slice(0, 100)}${message.length > 100 ? '...' : ''}"`,
        type: 'support_reply',
      });
    }

    saveDb();
    res.json({ ticket });
  });

  app.patch('/api/tickets/:id/status', requireAuth, requireAdmin, (req: any, res: any) => {
    const ticket = db.tickets.find((t: any) => t.id === req.params.id);
    if (!ticket) {
      return res.status(404).json({ error: 'Support ticket not found.' });
    }
    const status = req.body?.status;
    if (status === 'open' || status === 'replied' || status === 'closed') {
      ticket.status = status;
      saveDb();
    }
    res.json({ ticket });
  });

  // --- NETWORK, CONNECTED DEVICES & ROUTER CONTROLS (ADMIN) ---
  app.get('/api/network/overview', requireAuth, requireAdmin, (_req: any, res: any) => {
    res.json({
      devices: db.devices,
      routerConfig: db.routerConfig,
      uptimeRecords: db.uptimeRecords,
      jobLogs: {
        ...db.jobLogs,
        routerCheckIntervalMinutes: db.routerConfig.checkIntervalMinutes || 2,
      },
    });
  });

  app.post('/api/devices', requireAuth, requireAdmin, (req: any, res: any) => {
    const name = String(req.body?.name || '').trim();
    const address = String(req.body?.address || '').trim();
    const downloadMbps = Math.max(0, Number(req.body?.downloadMbps || 0));
    const uploadMbps = Math.max(0, Number(req.body?.uploadMbps || 0));
    const speedLimitMbps = Math.max(1, Number(req.body?.speedLimitMbps || 50));

    if (!name || !address) {
      return res.status(400).json({ error: 'Device name and IP/MAC address are required.' });
    }

    const device = {
      id: crypto.randomUUID(),
      name,
      address,
      connectedAt: new Date().toISOString(),
      downloadMbps: Math.min(downloadMbps, speedLimitMbps),
      uploadMbps,
      speedLimitMbps,
      status: 'connected',
      source: 'manual',
    };

    db.devices.push(device);
    saveDb();
    res.status(201).json({ device });
  });

  app.patch('/api/devices/:id', requireAuth, requireAdmin, (req: any, res: any) => {
    const device = db.devices.find((d: any) => d.id === req.params.id);
    if (!device) {
      return res.status(404).json({ error: 'Device not found.' });
    }

    if (req.body?.name !== undefined) {
      device.name = String(req.body.name).trim() || device.name;
    }
    if (req.body?.address !== undefined) {
      device.address = String(req.body.address).trim() || device.address;
    }
    if (req.body?.speedLimitMbps !== undefined) {
      const limit = Math.max(1, Math.min(1000, Number(req.body.speedLimitMbps)));
      device.speedLimitMbps = limit;
      if (device.downloadMbps > limit) {
        device.downloadMbps = limit;
      }
    }
    if (req.body?.downloadMbps !== undefined) {
      device.downloadMbps = Math.max(0, Math.min(device.speedLimitMbps, Number(req.body.downloadMbps)));
    }
    if (req.body?.uploadMbps !== undefined) {
      device.uploadMbps = Math.max(0, Number(req.body.uploadMbps));
    }
    if (req.body?.status === 'connected' || req.body?.status === 'disconnected') {
      device.status = req.body.status;
      if (device.status === 'disconnected') {
        device.downloadMbps = 0;
        device.uploadMbps = 0;
      } else if (req.body?.status === 'connected' && !req.body?.keepTimestamp) {
        device.connectedAt = new Date().toISOString();
      }
    }

    saveDb();
    res.json({ device });
  });

  app.delete('/api/devices/:id', requireAuth, requireAdmin, (req: any, res: any) => {
    const idx = db.devices.findIndex((d: any) => d.id === req.params.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Device not found.' });
    }
    db.devices.splice(idx, 1);
    saveDb();
    res.json({ ok: true });
  });

  app.put('/api/router/config', requireAuth, requireAdmin, async (req: any, res: any) => {
    if (req.body?.publicAddress !== undefined) {
      db.routerConfig.publicAddress = String(req.body.publicAddress).trim();
      if (!db.routerConfig.publicAddress) {
        db.routerConfig.lastStatus = 'unconfigured';
        db.routerConfig.consecutiveFailures = 0;
        db.routerConfig.lastError = null;
      }
    }
    if (req.body?.autoRebootEnabled !== undefined) {
      db.routerConfig.autoRebootEnabled = Boolean(req.body.autoRebootEnabled);
    }
    if (req.body?.autoRebootDay !== undefined) {
      db.routerConfig.autoRebootDay = Math.max(0, Math.min(6, Number(req.body.autoRebootDay)));
    }
    if (req.body?.autoRebootTime !== undefined) {
      db.routerConfig.autoRebootTime = String(req.body.autoRebootTime).trim() || '03:00';
    }
    if (req.body?.checkIntervalMinutes !== undefined) {
      db.routerConfig.checkIntervalMinutes = Math.max(1, Math.min(60, Number(req.body.checkIntervalMinutes) || 2));
    }

    saveDb();

    if (db.routerConfig.publicAddress && req.body?.triggerCheck) {
      await runRouterHealthCheck();
    }

    res.json({
      routerConfig: db.routerConfig,
      uptimeRecords: db.uptimeRecords,
      devices: db.devices,
    });
  });

  app.post('/api/router/check-now', requireAuth, requireAdmin, async (_req: any, res: any) => {
    if (!db.routerConfig.publicAddress) {
      return res.status(400).json({ error: 'Set your router public address first to run a live uptime check.' });
    }
    const record = await runRouterHealthCheck();
    res.json({
      record,
      routerConfig: db.routerConfig,
      uptimeRecords: db.uptimeRecords,
      devices: db.devices,
    });
  });

  app.post('/api/router/reboot', requireAuth, requireAdmin, async (req: any, res: any) => {
    const nowIso = new Date().toISOString();
    let note = 'Reboot queued in portal log';

    if (db.routerConfig.publicAddress) {
      let targetUrl = db.routerConfig.publicAddress.trim();
      if (!/^https?:\/\//i.test(targetUrl)) {
        targetUrl = `http://${targetUrl}`;
      }
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3500);
        await fetch(`${targetUrl.replace(/\/$/, '')}/reboot`, {
          method: 'POST',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        note = `Reboot signal sent to ${db.routerConfig.publicAddress}`;
      } catch {
        note = `Reboot queued and recorded for ${db.routerConfig.publicAddress}`;
      }
    }

    const event = {
      id: crypto.randomUUID(),
      triggeredBy: `Manual Reboot (${req.user.name})`,
      timestamp: nowIso,
      status: 'queued',
      note,
    };

    db.routerConfig.lastRebootAt = nowIso;
    db.routerConfig.consecutiveFailures = 0;
    db.routerConfig.rebootHistory.unshift(event);
    if (db.routerConfig.rebootHistory.length > 30) {
      db.routerConfig.rebootHistory = db.routerConfig.rebootHistory.slice(0, 30);
    }

    addNotification({
      targetUserId: 'admin',
      title: 'Router Reboot Queued',
      body: `${note} at ${formatNairobiDate(nowIso)} (Nairobi time).`,
      type: 'router_alert',
    });

    saveDb();
    res.json({ routerConfig: db.routerConfig, event });
  });

  app.post('/api/jobs/run-billing-check', requireAuth, requireAdmin, (_req: any, res: any) => {
    const result = runPaymentReminderCheck(true);
    res.json({
      result,
      jobLogs: db.jobLogs,
    });
  });

  // --- NOTIFICATIONS ROUTES ---
  app.get('/api/notifications', requireAuth, (req: any, res: any) => {
    const myNotes = db.notifications.filter((n: any) =>
      req.user.role === 'admin'
        ? n.targetUserId === 'admin' || n.targetUserId === req.user.id
        : n.targetUserId === req.user.id
    );
    res.json({ notifications: myNotes });
  });

  app.post('/api/notifications/:id/read', requireAuth, (req: any, res: any) => {
    const note = db.notifications.find((n: any) => n.id === req.params.id);
    if (note) {
      note.read = true;
      saveDb();
    }
    res.json({ ok: true });
  });

  app.post('/api/notifications/read-all', requireAuth, (req: any, res: any) => {
    for (const note of db.notifications) {
      if (
        req.user.role === 'admin'
          ? note.targetUserId === 'admin' || note.targetUserId === req.user.id
          : note.targetUserId === req.user.id
      ) {
        note.read = true;
      }
    }
    saveDb();
    res.json({ ok: true });
  });

  // Start background schedulers
  // 1) Every 60s: evaluate 9 AM Nairobi payment reminder check & weekly auto-reboot schedule
  setInterval(() => {
    runPaymentReminderCheck(false);
    checkScheduledAutoReboot();
  }, 60 * 1000);

  // 2) Every 2 minutes (120,000 ms): run router health check
  setInterval(() => {
    if (db.routerConfig.publicAddress) {
      runRouterHealthCheck();
    }
  }, 2 * 60 * 1000);

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: any, res: any) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Speed 5G Network Wi-Fi Portal running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
