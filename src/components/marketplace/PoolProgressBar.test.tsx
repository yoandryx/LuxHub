// src/components/marketplace/PoolProgressBar.test.tsx
// Phase 11-16 Task 16.5: Component tests for PoolProgressBar.
import React from 'react';
import { render } from '@testing-library/react';
import { PoolProgressBar } from './PoolProgressBar';

describe('PoolProgressBar', () => {
  it('renders primary bar at correct percentage (50%)', () => {
    const { container, getByText } = render(
      <PoolProgressBar accumulatedUsd={50} targetUsd={100} />
    );
    const primaryFill = container.querySelector<HTMLDivElement>(
      '[data-testid="primary-bar-fill"]'
    );
    expect(primaryFill).not.toBeNull();
    expect(primaryFill!.style.width).toBe('50%');
    // Amount label shows both sides + percentage
    expect(getByText(/\$50\.00 \/ \$100\.00 \(50\.0%\)/)).toBeTruthy();
  });

  it('renders pending overlay when pendingUsd provided', () => {
    const { container } = render(
      <PoolProgressBar accumulatedUsd={40} pendingUsd={20} targetUsd={100} />
    );
    const pending = container.querySelector<HTMLDivElement>(
      '[data-testid="pending-overlay"]'
    );
    expect(pending).not.toBeNull();
    // (40 + 20) / 100 = 60%
    expect(pending!.style.width).toBe('60%');
  });

  it('does NOT render pending overlay when pendingUsd is absent', () => {
    const { container } = render(
      <PoolProgressBar accumulatedUsd={40} targetUsd={100} />
    );
    const pending = container.querySelector(
      '[data-testid="pending-overlay"]'
    );
    expect(pending).toBeNull();
  });

  it('renders secondary Bags DBC group when bagsDbcState is provided', () => {
    const { container, getByText } = render(
      <PoolProgressBar
        accumulatedUsd={10}
        targetUsd={100}
        bagsDbcState="MIGRATED"
        bagsDbcProgress={100}
      />
    );
    const secondary = container.querySelector(
      '[data-testid="secondary-group"]'
    );
    expect(secondary).not.toBeNull();
    expect(getByText('Bags Bonding Curve')).toBeTruthy();
    expect(getByText('MIGRATED')).toBeTruthy();
  });

  it('does NOT render secondary group when bagsDbcState is undefined', () => {
    const { container } = render(
      <PoolProgressBar accumulatedUsd={10} targetUsd={100} />
    );
    const secondary = container.querySelector(
      '[data-testid="secondary-group"]'
    );
    expect(secondary).toBeNull();
  });

  it('clamps primary bar to 100% when accumulatedUsd > targetUsd', () => {
    const { container } = render(
      <PoolProgressBar accumulatedUsd={250} targetUsd={100} />
    );
    const primaryFill = container.querySelector<HTMLDivElement>(
      '[data-testid="primary-bar-fill"]'
    );
    expect(primaryFill!.style.width).toBe('100%');
  });

  it('handles zero targetUsd gracefully (no divide-by-zero)', () => {
    const { container } = render(
      <PoolProgressBar accumulatedUsd={50} targetUsd={0} />
    );
    const primaryFill = container.querySelector<HTMLDivElement>(
      '[data-testid="primary-bar-fill"]'
    );
    expect(primaryFill!.style.width).toBe('0%');
  });
});
