// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSampleCalendar, SAMPLE_MCP_URL } from '../../data/sampleCalendar';
import { createFixedClock } from '../../lib/calendar';
import { atWidth, EASTERN, renderApp } from '../../test/renderApp';

const realMatchMedia = window.matchMedia;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

/** An empty calendar, with a clock at 19 November 2026, 3:15 pm for Susan. */
const calendar = () =>
  createSampleCalendar(EASTERN, {
    empty: true,
    clock: createFixedClock('2026-11-19T20:15:00.000Z'),
  });

const section = () => within(screen.getByRole('region', { name: 'Agent keys' }));

/** Makes a key with this name in the section, and answers with the key as it is shown. */
async function make(user: ReturnType<typeof userEvent.setup>, name: string) {
  const here = section();
  await user.type(await here.findByRole('textbox', { name: 'Name for a new key' }), name);
  await user.click(here.getByRole('button', { name: 'Create key' }));
  const shown = (await here.findByRole('textbox', { name: 'Your new key' })) as HTMLInputElement;
  return shown.value;
}

describe('the Agent keys section of Settings', () => {
  it('makes a key, shows it once with the address to connect to, and copies it', async () => {
    const user = userEvent.setup();
    const cal = calendar();
    renderApp('/settings', { calendar: cal });
    const here = section();
    expect(await here.findByText('You have no agent keys.')).toBeTruthy();
    expect(here.getByText(/recorded as yours, via agent/)).toBeTruthy();

    const key = await make(user, 'Claude on my laptop');
    expect(key).toMatch(/^sc_agent_[\w-]{43}$/);
    expect(here.getByText(/shown only this once/)).toBeTruthy();
    expect(
      (here.getByRole('textbox', { name: 'Address to connect to' }) as HTMLInputElement).value,
    ).toBe(SAMPLE_MCP_URL);
    expect(here.getByText(/Authorization: Bearer/)).toBeTruthy();

    await user.click(here.getByRole('button', { name: 'Copy key' }));
    expect(await navigator.clipboard.readText()).toBe(key);
    expect(here.getByRole('status').textContent).toBe('Copied.');

    // It works: the calendar takes it as the person's.
    expect(await cal.core.agentKeyOwner(key)).toBe('sample-you');
    expect(here.getByRole('listitem').textContent).toMatch(
      /Claude on my laptop.*Made Thu, Nov 19, 2026 at 3:15 pm/,
    );
  });

  it('never shows a key again once the screen is left, only its name', async () => {
    const user = userEvent.setup();
    const cal = calendar();
    const first = renderApp('/settings', { calendar: cal });
    const key = await make(user, 'Laptop');
    first.unmount();

    renderApp('/settings', { calendar: cal });
    expect(await section().findByText('Laptop')).toBeTruthy();
    expect(section().queryByRole('textbox', { name: 'Your new key' })).toBeNull();
    expect(document.body.textContent).not.toContain(key);
  });

  it('revokes a key, after asking, and it stops working at once', async () => {
    const user = userEvent.setup();
    const cal = calendar();
    renderApp('/settings', { calendar: cal });
    const laptop = await make(user, 'Laptop');
    const phone = await make(user, 'Phone');
    const here = section();

    await user.click(here.getByRole('button', { name: 'Revoke Laptop' }));
    const asking = here.getByRole('group', { name: 'Revoke Laptop?' });
    expect(asking.textContent).toMatch(/stops working at once/);
    await user.click(within(asking).getByRole('button', { name: 'Yes, revoke it' }));

    expect(await cal.core.agentKeyOwner(laptop)).toBeNull();
    expect(await cal.core.agentKeyOwner(phone)).toBe('sample-you');
    expect(here.queryByText('Laptop')).toBeNull();
    expect(here.getAllByRole('listitem')).toHaveLength(1);
  });

  it('keeps the key when told no, and says why a key cannot be made', async () => {
    const user = userEvent.setup();
    const cal = calendar();
    renderApp('/settings', { calendar: cal });
    const key = await make(user, 'Laptop');
    const here = section();
    await user.click(here.getByRole('button', { name: 'Revoke Laptop' }));
    await user.click(here.getByRole('button', { name: 'No, keep it' }));
    expect(await cal.core.agentKeyOwner(key)).toBe('sample-you');

    await user.click(here.getByRole('button', { name: 'Create key' }));
    expect((await here.findByRole('alert')).textContent).toMatch(/Give the key a name/);
  });
});
