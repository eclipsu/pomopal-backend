import { renderTemplate } from './template-render';

describe('renderTemplate', () => {
  it('substitutes context variables', () => {
    expect(
      renderTemplate('{{streak}} days strong', { streak: 7 }),
    ).toBe('7 days strong');
  });

  it('substitutes username', () => {
    expect(renderTemplate('Hey {{username}}!', { username: 'rajeev' })).toBe(
      'Hey rajeev!',
    );
  });

  it('leaves unknown placeholders empty', () => {
    expect(renderTemplate('Hi {{name}}', {})).toBe('Hi ');
  });
});
