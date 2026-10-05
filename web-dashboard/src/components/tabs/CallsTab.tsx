import { useState } from 'react';
import { CallsLive } from '../calls/CallsLive';
import type { ActiveCall, CallStatus, HistoryCall } from '../../api/types';
import type { ConnStatus } from '../../hooks/useCallsFeed';
import { ColumnPicker, useColumnVisibility, type ColumnDef } from '../common/ColumnPicker';

interface CallsTabProps {
  activeCalls: Map<number, ActiveCall>;
  history: HistoryCall[];
  ackCall: (callId: number) => Promise<void>;
  connStatus?: ConnStatus;
  /** Call HISTORY is a management route and answers 402 for a blocked clinic — the
   *  live board above it is ungated and keeps working. */
  historyBlocked?: boolean;
}

/** Spelled out rather than an "active or else answered" ternary: a call closed by
 *  the clock was never answered, and labelling it "Qabul qilindi" would put a lie in
 *  the one table a clinic uses to check whether its patients were reached. */
const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  active: 'Faol',
  acknowledged: 'Qabul qilindi',
  expired: 'Javobsiz qoldi',
};

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

type CallHistoryColKey = 'room' | 'floor' | 'status' | 'created_at' | 'acknowledged_at' | 'acknowledged_by';

const CALL_HISTORY_COLUMNS: ColumnDef<CallHistoryColKey>[] = [
  { key: 'room', label: 'Xona' },
  { key: 'floor', label: 'Qavat' },
  { key: 'status', label: 'Holat' },
  { key: 'created_at', label: 'Yaratildi' },
  { key: 'acknowledged_at', label: 'Javob berildi' },
  { key: 'acknowledged_by', label: 'Kim' },
];

export function CallsTab({ activeCalls, history, ackCall, connStatus = 'live', historyBlocked = false }: CallsTabProps) {
  const [search, setSearch] = useState('');

  const { visibleCols, toggleCol, resetCols } = useColumnVisibility<CallHistoryColKey>(
    'nursecall.call_history.columns',
    CALL_HISTORY_COLUMNS
  );

  const filteredHistory = history.filter((item) => {
    const q = search.toLowerCase();
    return (
      item.room_number.toLowerCase().includes(q) ||
      String(item.floor).includes(q) ||
      (item.acknowledged_by && item.acknowledged_by.toLowerCase().includes(q)) ||
      (CALL_STATUS_LABEL[item.status] && CALL_STATUS_LABEL[item.status].toLowerCase().includes(q))
    );
  });

  return (
    <section className="tab-panel">
      <CallsLive calls={[...activeCalls.values()]} onAck={ackCall} connStatus={connStatus} />

      <h2 className="hist-title" style={{ marginTop: 'var(--space-32)' }}>Bugungi tarix (oxirgi 50 ta)</h2>
      {historyBlocked ? (
        <p className="empty-msg">
          Obuna to'lanmagani uchun tarix vaqtincha yopilgan. Yuqoridagi faol chaqiruvlar
          paneli ishlashda davom etadi.
        </p>
      ) : (
      <div className="table-wrap glass">
        <div className="table-toolbar">
          <input
            type="text"
            className="table-search-input"
            placeholder="Xona, qavat yoki xodim bo'yicha qidirish…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="table-count-meta">{filteredHistory.length} ta yozuv</span>
            <ColumnPicker
              columns={CALL_HISTORY_COLUMNS}
              visibleCols={visibleCols}
              onToggle={toggleCol}
              onReset={resetCols}
            />
          </div>
        </div>
        <table>
          <thead>
            <tr>
              {visibleCols.room && <th>Xona</th>}
              {visibleCols.floor && <th>Qavat</th>}
              {visibleCols.status && <th>Holat</th>}
              {visibleCols.created_at && <th>Yaratildi</th>}
              {visibleCols.acknowledged_at && <th>Javob berildi</th>}
              {visibleCols.acknowledged_by && <th>Kim</th>}
            </tr>
          </thead>
          <tbody>
            {filteredHistory.map((item) => (
              <tr key={item.call_id}>
                {visibleCols.room && <td data-label="Xona">{item.room_number}</td>}
                {visibleCols.floor && <td data-label="Qavat">{item.floor}</td>}
                {visibleCols.status && (
                  <td data-label="Holat">
                    <span className={`status-pill ${item.status}`}>{CALL_STATUS_LABEL[item.status] ?? item.status}</span>
                  </td>
                )}
                {visibleCols.created_at && <td data-label="Yaratildi">{fmtTime(item.created_at)}</td>}
                {visibleCols.acknowledged_at && (
                  <td data-label="Javob berildi">{item.acknowledged_at ? fmtTime(item.acknowledged_at) : '—'}</td>
                )}
                {visibleCols.acknowledged_by && <td data-label="Kim">{item.acknowledged_by || '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </section>
  );
}
