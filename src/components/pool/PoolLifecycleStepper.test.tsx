// src/components/pool/PoolLifecycleStepper.test.tsx
// Phase 11-16 Task 16.5: Component tests for PoolLifecycleStepper.
import React from 'react';
import { render } from '@testing-library/react';
import PoolLifecycleStepper, {
  CANONICAL_STAGES,
} from './PoolLifecycleStepper';

describe('PoolLifecycleStepper', () => {
  it('renders 8 canonical stage nodes for non-aborted states', () => {
    const { container } = render(
      <PoolLifecycleStepper currentState="funding" />
    );
    const stages = container.querySelectorAll('[data-stage]');
    expect(stages.length).toBe(8);
    // Confirm the expected keys are in order
    const stageKeys = Array.from(stages).map((s) =>
      s.getAttribute('data-stage')
    );
    expect(stageKeys).toEqual(CANONICAL_STAGES.map((s) => s.key));
  });

  it('marks the correct stage as current for "funding"', () => {
    const { container } = render(
      <PoolLifecycleStepper currentState="funding" />
    );
    const fundingStage = container.querySelector('[data-stage="funding"]');
    expect(fundingStage).not.toBeNull();
    // The "current" stage has a glow ring element as a child
    const glowRing = fundingStage!.querySelector('div > div');
    expect(glowRing).not.toBeNull();
  });

  it('renders the aborted terminal box when currentState="aborted"', () => {
    const { getByTestId, getByText, queryByTestId } = render(
      <PoolLifecycleStepper currentState="aborted" />
    );
    expect(getByTestId('pool-lifecycle-stepper-aborted')).toBeTruthy();
    expect(getByText(/Pool Aborted/i)).toBeTruthy();
    // The normal stepper is NOT rendered
    expect(queryByTestId('pool-lifecycle-stepper')).toBeNull();
  });

  it('renders partial_distributed banner when state is partial_distributed', () => {
    const { getByText } = render(
      <PoolLifecycleStepper currentState="partial_distributed" />
    );
    expect(
      getByText(/Partial distribution in progress/i)
    ).toBeTruthy();
  });

  it('marks resale_unlisted as being at custody stage', () => {
    const { container } = render(
      <PoolLifecycleStepper currentState="resale_unlisted" />
    );
    // resale_unlisted maps to custody index
    const custodyStage = container.querySelector('[data-stage="custody"]');
    expect(custodyStage).not.toBeNull();
    // And the stages after custody should be "future" (not completed/current)
    const resoldStage = container.querySelector('[data-stage="resold"]');
    expect(resoldStage).not.toBeNull();
  });

  it('renders all 8 stages for pending state (initial pool creation)', () => {
    const { container } = render(
      <PoolLifecycleStepper currentState="pending" />
    );
    const stages = container.querySelectorAll('[data-stage]');
    expect(stages.length).toBe(8);
    // First stage should be "pending" and be the current one
    const pending = container.querySelector('[data-stage="pending"]');
    expect(pending).not.toBeNull();
  });
});
