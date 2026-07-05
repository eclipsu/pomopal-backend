import {
  buildNotificationCardHtml,
  buildNotificationCardText,
} from './notification-card-email';

describe('notification-card-email', () => {
  it('renders title and body', () => {
    const html = buildNotificationCardHtml({
      title: '7-day streak!',
      body: 'Keep it going.',
    });
    expect(html).toContain('7-day streak!');
    expect(html).toContain('Keep it going.');
    expect(html).toContain('🍅');
  });

  it('renders hero image when imageUrl is provided', () => {
    const html = buildNotificationCardHtml({
      title: 'New feature',
      body: 'Try it now.',
      imageUrl: 'cid:pomopal-notification-image',
      imageAlt: 'Pomopal preview',
    });
    expect(html).toContain('src="cid:pomopal-notification-image"');
    expect(html).toContain('alt="Pomopal preview"');
  });

  it('renders CTA button with link', () => {
    const html = buildNotificationCardHtml({
      title: 'Streak at risk',
      body: 'One pomodoro saves it.',
      cta: { label: 'Start focus', href: 'https://pomopal.lol' },
    });
    expect(html).toContain('Start focus');
    expect(html).toContain('href="https://pomopal.lol"');
  });

  it('escapes HTML in user content', () => {
    const html = buildNotificationCardHtml({
      title: '<script>alert(1)</script>',
      body: 'Safe & sound',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('builds plain-text with optional CTA', () => {
    const text = buildNotificationCardText({
      title: 'Hi',
      body: 'Hello there',
      cta: { label: 'Open', href: 'https://pomopal.lol' },
    });
    expect(text).toContain('Hi');
    expect(text).toContain('Open: https://pomopal.lol');
  });
});
