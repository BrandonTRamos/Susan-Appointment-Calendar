// @vitest-environment jsdom
import { act, cleanup, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSampleCalendar, SAMPLE_NUMBER } from '../../data/sampleCalendar';
import { atWidth, EASTERN, renderApp } from '../../test/renderApp';

const realMatchMedia = window.matchMedia;
beforeEach(() => atWidth('phone'));
afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

const section = () => within(screen.getByRole('region', { name: "Susan's phone and contact" }));
const noNumber = () => createSampleCalendar(EASTERN, { empty: true, susansNumber: null });

describe("the Susan's phone and contact section of Settings", () => {
  it('says clearly that nothing is sent while no number is set', async () => {
    renderApp('/settings', { calendar: noNumber() });
    expect(await section().findByRole('note')).toHaveTextContent(
      'No mobile number is set, so no texts are sent to Susan.',
    );
    expect(section().getByRole('textbox', { name: "Susan's mobile number" })).toHaveValue('');
  });

  it("keeps Susan's number and the contact for the automatic answer", async () => {
    const user = userEvent.setup();
    const { calendar } = renderApp('/settings', { calendar: noNumber() });
    await user.type(
      await section().findByRole('textbox', { name: "Susan's mobile number" }),
      '555.555.0123',
    );
    await user.type(section().getByRole('textbox', { name: 'Who Susan should call' }), 'Linda');
    await user.type(section().getByRole('textbox', { name: 'Their phone number' }), '5555550187');
    await user.click(section().getByRole('button', { name: 'Save' }));
    expect(await section().findByRole('status')).toHaveTextContent('Saved.');
    expect(section().getByRole('textbox', { name: "Susan's mobile number" })).toHaveValue(
      '(555) 555-0123',
    );
    expect(section().getByRole('textbox', { name: 'Their phone number' })).toHaveValue(
      '(555) 555-0187',
    );
    expect(section().queryByRole('note')).not.toBeInTheDocument();
    expect(await calendar.store.settings()).toMatchObject({
      susansNumber: SAMPLE_NUMBER,
      contactName: 'Linda',
      contactPhone: '+15555550187',
    });
  });

  it('says what is wrong with a number that is not one, and keeps nothing', async () => {
    const user = userEvent.setup();
    const { calendar } = renderApp('/settings', { calendar: noNumber() });
    await user.type(
      await section().findByRole('textbox', { name: "Susan's mobile number" }),
      '555-0123',
    );
    await user.click(section().getByRole('button', { name: 'Save' }));
    expect(await section().findByRole('alert')).toHaveTextContent(
      'That is not a US mobile number.',
    );
    expect((await calendar.store.settings()).susansNumber).toBeNull();
  });

  it('sends a test text through the same path and shows its status', async () => {
    const user = userEvent.setup();
    const calendar = createSampleCalendar(EASTERN, { empty: true });
    renderApp('/settings', { calendar });
    await user.click(await section().findByRole('button', { name: 'Send a test text' }));
    expect(await section().findByRole('status', { name: 'Test text' })).toHaveTextContent('Sent');
    expect(calendar.sender.taken()).toEqual([
      { to: SAMPLE_NUMBER, words: expect.stringMatching(/^Susan's Calendar: This is a test text/) },
    ]);
    expect(calendar.store.texts()).toMatchObject([{ kind: 'test', status: 'sent' }]);
  });

  it('shows the test text delivered once the phone company has accepted it', async () => {
    const user = userEvent.setup();
    const calendar = createSampleCalendar(EASTERN, { empty: true });
    renderApp('/settings', { calendar });
    await user.click(await section().findByRole('button', { name: 'Send a test text' }));
    expect(await section().findByRole('status', { name: 'Test text' })).toHaveTextContent('Sent');
    // What the scheduled run records once Textbelt says it was delivered.
    const [test] = calendar.store.texts();
    await act(() => calendar.store.replaceText({ ...test, status: 'delivered' }));
    expect(await section().findByRole('status', { name: 'Test text' })).toHaveTextContent(
      'Delivered Her phone company accepted it for her phone.',
    );
  });

  it('shows a test text the sender refused as failed', async () => {
    const user = userEvent.setup();
    const calendar = createSampleCalendar(EASTERN, { empty: true });
    calendar.sender.refuseNext();
    renderApp('/settings', { calendar });
    await user.click(await section().findByRole('button', { name: 'Send a test text' }));
    expect(await section().findByRole('status', { name: 'Test text' })).toHaveTextContent(
      'Failed The text was refused',
    );
  });

  it('will not send a test text with no number, and says why', async () => {
    const user = userEvent.setup();
    const calendar = noNumber();
    renderApp('/settings', { calendar });
    await user.click(await section().findByRole('button', { name: 'Send a test text' }));
    expect(await section().findByRole('alert')).toHaveTextContent(
      "Enter Susan's mobile number first.",
    );
    expect(calendar.store.texts()).toEqual([]);
  });

  it('says when texts are only recorded and reach no phone', async () => {
    renderApp('/settings', { calendar: noNumber() });
    expect(await section().findByText(/Texts are recorded here, not sent to a phone/)).toBeTruthy();
  });

  it('says nothing of the kind once the backend sends texts through Textbelt', async () => {
    let asked = false;
    const calendar = {
      ...noNumber(),
      textsRecordedOnly: async () => {
        asked = true;
        return false;
      },
    };
    renderApp('/settings', { calendar });
    expect(await section().findByRole('note')).toBeTruthy();
    expect(asked).toBe(true);
    expect(section().queryByText(/Texts are recorded here/)).not.toBeInTheDocument();
  });
});
