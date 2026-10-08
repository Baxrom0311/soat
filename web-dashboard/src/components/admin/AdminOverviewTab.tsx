import { useEffect, useId, useMemo, useState } from 'react';
import { api, ApiError } from '../../api/client';
import type { AdminOverview, DailyStat, HourlyStat } from '../../api/types';

const POLL_MS = 10000;

export function AdminOverviewTab() {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');
  const [clinicFilter, setClinicFilter] = useState('');
  const [hoveredDaily, setHoveredDaily] = useState<DailyStat | null>(null);
  const [hoveredHourly, setHoveredHourly] = useState<HourlyStat | null>(null);
  const chartId = useId();

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const data = await api.getAdminOverview();
        if (mounted) {
          setOverview(data);
          setError('');
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof ApiError ? err.message : 'Server bilan aloqa xato');
        }
      }
    }
    load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  // Filtered top clinics list
  const filteredClinics = useMemo(() => {
    if (!overview?.top_clinics) return [];
    if (!clinicFilter.trim()) return overview.top_clinics;
    const q = clinicFilter.toLowerCase().trim();
    return overview.top_clinics.filter((c) => c.name.toLowerCase().includes(q));
  }, [overview?.top_clinics, clinicFilter]);

  // Max values for chart scaling
  const dailyStats = useMemo(() => overview?.daily_stats ?? [], [overview?.daily_stats]);
  const maxRooms = useMemo(() => {
    if (!dailyStats.length) return 10;
    return Math.max(...dailyStats.map((d) => d.rooms_total), 5);
  }, [dailyStats]);

  const hourlyStats = useMemo(() => overview?.hourly_stats ?? [], [overview?.hourly_stats]);
  const maxHourlyCalls = useMemo(() => {
    if (!hourlyStats.length) return 10;
    return Math.max(...hourlyStats.map((h) => h.calls_count), 5);
  }, [hourlyStats]);

  return (
    <section className="tab-panel">
      <div className="section-head" style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h2>Platforma Tahlili & Umumiy Ko'rinish</h2>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Barcha klinikalar, xonalar, IoT qurilmalar va chaqiruvlar telemetriyasi
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="online-badge online" title="Har 10 soniyada yangilanadi">
            <span className="dot" /> Jonli Monitoring
          </span>
        </div>
      </div>

      {error && <p className="auth-error">{error}</p>}

      {/* ================= 6 ta Asosiy KPI Kartalar ================= */}
      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        {/* 1. Klinikalar */}
        <div className="stat-card glass">
          <div className="stat-card-header">
            <p className="stat-label">Klinikalar</p>
            <div className="stat-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21h18M5 21V7l8-4v18M13 11h4M13 15h4M13 19h4M9 9h.01M9 13h.01M9 17h.01" />
              </svg>
            </div>
          </div>
          <p className="stat-value">{overview ? overview.clinics : '—'}</p>
          <div className="stat-sub">
            <span className="badge-pill ok">Faol: {overview?.clinics_active ?? '—'}</span>
            <span className="badge-pill info">Sinov: {overview ? overview.clinics - overview.clinics_active : '—'}</span>
          </div>
        </div>

        {/* 2. Xonalar & Tugmalar */}
        <div className="stat-card glass">
          <div className="stat-card-header">
            <p className="stat-label">Xonalar & Koykalar</p>
            <div className="stat-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 7v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7M2 7h20M7 3v4M17 3v4M7 11h10M7 15h6" />
              </svg>
            </div>
          </div>
          <p className="stat-value">{overview ? `${overview.rooms_total} xona` : '—'}</p>
          <div className="stat-sub">
            <span className="badge-pill ok">{overview?.buttons_total ?? '—'} ta SOS tugma</span>
          </div>
        </div>

        {/* 3. Qurilmalar (Hub / Gateway) */}
        <div className="stat-card glass">
          <div className="stat-card-header">
            <p className="stat-label">Qurilmalar (Gateway)</p>
            <div className="stat-card-icon ok">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
            </div>
          </div>
          <p className="stat-value">{overview ? overview.devices_total : '—'}</p>
          <div className="stat-sub">
            <span className="badge-pill ok">Onlayn: {overview?.devices_online ?? '—'}</span>
            <span className="badge-pill warn">Oflayn: {overview ? overview.devices_total - overview.devices_online : '—'}</span>
          </div>
        </div>

        {/* 4. Hozirgi Faol Chaqiruvlar */}
        <div className="stat-card glass">
          <div className="stat-card-header">
            <p className="stat-label">Faol Chaqiruvlar</p>
            <div className={`stat-card-icon ${overview && overview.active_calls_total > 0 ? 'warn' : ''}`}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </div>
          </div>
          <p className={`stat-value ${overview && overview.active_calls_total > 0 ? 'stat-warn' : 'stat-ok'}`}>
            {overview ? overview.active_calls_total : '—'}
          </p>
          <div className="stat-sub">
            {overview && overview.active_calls_total > 0 ? (
              <span className="badge-pill warn">Shoshilinch chaqiruv kutmoqda</span>
            ) : (
              <span className="badge-pill ok">Barcha chaqiruvlar yopilgan</span>
            )}
          </div>
        </div>

        {/* 5. Bugungi Chaqiruvlar */}
        <div className="stat-card glass">
          <div className="stat-card-header">
            <p className="stat-label">Bugungi Chaqiruvlar</p>
            <div className="stat-card-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
            </div>
          </div>
          <p className="stat-value">{overview ? overview.calls_today : '—'}</p>
          <div className="stat-sub">
            <span className="badge-pill info">Jami: {overview ? overview.calls_total.toLocaleString() : '—'} ta</span>
          </div>
        </div>

        {/* 6. O'rtacha Javob Vaqti */}
        <div className="stat-card glass">
          <div className="stat-card-header">
            <p className="stat-label">O'rtacha Javob Vaqti</p>
            <div className="stat-card-icon ok">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
          </div>
          <p className="stat-value stat-ok">
            {overview?.avg_response_seconds_overall !== null && overview?.avg_response_seconds_overall !== undefined
              ? `${Math.round(overview.avg_response_seconds_overall)}s`
              : '—'}
          </p>
          <div className="stat-sub">
            <span className="badge-pill ok">Platforma o'rtacha tezligi</span>
          </div>
        </div>
      </div>

      {/* ================= 2 ta Asosiy SVG Grafik ================= */}
      <div className="charts-grid">
        {/* Grafik 1: O'sish Dinamikasi (14 Kunlik Klinikalar & Xonalar) */}
        <div className="chart-card glass">
          <div className="chart-card-header">
            <h3 className="chart-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18" />
                <path d="M18 9l-5 5-4-4-6 6" />
              </svg>
              Platforma O'sish Dinamikasi (14 kun)
            </h3>
            <div className="chart-legend">
              <div className="chart-legend-item">
                <span className="legend-dot" style={{ background: '#38bdf8' }} />
                <span>Xonalar</span>
              </div>
              <div className="chart-legend-item">
                <span className="legend-dot" style={{ background: '#a855f7' }} />
                <span>Klinikalar</span>
              </div>
              <div className="chart-legend-item">
                <span className="legend-dot" style={{ background: '#22c55e' }} />
                <span>Chaqiruvlar</span>
              </div>
            </div>
          </div>

          <div className="chart-svg-container" style={{ minHeight: '220px' }}>
            {dailyStats.length === 0 ? (
              <div className="empty-msg" style={{ padding: '40px 0' }}>Statistika ma'lumotlari yuklanmoqda...</div>
            ) : (
              <svg
                className="chart-svg"
                viewBox="0 0 600 220"
                preserveAspectRatio="none"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <linearGradient id={`gradRooms-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.35" />
                    <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
                  </linearGradient>
                  <linearGradient id={`gradClinics-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Y-axis grid lines */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
                  const y = 180 - ratio * 150;
                  return (
                    <g key={i}>
                      <line
                        x1="40"
                        y1={y}
                        x2="590"
                        y2={y}
                        stroke="var(--border)"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                      <text
                        x="32"
                        y={y + 4}
                        fill="var(--text-3)"
                        fontSize="10"
                        textAnchor="end"
                        fontFamily="var(--font-mono)"
                      >
                        {Math.round(ratio * maxRooms)}
                      </text>
                    </g>
                  );
                })}

                {/* Area and Line for Rooms */}
                {(() => {
                  const points = dailyStats.map((d, i) => {
                    const x = 50 + (i / Math.max(dailyStats.length - 1, 1)) * 530;
                    const y = 180 - (d.rooms_total / maxRooms) * 150;
                    return { x, y, d };
                  });

                  const pathD = points.reduce(
                    (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
                    ''
                  );
                  const areaD = `${pathD} L ${points[points.length - 1].x} 180 L ${points[0].x} 180 Z`;

                  return (
                    <>
                      <path d={areaD} fill={`url(#gradRooms-${chartId})`} />
                      <path d={pathD} fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeLinecap="round" />
                      {points.map((p, idx) => (
                        <circle
                          key={idx}
                          cx={p.x}
                          cy={p.y}
                          r={hoveredDaily?.date === p.d.date ? 5 : 3.5}
                          fill="#38bdf8"
                          stroke="var(--surface-strong)"
                          strokeWidth="2"
                          style={{ cursor: 'pointer', transition: 'r 0.15s ease' }}
                          onMouseEnter={() => setHoveredDaily(p.d)}
                          onMouseLeave={() => setHoveredDaily(null)}
                        />
                      ))}
                    </>
                  );
                })()}

                {/* Line for Clinics */}
                {(() => {
                  const points = dailyStats.map((d, i) => {
                    const x = 50 + (i / Math.max(dailyStats.length - 1, 1)) * 530;
                    const y = 180 - (d.clinics_total / maxRooms) * 150;
                    return { x, y, d };
                  });

                  const pathD = points.reduce(
                    (acc, p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`),
                    ''
                  );

                  return (
                    <>
                      <path d={pathD} fill="none" stroke="#a855f7" strokeWidth="2" strokeDasharray="3 3" />
                      {points.map((p, idx) => (
                        <circle
                          key={idx}
                          cx={p.x}
                          cy={p.y}
                          r={hoveredDaily?.date === p.d.date ? 4.5 : 3}
                          fill="#a855f7"
                          stroke="var(--surface-strong)"
                          strokeWidth="1.5"
                          style={{ cursor: 'pointer' }}
                          onMouseEnter={() => setHoveredDaily(p.d)}
                          onMouseLeave={() => setHoveredDaily(null)}
                        />
                      ))}
                    </>
                  );
                })()}

                {/* X-axis labels */}
                {dailyStats.map((d, i) => {
                  if (i % 2 !== 0 && i !== dailyStats.length - 1) return null;
                  const x = 50 + (i / Math.max(dailyStats.length - 1, 1)) * 530;
                  const formattedDate = d.date.slice(5); // MM-DD
                  return (
                    <text
                      key={i}
                      x={x}
                      y="202"
                      fill="var(--text-3)"
                      fontSize="10"
                      textAnchor="middle"
                      fontFamily="var(--font-mono)"
                    >
                      {formattedDate}
                    </text>
                  );
                })}
              </svg>
            )}

            {hoveredDaily && (
              <div
                className="chart-tooltip"
                style={{
                  top: '20px',
                  right: '20px',
                  transform: 'none',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: '4px' }}>
                  📅 Sana: {hoveredDaily.date}
                </div>
                <div style={{ color: '#38bdf8' }}>🚪 Jami xonalar: {hoveredDaily.rooms_total} ta</div>
                <div style={{ color: '#a855f7' }}>🏥 Jami klinikalar: {hoveredDaily.clinics_total} ta</div>
                <div style={{ color: '#22c55e' }}>🔔 Kunlik chaqiruvlar: {hoveredDaily.calls_count} ta</div>
              </div>
            )}
          </div>
        </div>

        {/* Grafik 2: 24 Soatlik Chaqiruvlar Taqsimoti (Hourly Peak Distribution) */}
        <div className="chart-card glass">
          <div className="chart-card-header">
            <h3 className="chart-title">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 14 14" />
              </svg>
              24 Soatlik Chaqiruvlar Taqsimoti (Pik Soatlar)
            </h3>
            <div className="chart-legend">
              <div className="chart-legend-item">
                <span className="legend-dot" style={{ background: 'var(--accent)' }} />
                <span>Chaqiruvlar hajmi (soatlar kesimida)</span>
              </div>
            </div>
          </div>

          <div className="chart-svg-container" style={{ minHeight: '220px' }}>
            {hourlyStats.length === 0 ? (
              <div className="empty-msg" style={{ padding: '40px 0' }}>Soatlik ma'lumotlar mavjud emas...</div>
            ) : (
              <svg
                className="chart-svg"
                viewBox="0 0 600 220"
                preserveAspectRatio="none"
                style={{ overflow: 'visible' }}
              >
                <defs>
                  <linearGradient id={`gradBar-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.3" />
                  </linearGradient>
                  <linearGradient id={`gradBarHover-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="1" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.7" />
                  </linearGradient>
                </defs>

                {/* Y-axis grid lines */}
                {[0, 0.5, 1].map((ratio, i) => {
                  const y = 180 - ratio * 150;
                  return (
                    <g key={i}>
                      <line
                        x1="35"
                        y1={y}
                        x2="590"
                        y2={y}
                        stroke="var(--border)"
                        strokeDasharray="4 4"
                        strokeWidth="1"
                      />
                      <text
                        x="28"
                        y={y + 4}
                        fill="var(--text-3)"
                        fontSize="10"
                        textAnchor="end"
                        fontFamily="var(--font-mono)"
                      >
                        {Math.round(ratio * maxHourlyCalls)}
                      </text>
                    </g>
                  );
                })}

                {/* Bars for 24 Hours */}
                {hourlyStats.map((h, i) => {
                  const barWidth = 16;
                  const x = 45 + i * 22.5;
                  const barHeight = Math.max((h.calls_count / maxHourlyCalls) * 150, h.calls_count > 0 ? 4 : 1);
                  const y = 180 - barHeight;
                  const isHovered = hoveredHourly?.hour === h.hour;

                  return (
                    <g
                      key={i}
                      style={{ cursor: 'pointer' }}
                      onMouseEnter={() => setHoveredHourly(h)}
                      onMouseLeave={() => setHoveredHourly(null)}
                    >
                      <rect
                        className="chart-bar"
                        x={x}
                        y={y}
                        width={barWidth}
                        height={barHeight}
                        rx="3"
                        fill={isHovered ? `url(#gradBarHover-${chartId})` : `url(#gradBar-${chartId})`}
                        style={{ transition: 'all 0.2s ease' }}
                      />
                      {/* Label every 3 hours */}
                      {i % 3 === 0 && (
                        <text
                          x={x + barWidth / 2}
                          y="198"
                          fill="var(--text-3)"
                          fontSize="9.5"
                          textAnchor="middle"
                          fontFamily="var(--font-mono)"
                        >
                          {String(h.hour).padStart(2, '0')}:00
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            )}

            {hoveredHourly && (
              <div
                className="chart-tooltip"
                style={{
                  top: '20px',
                  right: '20px',
                  transform: 'none',
                }}
              >
                <div style={{ fontWeight: 700, color: 'var(--text-1)', marginBottom: '2px' }}>
                  ⏰ Soat: {String(hoveredHourly.hour).padStart(2, '0')}:00 - {String(hoveredHourly.hour).padStart(2, '0')}:59
                </div>
                <div style={{ color: 'var(--accent)', fontWeight: 600 }}>
                  🚨 Chaqiruvlar soni: {hoveredHourly.calls_count} ta
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= Klinikalar Reytingi & Samaradorlik Jadvali ================= */}
      <div className="section-head" style={{ marginTop: '24px', justifyContent: 'space-between', flexWrap: 'wrap' }}>
        <div>
          <h3 className="hist-title" style={{ margin: 0 }}>Klinikalar Reytingi & Samaradorlik Ko'rsatkichlari</h3>
          <p className="hint" style={{ margin: '4px 0 0' }}>
            Xonalar soni, faollik, uskunalar va o'rtacha javob tezligi
          </p>
        </div>
        <div style={{ minWidth: '240px' }}>
          <input
            type="search"
            placeholder="Klinika nomi bo'yicha filter..."
            value={clinicFilter}
            onChange={(e) => setClinicFilter(e.target.value)}
            style={{ width: '100%', height: '2.3rem', fontSize: '0.85rem' }}
          />
        </div>
      </div>

      <div className="table-responsive">
        <table className="table">
          <thead>
            <tr>
              <th>#</th>
              <th>Klinika nomi</th>
              <th>Holati</th>
              <th>Xonalar</th>
              <th>Tugmalar</th>
              <th>Gateway</th>
              <th>Jami Chaqiruvlar</th>
              <th>O'rtacha Tezlik</th>
            </tr>
          </thead>
          <tbody>
            {filteredClinics.length === 0 ? (
              <tr>
                <td colSpan={8} className="empty-msg" style={{ border: 'none' }}>
                  {clinicFilter ? 'Filterga mos keluvchi klinikalar topilmadi' : "Klinikalar ma'lumoti mavjud emas"}
                </td>
              </tr>
            ) : (
              filteredClinics.map((c, idx) => {
                const speed = c.avg_response_seconds;
                let speedClass = 'none';
                let speedLabel = '—';
                if (speed !== null && speed !== undefined) {
                  const sec = Math.round(speed);
                  if (sec <= 30) {
                    speedClass = 'fast';
                    speedLabel = `⚡ ${sec} soniya (Tezkor)`;
                  } else if (sec <= 60) {
                    speedClass = 'moderate';
                    speedLabel = `⏱ ${sec} soniya (O'rtacha)`;
                  } else {
                    speedClass = 'slow';
                    speedLabel = `⚠️ ${sec} soniya (Sekin)`;
                  }
                }

                return (
                  <tr key={c.id}>
                    <td data-label="#" style={{ width: '40px', color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>
                      {idx + 1}
                    </td>
                    <td data-label="Klinika">
                      <strong>{c.name}</strong>
                    </td>
                    <td data-label="Holati">
                      <span className={`sub-pill ${c.status.toLowerCase()}`}>
                        {c.status}
                      </span>
                    </td>
                    <td data-label="Xonalar" style={{ fontFamily: 'var(--font-mono)' }}>
                      {c.rooms_count} ta
                    </td>
                    <td data-label="Tugmalar" style={{ fontFamily: 'var(--font-mono)' }}>
                      {c.buttons_count} ta
                    </td>
                    <td data-label="Gateway" style={{ fontFamily: 'var(--font-mono)' }}>
                      {c.devices_count} ta
                    </td>
                    <td data-label="Chaqiruvlar" style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {c.calls_count.toLocaleString()}
                    </td>
                    <td data-label="O'rtacha Tezlik">
                      <span className={`speed-badge ${speedClass}`}>{speedLabel}</span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
