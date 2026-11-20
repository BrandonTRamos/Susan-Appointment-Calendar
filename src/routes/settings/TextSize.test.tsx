// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { savedTextSize, showTextSize } from '../../lib/textSize';
import { atWidth, renderApp } from '../../test/renderApp';

const realMatchMedia = window.matchMedia;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
  localStorage.clear();
  showTextSize('standard');
});

const section = () => within(screen.getByRole('region', { name: 'Text size' }));
const shownLarger = () => document.documentElement.dataset.textSize === 'larger';

describe('the Text size section of Settings', () => {
  it('shows the usual size until Larger is chosen', () => {
    renderApp('/settings');
    expect(section().getByRole('radio', { name: /Standard/ })).toHaveProperty('checked', true);
    expect(section().getByRole('radio', { name: /Larger/ })).toHaveProperty('checked', false);
    expect(shownLarger()).toBe(false);
  });

  it('makes the words and buttons larger at once, and keeps them so on this device', async () => {
    const user = userEvent.setup();
    const { unmount } = renderApp('/settings');
    await user.click(section().getByRole('radio', { name: /Larger/ }));
    expect(shownLarger()).toBe(true);
    expect(savedTextSize()).toBe('larger');

    unmount();
    renderApp('/settings');
    expect(section().getByRole('radio', { name: /Larger/ })).toHaveProperty('checked', true);
  });

  it('goes back to the usual size', async () => {
    const user = userEvent.setup();
    renderApp('/settings');
    await user.click(section().getByRole('radio', { name: /Larger/ }));
    await user.click(section().getByRole('radio', { name: /Standard/ }));
    expect(shownLarger()).toBe(false);
    expect(savedTextSize()).toBe('standard');
  });
});
