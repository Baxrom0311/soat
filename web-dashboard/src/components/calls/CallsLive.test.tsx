import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallsLive } from './CallsLive';

const NOW = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
const call = (id: number, room: string, secondsAgo: number) => ({
  call_id: id, room_number: room, floor: 2,
  created_at: new Date(NOW.getTime() - secondsAgo * 1000).toISOString(),
  status: 'active' as const,
});

describe('CallsLive', () => {
  it('sorts oldest first, unconditionally', () => {
    render(<CallsLive calls={[call(1, '101', 5), call(2, '202', 300), call(3, '303', 60)]} onAck={vi.fn()} connStatus="live" now={NOW} />);
    const rooms = Array.from(document.querySelectorAll('.call-card__room')).map((n) => n.textContent);
    expect(rooms).toEqual(['202', '303', '101']);
  });

  it('shows a teal count pill, never red', () => {
    render(<CallsLive calls={[call(1, '101', 5)]} onAck={vi.fn()} connStatus="live" now={NOW} />);
    expect(screen.getByText('1 faol')).toBeTruthy();
  });

  it('proves liveness in the empty state instead of reassuring', () => {
    render(<CallsLive calls={[]} onAck={vi.fn()} connStatus="live" now={NOW} />);
    expect(screen.getByText('Faol chaqiruv yoʻq')).toBeTruthy();
    expect(screen.queryByRole('img')).toBeNull();
  });

  it('passes onAck through, so the desk CAN acknowledge', () => {
    render(<CallsLive calls={[call(1, '101', 5)]} onAck={vi.fn()} connStatus="live" now={NOW} />);
    expect(screen.getByRole('button', { name: /Tasdiqlash/ })).toBeTruthy();
  });
});
