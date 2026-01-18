import { render, screen } from '@testing-library/react';

// Simple example test to verify Jest setup is working
describe('LuxHub Test Suite', () => {
  it('should pass a basic test', () => {
    expect(true).toBe(true);
  });

  it('should render a simple component', () => {
    const TestComponent = () => <div data-testid="test">Hello LuxHub</div>;
    render(<TestComponent />);
    expect(screen.getByTestId('test')).toBeInTheDocument();
    expect(screen.getByText('Hello LuxHub')).toBeInTheDocument();
  });

  it('should handle async operations', async () => {
    const promise = Promise.resolve('success');
    await expect(promise).resolves.toBe('success');
  });
});
