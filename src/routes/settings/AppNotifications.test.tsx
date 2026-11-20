// @vitest-environment jsdom
import { cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSampleCalendar } from '../../data/sampleCalendar';
import { atWidth, daysFromToday, EASTERN, linda, renderApp } from '../../test/renderApp';
import { fakeRegistry, installFakePush, type FakePushOptions } from '../../test/fakePush';

const realMatchMedia = window.matchMedia;
let uninstall: (() => void) | null = null;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  uninstall?.();
  uninstall = null;
  window.matchMedia = realMatchMedia;
  vi.restoreAllMocks();
});

function device(options: FakePushOptions = {}) {
  const push = installFakePush(options);
  uninstall = push.uninstall;
  return push;
}

const section = () => screen.getByRole('region', { name: 'App notifications' });

describe('the App notifications section of Settings', () => {
  it('says what they are and who gets them', async () => {
    device();
    renderApp('/settings', { devices: fakeRegistry().registry });
    expect(
      within(section()).getByText(/someone else adds, changes or cancels an Appointment/),
    ).toBeInTheDocument();
    expect(within(section()).getByText(/only to Admins, never to Susan/)).toBeInTheDocument();
  });

  it('turns them on for the device in hand, keeping it against the account', async () => {
    const push = device();
    const { registry, turnedOn } = fakeRegistry();
    renderApp('/settings', { devices: registry });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }));
    expect(await within(section()).findByText('On for this device.')).toBeInTheDocument();
    expect(turnedOn).toEqual([
      {
        endpoint: push.subscription()!.endpoint,
        p256dh: 'p256dh-1',
        auth: 'auth-1',
        label: 'Mac',
      },
    ]);
  });

  it('turns them off again, and forgets the device', async () => {
    const push = device({ permission: 'granted', subscribed: true });
    const { endpoint } = push.subscription()!;
    const { registry, turnedOff } = fakeRegistry();
    renderApp('/settings', { devices: registry });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off for this device' }));
    expect(
      await screen.findByRole('button', { name: 'Turn on for this device' }),
    ).toBeInTheDocument();
    expect(turnedOff).toEqual([endpoint]);
    expect(push.subscription()).toBeNull();
  });

  it('says how to allow them when the person said no', async () => {
    device({ answer: 'denied' });
    const { registry, turnedOn } = fakeRegistry();
    renderApp('/settings', { devices: registry });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }));
    expect(await within(section()).findByText(/blocked for this app/)).toBeInTheDocument();
    expect(turnedOn).toEqual([]);
  });

  it('on an iPhone, explains that the app must first be added to the home screen', async () => {
    device({
      noPush: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    renderApp('/settings', { devices: fakeRegistry().registry });
    expect(
      await within(section()).findByText(/must first be added to the home screen/),
    ).toBeInTheDocument();
    expect(within(section()).getByText(/tap Share, then Add to Home Screen/)).toBeInTheDocument();
    expect(within(section()).queryByRole('button')).not.toBeInTheDocument();
  });

  it('on an iPhone with the app on the home screen, turns them on like anywhere else', async () => {
    device({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15',
    });
    const { registry, turnedOn } = fakeRegistry();
    renderApp('/settings', { devices: registry });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }));
    expect(await within(section()).findByText('On for this device.')).toBeInTheDocument();
    expect(turnedOn).toMatchObject([{ label: 'iPhone' }]);
  });

  it('says so when they could not be turned on', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    device();
    renderApp('/settings', { devices: fakeRegistry({ failing: true }).registry });
    await userEvent.click(await screen.findByRole('button', { name: 'Turn on for this device' }));
    expect(await within(section()).findByRole('alert')).toHaveTextContent(
      'Could not turn notifications on. Check your connection and try again.',
    );
    expect(screen.getByRole('button', { name: 'Turn on for this device' })).toBeEnabled();
  });

  it('is not available on sample data', async () => {
    device();
    renderApp('/settings');
    expect(await within(section()).findByText('Not available on sample data.')).toBeInTheDocument();
  });
});

describe('a device with app notifications on', () => {
  it('is forgotten when the person signs out', async () => {
    const push = device({ permission: 'granted', subscribed: true });
    const { endpoint } = push.subscription()!;
    const { registry, turnedOff } = fakeRegistry();
    const onSignOut = vi.fn(async () => {
      // Still signed in while the device is forgotten.
      expect(turnedOff).toEqual([endpoint]);
    });
    renderApp('/settings', { devices: registry, onSignOut });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() => expect(onSignOut).toHaveBeenCalledOnce());
    expect(push.subscription()).toBeNull();
    expect(push.closed()).toBe(1);
  });

  it('still signs out when the device could not be forgotten', async () => {
    device({ permission: 'granted', subscribed: true });
    const onSignOut = vi.fn(async () => {});
    renderApp('/settings', { devices: fakeRegistry({ failing: true }).registry, onSignOut });
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await vi.waitFor(() => expect(onSignOut).toHaveBeenCalledOnce());
  });

  it('is saved again each time the app opens', async () => {
    const push = device({ permission: 'granted', subscribed: true });
    const { registry, turnedOn } = fakeRegistry();
    renderApp('/', { devices: registry });
    await vi.waitFor(() =>
      expect(turnedOn).toMatchObject([{ endpoint: push.subscription()!.endpoint }]),
    );
  });

  it('opens the Appointment an Activity update is about when it is tapped', async () => {
    const push = device({ permission: 'granted', subscribed: true });
    const calendar = createSampleCalendar(EASTERN, { empty: true });
    const { id } = await calendar.core.addAppointment(linda, {
      what: 'Eye exam',
      date: daysFromToday(3),
      time: '15:30',
    });
    renderApp('/settings', { calendar, devices: fakeRegistry().registry });
    act(() => push.tap(`/appointments/${id}`));
    expect(await screen.findByRole('heading', { level: 1, name: 'Eye exam' })).toBeInTheDocument();
    expect(window.location.pathname).toBe(`/appointments/${id}`);
  });

  it('opens nothing outside the app when tapped', async () => {
    const push = device({ permission: 'granted', subscribed: true });
    renderApp('/settings', { devices: fakeRegistry().registry });
    act(() => push.tap('//example.com/elsewhere'));
    expect(window.location.pathname).toBe('/settings');
  });
});
