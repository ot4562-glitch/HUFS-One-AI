// @vitest-environment jsdom
import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, fireEvent, render, screen} from '@testing-library/react';
import {useState} from 'react';

afterEach(cleanup);

function Counter() {
  const [n, setN] = useState(0);
  return <button type="button" onClick={() => setN(n + 1)}>눌린 횟수 {n}</button>;
}

describe('React + jsdom toolchain', () => {
  it('renders and handles events in jsdom', () => {
    render(<Counter />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button').textContent).toBe('눌린 횟수 1');
  });
});
