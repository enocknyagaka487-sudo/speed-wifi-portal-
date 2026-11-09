import React, { useMemo, useState } from 'react';
import {
  Plus,
  Power,
  RefreshCw,
  Trash2,
  Wifi,
} from 'lucide-react';
import {
  ConnectedDevice,
  JobStatusSummary,
  RouterConfig,
  UptimeRecord,
} from '../types';
import {
  apiRequest,
  formatDurationConnected,
  formatNairobiDateTime,
} from '../api';

interface NetworkDashboardProps {
  devices: ConnectedDevice[];
  routerConfig: RouterConfig;
  uptimeRecords: UptimeRecord[];
  jobLogs: JobStatusSummary | null;
  onRefresh: () => Promise<void>;
  onNotify: (message: string, isError?: boolean) => void;
}

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
];

export function isDeviceBusy(device: ConnectedDevice): boolean {
  if (device.status !== 'connected') return false;
  const totalSpeed = device.downloadMbps + device.uploadMbps;
  const ratio = device.speedLimitMbps > 0 ? device.downloadMbps / device.speedLimitMbps : 0;
  return ratio >= 0.75 || totalSpeed >= 25;
}

export default function NetworkDashboard({
  devices,
  routerConfig,
  uptimeRecords,
  jobLogs,
  onRefresh,
  onNotify,
}: NetworkDashboardProps) {
  const [publicAddress, setPublicAddress] = useState(routerConfig.publicAddress || '');
  const [autoRebootEnabled, setAutoRebootEnabled] = useState(routerConfig.autoRebootEnabled);
  const [autoRebootDay, setAutoRebootDay] = useState(routerConfig.autoRebootDay ?? 0);
  const [autoRebootTime, setAutoRebootTime] = useState(routerConfig.autoRebootTime || '03:00');

  const [checkingRouter, setCheckingRouter] = useState(false);
  const [savingRouter, setSavingRouter] = useState(false);
  const [rebootingRouter, setRebootingRouter] = useState(false);

  // Local slider state for smooth dragging before committing
  const [sliderDrafts, setSliderDrafts] = useState<Record<string, number>>({});
  const [trafficDrafts, setTrafficDrafts] = useState<Record<string, { down: number; up: number }>>({});

  // Add device form state
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceAddress, setNewDeviceAddress] = useState('');
  const [newDeviceDown, setNewDeviceDown] = useState('12');
  const [newDeviceUp, setNewDeviceUp] = useState('4');
  const [newDeviceLimit, setNewDeviceLimit] = useState('50');
  const [addingDevice, setAddingDevice] = useState(false);

  // Sync local router config fields when parent refreshes
  React.useEffect(() => {
    setPublicAddress(routerConfig.publicAddress || '');
    setAutoRebootEnabled(routerConfig.autoRebootEnabled);
    setAutoRebootDay(routerConfig.autoRebootDay ?? 0);
    setAutoRebootTime(routerConfig.autoRebootTime || '03:00');
  }, [
    routerConfig.publicAddress,
    routerConfig.autoRebootEnabled,
    routerConfig.autoRebootDay,
    routerConfig.autoRebootTime,
  ]);

  // Compute 24 hourly blocks for the 24-hour Uptime Graph
  const hourlyUptimeBlocks = useMemo(() => {
    const now = Date.now();
    const hourMs = 60 * 60 * 1000;
    const blocks: Array<{
      hourIndex: number;
      startTime: Date;
      endTime: Date;
      label: string;
      status: 'online' | 'offline' | 'unprobed';
      onlineCount: number;
      offlineCount: number;
      avgLatencyMs: number | null;
      lastDetail: string;
    }> = [];

    for (let i = 23; i >= 0; i--) {
      const slotEnd = now - i * hourMs;
      const slotStart = slotEnd - hourMs;
      const inSlot = uptimeRecords.filter((r) => {
        const t = new Date(r.timestamp).getTime();
        return t > slotStart && t <= slotEnd;
      });

      const onlineRecs = inSlot.filter((r) => r.status === 'online');
      const offlineRecs = inSlot.filter((r) => r.status === 'offline');

      let status: 'online' | 'offline' | 'unprobed' = 'unprobed';
      if (inSlot.length > 0) {
        status = offlineRecs.length > 0 ? 'offline' : 'online';
      }

      const latencies = onlineRecs
        .map((r) => r.latencyMs)
        .filter((v): v is number => typeof v === 'number');
      const avgLatencyMs =
        latencies.length > 0
          ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
          : null;

      const labelFormatter = new Intl.DateTimeFormat('en-KE', {
        timeZone: 'Africa/Nairobi',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });

      blocks.push({
        hourIndex: 23 - i,
        startTime: new Date(slotStart),
        endTime: new Date(slotEnd),
        label: labelFormatter.format(new Date(slotEnd)),
        status,
        onlineCount: onlineRecs.length,
        offlineCount: offlineRecs.length,
        avgLatencyMs,
        lastDetail: inSlot.length > 0 ? inSlot[inSlot.length - 1].detail : 'No checks recorded in this hour',
      });
    }
    return blocks;
  }, [uptimeRecords]);

  const uptimeSummary = useMemo(() => {
    if (uptimeRecords.length === 0) return { percentage: null, totalChecks: 0 };
    const onlineCount = uptimeRecords.filter((r) => r.status === 'online').length;
    const pct = ((onlineCount / uptimeRecords.length) * 100).toFixed(1);
    return { percentage: pct, totalChecks: uptimeRecords.length };
  }, [uptimeRecords]);

  async function handleSaveRouterSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingRouter(true);
    try {
      await apiRequest('/api/router/config', {
        method: 'PUT',
        body: JSON.stringify({
          publicAddress: publicAddress.trim(),
          autoRebootEnabled,
          autoRebootDay: Number(autoRebootDay),
          autoRebootTime,
          checkIntervalMinutes: 2,
          triggerCheck: Boolean(publicAddress.trim()),
        }),
      });
      await onRefresh();
      onNotify(
        publicAddress.trim()
          ? 'Router settings saved and live uptime check completed.'
          : 'Router settings saved.'
      );
    } catch (err: any) {
      onNotify(err.message || 'Failed to save router settings', true);
    } finally {
      setSavingRouter(false);
    }
  }

  async function handleCheckRouterNow() {
    setCheckingRouter(true);
    try {
      await apiRequest('/api/router/check-now', { method: 'POST' });
      await onRefresh();
      onNotify('Router reachability check completed.');
    } catch (err: any) {
      onNotify(err.message || 'Router check failed', true);
    } finally {
      setCheckingRouter(false);
    }
  }

  async function handleRebootRouterNow() {
    setRebootingRouter(true);
    try {
      await apiRequest('/api/router/reboot', { method: 'POST' });
      await onRefresh();
      onNotify('Router reboot queued and recorded.');
    } catch (err: any) {
      onNotify(err.message || 'Failed to queue router reboot', true);
    } finally {
      setRebootingRouter(false);
    }
  }

  async function handleAddDevice(e: React.FormEvent) {
    e.preventDefault();
    if (!newDeviceName.trim() || !newDeviceAddress.trim()) {
      onNotify('Device name and IP/MAC address are required.', true);
      return;
    }
    setAddingDevice(true);
    try {
      await apiRequest('/api/devices', {
        method: 'POST',
        body: JSON.stringify({
          name: newDeviceName.trim(),
          address: newDeviceAddress.trim(),
          downloadMbps: Number(newDeviceDown) || 0,
          uploadMbps: Number(newDeviceUp) || 0,
          speedLimitMbps: Number(newDeviceLimit) || 50,
        }),
      });
      setNewDeviceName('');
      setNewDeviceAddress('');
      setNewDeviceDown('12');
      setNewDeviceUp('4');
      setNewDeviceLimit('50');
      setShowAddDevice(false);
      await onRefresh();
      onNotify('Device registered to network table.');
    } catch (err: any) {
      onNotify(err.message || 'Failed to add device', true);
    } finally {
      setAddingDevice(false);
    }
  }

  async function handleCommitSpeedLimit(device: ConnectedDevice, newLimit: number) {
    try {
      await apiRequest(`/api/devices/${device.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ speedLimitMbps: newLimit }),
      });
      await onRefresh();
      onNotify(`Speed limit for ${device.name} set to ${newLimit} Mbps.`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update speed limit', true);
    }
  }

  async function handleUpdateDeviceTraffic(device: ConnectedDevice, down: number, up: number) {
    try {
      await apiRequest(`/api/devices/${device.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ downloadMbps: down, uploadMbps: up }),
      });
      await onRefresh();
      onNotify(`Updated live speed readings for ${device.name}.`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to update device traffic', true);
    }
  }

  async function handleToggleDeviceConnection(device: ConnectedDevice) {
    const nextStatus = device.status === 'connected' ? 'disconnected' : 'connected';
    try {
      await apiRequest(`/api/devices/${device.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      await onRefresh();
      onNotify(
        nextStatus === 'disconnected'
          ? `${device.name} disconnected from router.`
          : `${device.name} reconnected to router.`
      );
    } catch (err: any) {
      onNotify(err.message || 'Failed to change device status', true);
    }
  }

  async function handleDeleteDevice(device: ConnectedDevice) {
    try {
      await apiRequest(`/api/devices/${device.id}`, { method: 'DELETE' });
      await onRefresh();
      onNotify(`Removed ${device.name} from device list.`);
    } catch (err: any) {
      onNotify(err.message || 'Failed to remove device', true);
    }
  }

  const connectedDevicesCount = devices.filter((d) => d.status === 'connected').length;
  const busyDevicesCount = devices.filter((d) => isDeviceBusy(d)).length;

  return (
    <div className="space-y-8">
      {/* Top Row: Visual Network Map + 24-Hour Uptime Graph */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Visual Network Map (7 columns) */}
        <section className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Visual Network Topology Map</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Router at center · Busy devices (&ge; 75% cap or &ge; 25 Mbps) enlarge and turn crimson
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-300 font-mono tabular-nums">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                Normal ({Math.max(0, connectedDevicesCount - busyDevicesCount)})
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3.5 h-3.5 rounded-full bg-red-500 inline-block" />
                Busy ({busyDevicesCount})
              </span>
            </div>
          </div>

          <div className="relative w-full h-[340px] bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center">
            <svg
              viewBox="0 0 640 340"
              className="w-full h-full select-none"
              role="img"
              aria-label="Network topology map with router in the center and connected devices around it"
            >
              {/* Subtle radial radar rings */}
              <circle
                cx="320"
                cy="170"
                r="75"
                fill="none"
                stroke="#1E293B"
                strokeWidth="1"
                strokeDasharray="4 4"
              />
              <circle
                cx="320"
                cy="170"
                r="130"
                fill="none"
                stroke="#1E293B"
                strokeWidth="1"
                strokeDasharray="4 4"
              />

              {/* Connection spokes from center router to each device */}
              {devices.map((device, index) => {
                const count = Math.max(1, devices.length);
                const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
                const radius = index % 2 === 0 ? 118 : 96;
                const x = 320 + Math.cos(angle) * radius * 1.45;
                const y = 170 + Math.sin(angle) * radius;
                const busy = isDeviceBusy(device);
                const isConnected = device.status === 'connected';

                return (
                  <g key={`link-${device.id}`}>
                    <line
                      x1="320"
                      y1="170"
                      x2={x}
                      y2={y}
                      stroke={!isConnected ? '#334155' : busy ? '#EF4444' : '#38BDF8'}
                      strokeWidth={!isConnected ? 1.5 : busy ? 3 : 2}
                      strokeDasharray={!isConnected ? '4 4' : undefined}
                      opacity={!isConnected ? 0.5 : 0.85}
                    />
                  </g>
                );
              })}

              {/* Center Router Node */}
              <g transform="translate(320, 170)">
                <circle
                  r="34"
                  fill={
                    routerConfig.lastStatus === 'offline'
                      ? '#450A0A'
                      : routerConfig.lastStatus === 'online'
                      ? '#082F49'
                      : '#0F172A'
                  }
                  stroke={
                    routerConfig.lastStatus === 'offline'
                      ? '#EF4444'
                      : routerConfig.lastStatus === 'online'
                      ? '#38BDF8'
                      : '#475569'
                  }
                  strokeWidth="2.5"
                />
                <text
                  y="-3"
                  textAnchor="middle"
                  className="fill-slate-100 font-semibold text-[11px]"
                >
                  CORE ROUTER
                </text>
                <text
                  y="12"
                  textAnchor="middle"
                  className="fill-slate-400 font-mono text-[9px]"
                >
                  {routerConfig.publicAddress
                    ? routerConfig.publicAddress.slice(0, 15)
                    : 'No IP set'}
                </text>
              </g>

              {/* Device Nodes */}
              {devices.map((device, index) => {
                const count = Math.max(1, devices.length);
                const angle = (index / count) * Math.PI * 2 - Math.PI / 2;
                const radius = index % 2 === 0 ? 118 : 96;
                const x = 320 + Math.cos(angle) * radius * 1.45;
                const y = 170 + Math.sin(angle) * radius;
                const busy = isDeviceBusy(device);
                const isConnected = device.status === 'connected';
                const nodeRadius = !isConnected ? 16 : busy ? 26 : 19;

                return (
                  <g key={device.id} transform={`translate(${x}, ${y})`}>
                    <circle
                      r={nodeRadius}
                      fill={!isConnected ? '#1E293B' : busy ? '#DC2626' : '#16A34A'}
                      stroke="#0B1120"
                      strokeWidth="2.5"
                    />
                    <text
                      y="3"
                      textAnchor="middle"
                      fill={!isConnected ? '#94A3B8' : '#FFFFFF'}
                      className="font-mono text-[9px] font-semibold"
                    >
                      {!isConnected
                        ? 'OFF'
                        : `${device.downloadMbps.toFixed(0)}M`}
                    </text>
                    <text
                      y={nodeRadius + 13}
                      textAnchor="middle"
                      className="fill-slate-200 font-medium text-[11px]"
                    >
                      {device.name.length > 16 ? `${device.name.slice(0, 15)}…` : device.name}
                    </text>
                    <text
                      y={nodeRadius + 24}
                      textAnchor="middle"
                      className="fill-slate-400 font-mono text-[9px]"
                    >
                      {device.address}
                    </text>
                  </g>
                );
              })}
            </svg>

            {devices.length === 0 && (
              <div className="absolute inset-x-0 bottom-3 flex justify-center pointer-events-none">
                <p className="text-xs text-slate-300 bg-slate-900/95 border border-slate-700 px-3 py-1.5 rounded-md">
                  No devices registered yet. Add a connected device below or set your router endpoint to sync.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* 24-Hour Uptime Graph & Live Probe Status (5 columns) */}
        <section className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-100">24-Hour Router Uptime</h2>
                <p className="text-sm text-slate-400 mt-0.5">
                  Automated check every {jobLogs?.routerCheckIntervalMinutes || 2} minutes · Alerts after 2 failed checks
                </p>
              </div>
              <button
                type="button"
                onClick={handleCheckRouterNow}
                disabled={checkingRouter || !routerConfig.publicAddress}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 disabled:opacity-40 rounded-lg transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingRouter ? 'animate-spin' : ''}`} />
                {checkingRouter ? 'Checking...' : 'Check Now'}
              </button>
            </div>

            {/* Current Router Status Summary Strip */}
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 mb-5 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Current Router State</span>
                <span className="font-mono font-medium text-slate-100">
                  {routerConfig.lastStatus === 'online' && (
                    <span className="text-emerald-400">
                      Online {routerConfig.lastLatencyMs !== null ? `(${routerConfig.lastLatencyMs} ms)` : ''}
                    </span>
                  )}
                  {routerConfig.lastStatus === 'offline' && (
                    <span className="text-red-400">
                      Offline ({routerConfig.consecutiveFailures} failed check{routerConfig.consecutiveFailures === 1 ? '' : 's'})
                    </span>
                  )}
                  {routerConfig.lastStatus === 'unconfigured' && (
                    <span className="text-slate-400">Address Not Set</span>
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Public Address</span>
                <span className="font-mono text-slate-200">
                  {routerConfig.publicAddress || 'Not configured'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Last Checked (Nairobi)</span>
                <span className="font-mono text-slate-200">
                  {formatNairobiDateTime(routerConfig.lastCheckedAt)}
                </span>
              </div>
              {routerConfig.lastError && (
                <div className="text-xs text-red-400 font-mono pt-1 border-t border-slate-800">
                  Last error: {routerConfig.lastError}
                </div>
              )}
            </div>

            {/* 24-Hour Uptime Green/Red Blocks */}
            <div>
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>24-Hour Block History (Oldest → Now)</span>
                <span className="font-mono tabular-nums text-slate-300">
                  {uptimeSummary.percentage !== null
                    ? `${uptimeSummary.percentage}% online (${uptimeSummary.totalChecks} probes)`
                    : 'No probes yet'}
                </span>
              </div>

              <div
                className="grid gap-1"
                style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}
              >
                {hourlyUptimeBlocks.map((block) => {
                  const bgColor =
                    block.status === 'online'
                      ? 'bg-emerald-500 hover:bg-emerald-400'
                      : block.status === 'offline'
                      ? 'bg-red-500 hover:bg-red-400'
                      : 'bg-slate-800 hover:bg-slate-700';

                  return (
                    <div
                      key={block.hourIndex}
                      title={`${block.label} EAT — ${
                        block.status === 'online'
                          ? `Online (${block.onlineCount} checks${
                              block.avgLatencyMs !== null ? `, avg ${block.avgLatencyMs} ms` : ''
                            })`
                          : block.status === 'offline'
                          ? `Offline (${block.offlineCount} failed checks · ${block.lastDetail})`
                          : 'No checks recorded'
                      }`}
                      className={`h-10 rounded-sm transition-colors cursor-help ${bgColor}`}
                    />
                  );
                })}
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-1.5">
                <span>24h ago</span>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 inline-block" /> Online
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-red-500 inline-block" /> Failed
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <span className="w-2.5 h-2.5 rounded-xs bg-slate-800 inline-block border border-slate-700" /> Unprobed
                  </span>
                </div>
                <span>Now</span>
              </div>
            </div>
          </div>

          {/* Recent Probe Log List */}
          <div className="mt-5 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-300 mb-2">Latest Probe Events</h3>
            {uptimeRecords.length === 0 ? (
              <p className="text-xs text-slate-400">
                Save your router public address below to start 2-minute automated uptime checks.
              </p>
            ) : (
              <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                {uptimeRecords
                  .slice(-4)
                  .reverse()
                  .map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-center justify-between text-xs font-mono tabular-nums text-slate-300"
                    >
                      <span
                        className={
                          rec.status === 'online' ? 'text-emerald-400 font-medium' : 'text-red-400 font-medium'
                        }
                      >
                        {rec.status === 'online' ? 'ONLINE' : 'FAILED'} · {rec.detail}
                      </span>
                      <span className="text-slate-500">{formatNairobiDateTime(rec.timestamp)}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Connected Devices Table with Speed-Limit Sliders & Disconnect Button */}
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Connected Devices &amp; Speed Controls</h2>
            <p className="text-sm text-slate-400 mt-0.5">
              Inspect connected clients, throttle bandwidth with the speed-limit slider, or disconnect devices immediately
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddDevice((prev) => !prev)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            {showAddDevice ? 'Close Form' : 'Register Device'}
          </button>
        </div>

        {/* Manual Device Registration Form */}
        {showAddDevice && (
          <form
            onSubmit={handleAddDevice}
            className="mb-6 p-4 bg-slate-950 border border-slate-800 rounded-lg grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end"
          >
            <div className="lg:col-span-2">
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Device Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Office Workstation"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-900 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                IP or MAC Address
              </label>
              <input
                type="text"
                required
                placeholder="192.168.88.14"
                value={newDeviceAddress}
                onChange={(e) => setNewDeviceAddress(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-900 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Current Down / Up (Mbps)
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={newDeviceDown}
                  onChange={(e) => setNewDeviceDown(e.target.value)}
                  title="Download speed (Mbps)"
                  className="w-full px-2.5 py-2 text-sm font-mono bg-slate-900 text-slate-100 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={newDeviceUp}
                  onChange={(e) => setNewDeviceUp(e.target.value)}
                  title="Upload speed (Mbps)"
                  className="w-full px-2.5 py-2 text-sm font-mono bg-slate-900 text-slate-100 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Speed Limit (Mbps)
              </label>
              <input
                type="number"
                min="1"
                max="500"
                value={newDeviceLimit}
                onChange={(e) => setNewDeviceLimit(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono bg-slate-900 text-slate-100 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <button
                type="submit"
                disabled={addingDevice}
                className="w-full px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {addingDevice ? 'Saving...' : 'Save Device'}
              </button>
            </div>
          </form>
        )}

        {devices.length === 0 ? (
          <div className="py-12 text-center border border-dashed border-slate-800 rounded-lg bg-slate-950/40">
            <Wifi className="w-8 h-8 text-slate-500 mx-auto mb-2" />
            <h3 className="text-sm font-medium text-slate-200">No Connected Devices Recorded</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
              Click &ldquo;Register Device&rdquo; above to add a client device or configure your router endpoint below to poll active connections.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-xs font-semibold text-slate-400">
                  <th className="py-3 pr-4">Device Name</th>
                  <th className="py-3 px-4">Address (IP / MAC)</th>
                  <th className="py-3 px-4">Time Connected</th>
                  <th className="py-3 px-4">Down / Up Speed</th>
                  <th className="py-3 px-4 min-w-[220px]">Speed-Limit Slider</th>
                  <th className="py-3 pl-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80 text-sm">
                {devices.map((device) => {
                  const currentLimit = sliderDrafts[device.id] ?? device.speedLimitMbps;
                  const busy = isDeviceBusy(device);
                  const draftTraffic = trafficDrafts[device.id] ?? {
                    down: device.downloadMbps,
                    up: device.uploadMbps,
                  };

                  return (
                    <tr key={device.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-3.5 pr-4">
                        <div className="font-medium text-slate-100">{device.name}</div>
                        <div className="text-xs mt-0.5">
                          {device.status === 'connected' ? (
                            busy ? (
                              <span className="text-red-400 font-medium">High Bandwidth Load</span>
                            ) : (
                              <span className="text-emerald-400">Connected</span>
                            )
                          ) : (
                            <span className="text-slate-500">Disconnected</span>
                          )}
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-slate-300 tabular-nums">
                        {device.address}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs text-slate-400 tabular-nums">
                        {device.status === 'connected'
                          ? formatDurationConnected(device.connectedAt)
                          : 'Disconnected'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-xs tabular-nums">
                        <div className="flex items-center gap-2">
                          <span
                            className={
                              busy ? 'text-red-400 font-semibold' : 'text-slate-100 font-medium'
                            }
                          >
                            ↓ {device.downloadMbps.toFixed(1)} Mbps
                          </span>
                          <span className="text-slate-600">/</span>
                          <span className="text-slate-400">↑ {device.uploadMbps.toFixed(1)} Mbps</span>
                        </div>
                        {device.status === 'connected' && (
                          <div className="flex items-center gap-1 mt-1">
                            <input
                              type="number"
                              min="0"
                              max={device.speedLimitMbps}
                              step="1"
                              value={draftTraffic.down}
                              onChange={(e) =>
                                setTrafficDrafts((prev) => ({
                                  ...prev,
                                  [device.id]: {
                                    down: Number(e.target.value),
                                    up: draftTraffic.up,
                                  },
                                }))
                              }
                              aria-label={`Download speed reading for ${device.name}`}
                              className="w-14 px-1.5 py-0.5 text-[11px] bg-slate-950 text-slate-200 border border-slate-700 rounded"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateDeviceTraffic(device, draftTraffic.down, draftTraffic.up)
                              }
                              className="px-1.5 py-0.5 text-[11px] text-slate-300 hover:text-white bg-slate-800 border border-slate-700 rounded"
                            >
                              Set Mbps
                            </button>
                          </div>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <input
                            type="range"
                            min={1}
                            max={200}
                            value={currentLimit}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              setSliderDrafts((prev) => ({ ...prev, [device.id]: val }));
                            }}
                            onMouseUp={() => handleCommitSpeedLimit(device, currentLimit)}
                            onTouchEnd={() => handleCommitSpeedLimit(device, currentLimit)}
                            aria-label={`Speed limit slider for ${device.name}`}
                            className="w-32 accent-sky-500 cursor-pointer"
                          />
                          <span className="font-mono text-xs font-medium text-slate-200 tabular-nums w-16">
                            {currentLimit} Mbps
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 pl-4 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleToggleDeviceConnection(device)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                              device.status === 'connected'
                                ? 'text-red-300 bg-red-950/60 hover:bg-red-900/70 border border-red-800/70'
                                : 'text-emerald-300 bg-emerald-950/60 hover:bg-emerald-900/70 border border-emerald-800/70'
                            }`}
                          >
                            {device.status === 'connected' ? 'Disconnect' : 'Reconnect'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteDevice(device)}
                            title="Remove device"
                            className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
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

      {/* Router Controls: Public Endpoint, Reboot Router Now, and Weekly Auto-Reboot Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Router Configuration & Weekly Auto-Reboot Form (7 columns) */}
        <section className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-6">
          <h2 className="text-lg font-semibold text-slate-100">
            Router Endpoint &amp; Weekly Auto-Reboot Schedule
          </h2>
          <p className="text-sm text-slate-400 mt-0.5 mb-5">
            Configure your router&apos;s public address for 2-minute live reachability checks and set a weekly automatic reboot window in Nairobi time
          </p>

          <form onSubmit={handleSaveRouterSettings} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Router Public IP / HTTP Address
              </label>
              <input
                type="text"
                placeholder="e.g. http://197.248.0.10:8080 or https://router.example.com"
                value={publicAddress}
                onChange={(e) => setPublicAddress(e.target.value)}
                className="w-full px-3.5 py-2 text-sm font-mono bg-slate-950 text-slate-100 placeholder:text-slate-500 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
              <p className="text-xs text-slate-400 mt-1">
                Checked every 2 minutes. Sends an in-app alert after 2 consecutive failed checks.
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <span className="text-sm font-medium text-slate-100 block">
                    Weekly Scheduled Auto-Reboot
                  </span>
                  <span className="text-xs text-slate-400">
                    Automatically queues a router reboot on your chosen day and time (Africa/Nairobi)
                  </span>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRebootEnabled}
                    onChange={(e) => setAutoRebootEnabled(e.target.checked)}
                    className="w-4 h-4 accent-sky-500 rounded"
                  />
                  <span className="text-xs font-medium text-slate-300">
                    {autoRebootEnabled ? 'Enabled' : 'Disabled'}
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Day of Week
                  </label>
                  <select
                    value={autoRebootDay}
                    onChange={(e) => setAutoRebootDay(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm bg-slate-950 text-slate-100 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {DAYS_OF_WEEK.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Reboot Time (Nairobi / EAT)
                  </label>
                  <input
                    type="time"
                    value={autoRebootTime}
                    onChange={(e) => setAutoRebootTime(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono bg-slate-950 text-slate-100 border border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={savingRouter}
                className="px-4 py-2 text-xs font-medium text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
              >
                {savingRouter ? 'Saving & Probing...' : 'Save Router Configuration'}
              </button>
            </div>
          </form>
        </section>

        {/* Immediate Router Reboot Action & Reboot Log (5 columns) */}
        <section className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Manual Router Reboot</h2>
            <p className="text-sm text-slate-400 mt-0.5 mb-5">
              Queue an immediate router restart and dispatch a reboot signal if your router endpoint is set
            </p>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-lg mb-5">
              <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
                <span>Last Recorded Reboot</span>
                <span className="font-mono text-slate-200">
                  {formatNairobiDateTime(routerConfig.lastRebootAt)}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Auto-Reboot Schedule</span>
                <span className="font-mono text-slate-200">
                  {routerConfig.autoRebootEnabled
                    ? `Every ${
                        DAYS_OF_WEEK.find((d) => d.value === routerConfig.autoRebootDay)?.label ||
                        'Sunday'
                      } at ${routerConfig.autoRebootTime} EAT`
                    : 'Off'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRebootRouterNow}
              disabled={rebootingRouter}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap"
            >
              <Power className="w-4 h-4" />
              {rebootingRouter ? 'Queueing Reboot...' : 'Reboot Router Now'}
            </button>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800">
            <h3 className="text-xs font-semibold text-slate-300 mb-2">Recorded Reboot History</h3>
            {(!routerConfig.rebootHistory || routerConfig.rebootHistory.length === 0) ? (
              <p className="text-xs text-slate-400">No router reboots queued yet.</p>
            ) : (
              <div className="space-y-2 max-h-36 overflow-y-auto pr-1">
                {routerConfig.rebootHistory.slice(0, 6).map((evt) => (
                  <div
                    key={evt.id}
                    className="text-xs border-b border-slate-800/80 pb-1.5 last:border-none"
                  >
                    <div className="flex items-center justify-between font-medium text-slate-200">
                      <span>{evt.triggeredBy}</span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {formatNairobiDateTime(evt.timestamp)}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{evt.note}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
