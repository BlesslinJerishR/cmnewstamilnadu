import { normalizeCandidate } from '../processing/normalizer';
import { assessQuality } from './quality.filter';

function article(title: string, url = 'https://www.thehindu.com/news/story-1.ece', language = 'English', publishedAt = '20260512T101500Z') {
  const r = normalizeCandidate({ provider: 'test', url, title, language, publishedAt });
  if (!r.ok) throw new Error(r.reason);
  return r.article;
}
const ctx = { now: new Date('2026-09-18T00:00:00Z'), sourceStatus: 'active' as const, allowedLanguages: ['en'] };

describe('assessQuality', () => {
  it('accepts a normal article', () => {
    expect(assessQuality(article('Tamil Nadu CM Vijay announces new welfare scheme'), ctx).status).toBe('accepted');
  });
  it('rejects blocked sources, other languages, short and spam titles, homepages', () => {
    expect(assessQuality(article('Tamil Nadu CM Vijay announces new welfare scheme'), { ...ctx, sourceStatus: 'blocked' }).status).toBe('rejected');
    expect(assessQuality(article('Tamil Nadu CM Vijay announces new scheme', undefined, 'Tamil'), ctx).status).toBe('rejected');
    expect(assessQuality(article('Vijay'), ctx).status).toBe('rejected');
    expect(assessQuality(article('Best casino betting tips for Vijay fans today'), ctx).status).toBe('rejected');
    expect(assessQuality(article('Tamil Nadu CM Vijay announces new welfare scheme', 'https://www.thehindu.com/'), ctx).status).toBe('rejected');
    expect(assessQuality(article('புதிய திட்டம் அறிவிப்பு முதல்வர் விஜய் இன்று'), ctx).reasons).toContain('title_not_english_script');
  });
  it('sends soft problems to review', () => {
    expect(assessQuality(article('Tamil Nadu CM Vijay announces new welfare scheme', 'https://news.example.xyz/a/b'), ctx).status).toBe('pending_review');
    expect(assessQuality(article('CM Vijay live updates from the assembly session', 'https://x.in/live-updates/cm'), ctx).status).toBe('pending_review');
  });
  it('rejects timestamps in the future', () => {
    expect(assessQuality(article('Tamil Nadu CM Vijay announces new welfare scheme', undefined, 'English', '20270101T000000Z'), ctx).reasons).toContain('timestamp_in_future');
  });
});
