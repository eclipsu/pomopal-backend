import { evalCondition, renderTemplate } from './template-render';

describe('renderTemplate', () => {
  it('substitutes context variables', () => {
    expect(renderTemplate('{{streak}} days strong', { streak: 7 })).toBe(
      '7 days strong',
    );
  });

  it('substitutes username', () => {
    expect(renderTemplate('Hey {{username}}!', { username: 'rajeev' })).toBe(
      'Hey rajeev!',
    );
  });

  it('leaves unknown placeholders empty', () => {
    expect(renderTemplate('Hi {{name}}', {})).toBe('Hi ');
  });

  it('picks if branch when condition is true', () => {
    expect(
      renderTemplate('{{#if streak > 7}}big{{else}}small{{/if}}', {
        streak: 12,
      }),
    ).toBe('big');
  });

  it('picks else branch when condition is false', () => {
    expect(
      renderTemplate('{{#if streak > 7}}big{{else}}small{{/if}}', {
        streak: 3,
      }),
    ).toBe('small');
  });

  it('supports else if chains', () => {
    const tpl =
      '{{#if streak > 30}}legend{{else if streak > 7}}solid{{else}}starting{{/if}}';
    expect(renderTemplate(tpl, { streak: 50 })).toBe('legend');
    expect(renderTemplate(tpl, { streak: 10 })).toBe('solid');
    expect(renderTemplate(tpl, { streak: 2 })).toBe('starting');
  });

  it('supports bare truthy checks', () => {
    expect(
      renderTemplate('{{#if isLastChance}}last{{else}}early{{/if}}', {
        isLastChance: true,
      }),
    ).toBe('last');
  });

  it('supports string equality', () => {
    expect(
      renderTemplate(
        '{{#if direction == you_passed}}up{{else}}down{{/if}}',
        { direction: 'you_passed' },
      ),
    ).toBe('up');
  });

  it('substitutes vars inside chosen branch', () => {
    expect(
      renderTemplate(
        '{{#if streak > 5}}Hey {{username}}, {{streak}} days!{{else}}hi{{/if}}',
        { streak: 9, username: 'Rajeev' },
      ),
    ).toBe('Hey Rajeev, 9 days!');
  });

  it('supports nested ifs', () => {
    expect(
      renderTemplate(
        '{{#if streak > 0}}{{#if streak > 10}}A{{else}}B{{/if}}{{else}}C{{/if}}',
        { streak: 12 },
      ),
    ).toBe('A');
  });

  it('picks from compact randomize{} options', () => {
    expect(
      renderTemplate('{{randomize{alpha|beta|gamma}}}', {
        __randomIndex: 1,
      }),
    ).toBe('beta');
  });

  it('picks from block randomize / or', () => {
    expect(
      renderTemplate(
        '{{#randomize}}one{{or}}two{{or}}three{{/randomize}}',
        { __randomIndex: 2 },
      ),
    ).toBe('three');
  });

  it('randomize works inside if branches', () => {
    expect(
      renderTemplate(
        '{{#if streak > 5}}{{randomize{hi|hey}}}{{else}}bye{{/if}}',
        { streak: 9, __randomIndex: 0 },
      ),
    ).toBe('hi');
  });
});

describe('evalCondition', () => {
  it('compares numbers and context keys', () => {
    expect(evalCondition('streak > goal', { streak: 30, goal: 25 })).toBe(true);
    expect(evalCondition('streak >= 7', { streak: 7 })).toBe(true);
    expect(evalCondition('rank != 1', { rank: 3 })).toBe(true);
  });
});
