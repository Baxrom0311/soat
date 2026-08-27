import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WallGrid, WallEmpty } from './WallView';

const NOW = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
const mk = (n: number) => Array.from({ length: n }, (_, i) => ({
  call_id: i + 1, room_number: String(101 + i), floor: 1,
  created_at: new Date(NOW.getTime() - (n - i) * 60_000).toISOString(),
  status: 'active' as const,
}));

describe('WallGrid', () => {
  it('never renders an acknowledge control, at any call count', () => {
    for (const n of [1, 4, 12, 20]) {
      const { container, unmount } = render(<WallGrid calls={mk(n)} now={NOW} />);
      expect(container.querySelectorAll('button').length).toBe(0);
      expect(screen.queryByText(/Tasdiqlash/)).toBeNull();
      unmount();
    }
  });

  it('renders a single call at wallSolo size', () => {
    const { container } = render(<WallGrid calls={mk(1)} now={NOW} />);
    expect(container.querySelector('[data-size="wallSolo"]')).toBeTruthy();
  });

  it('renders 2-11 calls as a grid at wall size', () => {
    const { container } = render(<WallGrid calls={mk(5)} now={NOW} />);
    expect(container.querySelectorAll('[data-size="wall"]').length).toBe(5);
  });

  it('caps at 11 cards and states how many are hidden, and how old the WORST (oldest) hidden call is', () => {
    // mk(18): call i has age (18-i) minutes. oldest hidden is index 11 (7 min old),
    // newest hidden is index 17 (1 min old). The tile must report the oldest (7:00),
    // not the newest (1:00) -- naming the wrong call's age makes the tile lie.
    const { container } = render(<WallGrid calls={mk(18)} now={NOW} />);
    expect(container.querySelectorAll('.call-card').length).toBe(11);
    expect(screen.getByText('+7')).toBeTruthy();
    expect(screen.getByText(/eng qadimgisi/)).toBeTruthy();
    expect(screen.getByText('eng qadimgisi 7:00')).toBeTruthy();
    expect(screen.queryByText('eng qadimgisi 1:00')).toBeNull();
  });
});

describe('WallEmpty', () => {
  it('never renders an acknowledge control or any button', () => {
    const { container } = render(<WallEmpty connStatus="live" />);
    expect(container.querySelectorAll('button').length).toBe(0);
  });

  it('renders one clock, the singular message, and the connection dot -- no self-congratulation', () => {
    render(<WallEmpty connStatus="live" />);
    expect(screen.getByText('Faol chaqiruv yoʻq')).toBeTruthy();
    expect(screen.getByText('Ulangan')).toBeTruthy();
    expect(screen.queryByText(/hammasi tinch/i)).toBeNull();
    expect(screen.queryByText(/✓/)).toBeNull();
  });

  it('gives all three connection states distinct, visible labels', () => {
    const { rerender } = render(<WallEmpty connStatus="connecting" />);
    expect(screen.getByText('Ulanish yoʻq')).toBeTruthy();
    rerender(<WallEmpty connStatus="disconnected" />);
    expect(screen.getByText('Qayta ulanmoqda')).toBeTruthy();
    rerender(<WallEmpty connStatus="live" />);
    expect(screen.getByText('Ulangan')).toBeTruthy();
  });
});
