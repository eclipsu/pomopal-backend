import { greetingName } from './greeting-name';

describe('greetingName', () => {
  it('prefers first name from display name', () => {
    expect(
      greetingName({ name: 'Rajeev Shrestha', username: 'rajeev2' }),
    ).toBe('Rajeev');
  });

  it('falls back to username', () => {
    expect(greetingName({ name: '', username: 'rajeev2' })).toBe('rajeev2');
    expect(greetingName({ name: null, username: 'rajeev2' })).toBe('rajeev2');
  });
});
