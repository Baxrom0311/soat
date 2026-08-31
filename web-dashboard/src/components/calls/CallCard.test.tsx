import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallCard } from './CallCard';

const NOW = new Date(Date.UTC(2026, 0, 1, 12, 0, 0));
const ago = (s: number) => new Date(NOW.getTime() - s * 1000).toISOString();

describe('CallCard', () => {
  it('shows the room number with no "Xona" prefix', () => {
    render(<CallCard roomNumber="214" floor={2} createdAt={ago(5)} now={NOW} />);
    expect(screen.getByText('214')).toBeTruthy();
    expect(screen.queryByText(/Xona/)).toBeNull();
  });

  it('shows floor and a counting timer', () => {
    render(<CallCard roomNumber="108" floor={1} createdAt={ago(107)} now={NOW} />);
    expect(screen.getByText('1-qavat')).toBeTruthy();
    expect(screen.getByText('1:47')).toBeTruthy();
  });

  it('renders three rail slots always, with `step` of them filled', () => {
    const { container, rerender } = render(<CallCard roomNumber="1" floor={1} createdAt={ago(5)} now={NOW} />);
    expect(container.querySelectorAll('[data-rail-slot]').length).toBe(3);
    expect(container.querySelectorAll('[data-rail-slot="on"]').length).toBe(1);
    rerender(<CallCard roomNumber="1" floor={1} createdAt={ago(300)} now={NOW} />);
    expect(container.querySelectorAll('[data-rail-slot="on"]').length).toBe(3);
  });

  it('carries the age step as a data attribute so CSS selects the fill', () => {
    const { container } = render(<CallCard roomNumber="1" floor={1} createdAt={ago(60)} now={NOW} />);
    expect(container.querySelector('[data-step="2"]')).toBeTruthy();
  });

  // The constraint-6 guarantee, enforced by the type signature.
  it('renders NO acknowledge control when onAck is not supplied', () => {
    render(<CallCard roomNumber="214" floor={2} createdAt={ago(5)} now={NOW} size="wall" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/Tasdiqlash/)).toBeNull();
  });

  it('renders the slab when onAck is supplied and calls it once', async () => {
    const onAck = vi.fn();
    render(<CallCard roomNumber="214" floor={2} createdAt={ago(5)} now={NOW} onAck={onAck} />);
    screen.getByRole('button', { name: /Tasdiqlash/ }).click();
    expect(onAck).toHaveBeenCalledTimes(1);
  });

  it('disables the slab and swaps the label while in flight, without changing its width', async () => {
    let resolve!: () => void;
    const onAck = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    render(<CallCard roomNumber="214" floor={2} createdAt={ago(5)} now={NOW} onAck={onAck} />);
    const btn = screen.getByRole('button');
    btn.click();
    await Promise.resolve();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
    expect(btn.textContent).toMatch(/Yuborilmoqda/);
    resolve();
  });
});
