// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMonth, monthOf } from './lib/monthGrid';
import { atWidth, daysFromToday, renderApp } from './test/renderApp';

const realMatchMedia = window.matchMedia;

/** The Month tab's heading: the month on show, which starts as today's. */
const thisMonth = () => formatMonth(monthOf(daysFromToday(0)));

const tabNames = () =>
  within(screen.getByRole('navigation', { name: 'Main' }))
    .getAllByRole('link')
    .map((link) => link.textContent);

beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

describe('on a phone', () => {
  it('opens on Upcoming, headed with the app name, with a bottom tab bar of Upcoming, Month, Replies and Settings', () => {
    renderApp();
    expect(screen.getByRole('heading', { level: 1, name: "Susan's Calendar" })).toBeInTheDocument();
    expect(tabNames()).toEqual(['Upcoming', 'Month', 'Replies', 'Settings']);
    expect(screen.getByRole('link', { name: 'Upcoming' })).toHaveAttribute('aria-current', 'page');
  });

  it('has no sidebar or detail panel, and offers New Appointment on Upcoming itself', async () => {
    renderApp();
    expect(screen.queryByRole('banner')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('complementary', { name: 'Appointment details' }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('link', { name: 'New Appointment' }));
    expect(window.location.pathname).toBe('/appointments/new');
    expect(screen.getByRole('heading', { level: 1, name: 'New Appointment' })).toBeInTheDocument();
  });
});

describe('on a desktop', () => {
  beforeEach(() => atWidth('desktop'));

  it('has a sidebar with the app name, New Appointment and all five tabs', () => {
    renderApp();
    const sidebar = screen.getByRole('banner');
    expect(within(sidebar).getByText("Susan's Calendar")).toBeInTheDocument();
    // The sidebar's is the only one: Upcoming does not repeat it at this width.
    expect(screen.getAllByRole('link', { name: 'New Appointment' })).toEqual([
      within(sidebar).getByRole('link', { name: 'New Appointment' }),
    ]);
    expect(tabNames()).toEqual(['Upcoming', 'Month', 'Past', 'Replies', 'Settings']);
  });

  it('shows the current tab in the middle and keeps a region for the detail panel', () => {
    renderApp('/month');
    expect(
      within(screen.getByRole('main')).getByRole('heading', { level: 1, name: thisMonth() }),
    ).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Appointment details' })).toBeInTheDocument();
  });

  it('names the signed-in person in the sidebar', () => {
    renderApp();
    expect(within(screen.getByRole('banner')).getByText('Linda')).toBeInTheDocument();
  });

  it('opens the form for a new Appointment in the detail panel from the sidebar button', async () => {
    renderApp();
    await userEvent.click(screen.getByRole('link', { name: 'New Appointment' }));
    expect(window.location.pathname).toBe('/appointments/new');
    const panel = screen.getByRole('complementary', { name: 'Appointment details' });
    expect(
      within(panel).getByRole('heading', { level: 2, name: 'New Appointment' }),
    ).toBeInTheDocument();
  });
});

/** Each tab is headed with its name, except Month, headed with the month on show. */
const headed = (tab: string) => (tab === 'Month' ? thisMonth() : tab);

describe('tabs and their URLs', () => {
  it.each([
    ['/', 'Upcoming'],
    ['/month', 'Month'],
    ['/past', 'Past'],
    ['/replies', 'Replies'],
    ['/settings', 'Settings'],
  ])('%s opens the %s tab, as after a reload or from a shared link', (path, name) => {
    atWidth('desktop');
    renderApp(path);
    expect(screen.getByRole('heading', { level: 1, name: headed(name) })).toBeInTheDocument();
    expect(screen.getByRole('link', { name })).toHaveAttribute('aria-current', 'page');
  });

  it('gives each tab its own URL as you move between them', async () => {
    atWidth('desktop');
    renderApp();
    for (const [name, path] of [
      ['Month', '/month'],
      ['Past', '/past'],
      ['Replies', '/replies'],
      ['Settings', '/settings'],
      ['Upcoming', '/'],
    ]) {
      await userEvent.click(screen.getByRole('link', { name }));
      expect(window.location.pathname).toBe(path);
      expect(screen.getByRole('heading', { level: 1, name: headed(name) })).toBeInTheDocument();
    }
  });

  it('opens Upcoming for an address that does not exist', () => {
    renderApp('/no-such-page');
    expect(screen.getByRole('heading', { level: 1, name: "Susan's Calendar" })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });
});

describe('Settings', () => {
  it('has a separate section for each part', () => {
    renderApp('/settings');
    const sections = screen.getAllByRole('region');
    expect(sections.map((section) => section.getAttribute('aria-label'))).toEqual([
      "Susan's phone and contact",
      'App notifications',
      'Text size',
      'Calendar subscription',
      'Agent keys',
    ]);
    for (const section of sections) {
      const name = section.getAttribute('aria-label')!;
      expect(within(section).getByRole('heading', { level: 2, name })).toBeInTheDocument();
    }
  });

  it("says times are Susan's local time, whatever zone this device is in", () => {
    renderApp('/settings');
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).not.toBe('America/New_York');
    expect(screen.getByText(/Susan's local time \(Eastern Time\)/)).toBeInTheDocument();
  });

  it('names the signed-in person', () => {
    renderApp('/settings', { onSignOut: async () => {} });
    expect(screen.getByText(/Signed in as Linda/)).toBeInTheDocument();
  });
});

describe('signing out', () => {
  it('signs out from Settings', async () => {
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    renderApp('/settings', { onSignOut });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('signs out from the desktop sidebar', async () => {
    atWidth('desktop');
    const onSignOut = vi.fn().mockResolvedValue(undefined);
    renderApp('/', { onSignOut });
    await userEvent.click(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Sign out' }),
    );
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('says so when signing out fails, and lets the person try again', async () => {
    const onSignOut = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(null);
    renderApp('/settings', { onSignOut });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not sign out. Try again.');
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(onSignOut).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

describe('sample data', () => {
  it('says the app is showing sample data, with nobody signed in and no sign-out', () => {
    renderApp('/settings', { sampleData: true });
    expect(screen.getByRole('status')).toHaveTextContent(/Sample data/);
    expect(screen.queryByText(/Signed in/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sign out' })).not.toBeInTheDocument();
  });

  it('shows no sample-data notice against a real backend', () => {
    renderApp('/', { onSignOut: async () => {} });
    expect(screen.queryByText(/Sample data/)).not.toBeInTheDocument();
  });
});
