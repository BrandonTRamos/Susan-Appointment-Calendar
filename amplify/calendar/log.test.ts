import { describe, expect, it } from 'vitest';
import { describeError } from './log';

describe('what a failure says in the logs', () => {
  it('names what broke', () => {
    const [name, message] = describeError(new TypeError('The data API is not answering'));
    expect(name).toBe('TypeError');
    expect(message).toBe('The data API is not answering');
  });

  it("never holds a phone number or a text's words, however the error quotes them", () => {
    const error = new Error(
      `Variable 'input' has an invalid value: {"words":"Susan's Calendar: Eye exam","to":"+15555550123"} for (555) 555-0123 or 555.555.0123`,
    );
    const said = describeError(error).join(' ');
    expect(said).not.toMatch(/555/);
    expect(said).not.toMatch(/Eye exam/);
    expect(said).toMatch(/invalid value/);
  });

  it('copes with something thrown that is not an error', () => {
    expect(describeError('+15555550123').join(' ')).not.toMatch(/555/);
  });
});
