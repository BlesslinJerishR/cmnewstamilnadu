/**
 * Demo data for offline/standalone builds.
 * This module provides realistic mock data that all screens can consume
 * without any backend API connection.
 */
import type {
  ArticleDetail,
  ArticleSummary,
  Category,
  FeedResponse,
  Paginated,
  SearchResponse,
  Source,
} from '@cmnews/shared';

const now = new Date();
function hoursAgo(h: number): string {
  return new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();
}

const categories: Category[] = [
  { slug: 'general', name: 'General', description: 'General news', isFeedSection: false },
  { slug: 'politics', name: 'Politics', description: 'Government and political news', isFeedSection: true },
  { slug: 'economy', name: 'Economy', description: 'Economic development and finance', isFeedSection: true },
  { slug: 'infrastructure', name: 'Infrastructure', description: 'Roads, metro, and public infrastructure', isFeedSection: true },
  { slug: 'education', name: 'Education', description: 'Schools, universities, and education policy', isFeedSection: true },
  { slug: 'health', name: 'Health', description: 'Public health and healthcare', isFeedSection: true },
  { slug: 'law-and-order', name: 'Law and Order', description: 'Court proceedings and law enforcement', isFeedSection: true },
];

const sources: Source[] = [
  { domain: 'thehindu.com', name: 'The Hindu', country: 'India', homepageUrl: 'https://www.thehindu.com', articleCount: 42 },
  { domain: 'ndtv.com', name: 'NDTV', country: 'India', homepageUrl: 'https://www.ndtv.com', articleCount: 38 },
  { domain: 'indianexpress.com', name: 'The Indian Express', country: 'India', homepageUrl: 'https://indianexpress.com', articleCount: 31 },
  { domain: 'timesofindia.indiatimes.com', name: 'Times of India', country: 'India', homepageUrl: 'https://timesofindia.indiatimes.com', articleCount: 29 },
  { domain: 'dtnext.in', name: 'DT Next', country: 'India', homepageUrl: 'https://www.dtnext.in', articleCount: 24 },
  { domain: 'newindianexpress.com', name: 'New Indian Express', country: 'India', homepageUrl: 'https://www.newindianexpress.com', articleCount: 21 },
  { domain: 'hindustantimes.com', name: 'Hindustan Times', country: 'India', homepageUrl: 'https://www.hindustantimes.com', articleCount: 18 },
  { domain: 'deccanherald.com', name: 'Deccan Herald', country: 'India', homepageUrl: 'https://www.deccanherald.com', articleCount: 15 },
];

const articles: ArticleSummary[] = [
  {
    id: 'demo-001',
    title: 'Tamil Nadu CM announces ₹5,000 crore infrastructure development plan for Chennai suburbs',
    description: 'The Chief Minister unveiled a comprehensive plan focusing on road upgrades, drainage systems, and public transport connectivity for rapidly growing suburban areas.',
    url: 'https://example.com/article/demo-001',
    sourceName: 'The Hindu',
    sourceDomain: 'thehindu.com',
    publishedAt: hoursAgo(1),
    categories: ['infrastructure', 'politics'],
    imageUrl: 'https://images.unsplash.com/photo-1582510003544-4d00b7f74220?w=600&q=80',
  },
  {
    id: 'demo-002',
    title: 'State government releases new education policy framework for schools across Tamil Nadu',
    description: 'The revised framework emphasises bilingual instruction, STEM integration, and digital literacy starting from primary school levels.',
    url: 'https://example.com/article/demo-002',
    sourceName: 'NDTV',
    sourceDomain: 'ndtv.com',
    publishedAt: hoursAgo(2),
    categories: ['education', 'politics'],
    imageUrl: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=600&q=80',
  },
  {
    id: 'demo-003',
    title: 'Madras High Court orders expedited hearing on environmental clearance for new port project',
    description: 'The court directed authorities to complete the environmental impact assessment within 90 days, citing economic importance of the project.',
    url: 'https://example.com/article/demo-003',
    sourceName: 'The Indian Express',
    sourceDomain: 'indianexpress.com',
    publishedAt: hoursAgo(3),
    categories: ['law-and-order', 'infrastructure'],
    imageUrl: null,
  },
  {
    id: 'demo-004',
    title: 'Tamil Nadu economy grows 9.2% in Q2, driven by IT and manufacturing sectors',
    description: 'The state\'s GDP growth outpaced the national average, with significant contributions from the automobile and electronics manufacturing corridors.',
    url: 'https://example.com/article/demo-004',
    sourceName: 'Times of India',
    sourceDomain: 'timesofindia.indiatimes.com',
    publishedAt: hoursAgo(4),
    categories: ['economy'],
    imageUrl: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=600&q=80',
  },
  {
    id: 'demo-005',
    title: 'New metro rail extension to connect airport with central business district',
    description: 'Phase 2 of the Chennai Metro Rail project will add 52 km of new track, significantly reducing travel time between the airport and the city centre.',
    url: 'https://example.com/article/demo-005',
    sourceName: 'DT Next',
    sourceDomain: 'dtnext.in',
    publishedAt: hoursAgo(5),
    categories: ['infrastructure'],
    imageUrl: 'https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&q=80',
  },
  {
    id: 'demo-006',
    title: 'CM inaugurates 150-bed government hospital in Coimbatore with advanced diagnostic facilities',
    description: 'The new facility features MRI, CT scan, and dialysis units, serving over 2 lakh residents in the western region.',
    url: 'https://example.com/article/demo-006',
    sourceName: 'New Indian Express',
    sourceDomain: 'newindianexpress.com',
    publishedAt: hoursAgo(6),
    categories: ['health', 'politics'],
    imageUrl: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?w=600&q=80',
  },
  {
    id: 'demo-007',
    title: 'Opposition demands white paper on state\'s fiscal deficit and borrowing trends',
    description: 'The AIADMK legislature party has called for a detailed breakdown of government spending and revenue shortfalls over the past two years.',
    url: 'https://example.com/article/demo-007',
    sourceName: 'Hindustan Times',
    sourceDomain: 'hindustantimes.com',
    publishedAt: hoursAgo(7),
    categories: ['politics', 'economy'],
    imageUrl: null,
  },
  {
    id: 'demo-008',
    title: 'Tamil Nadu IT exports cross $30 billion mark as global firms expand operations in state',
    description: 'Several multinational technology companies have announced plans to increase headcount and investment in Chennai and Coimbatore technology parks.',
    url: 'https://example.com/article/demo-008',
    sourceName: 'Deccan Herald',
    sourceDomain: 'deccanherald.com',
    publishedAt: hoursAgo(8),
    categories: ['economy'],
    imageUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=600&q=80',
  },
  {
    id: 'demo-009',
    title: 'State cabinet approves free breakfast scheme for 1.5 lakh government school students',
    description: 'The scheme will provide nutritious meals to primary school children across 10 districts as a pilot programme beginning next month.',
    url: 'https://example.com/article/demo-009',
    sourceName: 'The Hindu',
    sourceDomain: 'thehindu.com',
    publishedAt: hoursAgo(10),
    categories: ['education', 'politics'],
    imageUrl: 'https://images.unsplash.com/photo-1588075592446-265fd1e6e76f?w=600&q=80',
  },
  {
    id: 'demo-010',
    title: 'Police arrest cyber fraud gang operating across three southern states',
    description: 'The special cybercrime unit dismantled a network responsible for defrauding over 500 victims through fake investment schemes.',
    url: 'https://example.com/article/demo-010',
    sourceName: 'NDTV',
    sourceDomain: 'ndtv.com',
    publishedAt: hoursAgo(12),
    categories: ['law-and-order'],
    imageUrl: null,
  },
  {
    id: 'demo-011',
    title: 'Chennai corporation launches citywide waste segregation drive with door-to-door collection',
    description: 'The initiative mandates source segregation of wet and dry waste, with penalties for non-compliance starting next quarter.',
    url: 'https://example.com/article/demo-011',
    sourceName: 'Times of India',
    sourceDomain: 'timesofindia.indiatimes.com',
    publishedAt: hoursAgo(14),
    categories: ['infrastructure'],
    imageUrl: 'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&q=80',
  },
  {
    id: 'demo-012',
    title: 'Government medical college admissions to increase by 2,000 seats across Tamil Nadu',
    description: 'Five new government medical colleges will begin accepting students from the upcoming academic year, addressing the shortage of healthcare professionals.',
    url: 'https://example.com/article/demo-012',
    sourceName: 'The Indian Express',
    sourceDomain: 'indianexpress.com',
    publishedAt: hoursAgo(16),
    categories: ['health', 'education'],
    imageUrl: null,
  },
  {
    id: 'demo-013',
    title: 'CM holds review meeting on monsoon preparedness for flood-prone districts',
    description: 'Officials from 12 districts presented action plans for flood mitigation, including pre-positioned rescue equipment and relief supplies.',
    url: 'https://example.com/article/demo-013',
    sourceName: 'DT Next',
    sourceDomain: 'dtnext.in',
    publishedAt: hoursAgo(18),
    categories: ['politics'],
    imageUrl: 'https://images.unsplash.com/photo-1446034295857-c899f4c4e4ff?w=600&q=80',
  },
  {
    id: 'demo-014',
    title: 'Industrial corridor between Chennai and Salem receives central government approval',
    description: 'The ambitious project will create an industrial belt with logistics parks, special economic zones, and ancillary infrastructure over a 10-year period.',
    url: 'https://example.com/article/demo-014',
    sourceName: 'Hindustan Times',
    sourceDomain: 'hindustantimes.com',
    publishedAt: hoursAgo(20),
    categories: ['economy', 'infrastructure'],
    imageUrl: 'https://images.unsplash.com/photo-1581093588401-fbb62a02f120?w=600&q=80',
  },
  {
    id: 'demo-015',
    title: 'Tamil Nadu sets renewable energy generation record with 60% solar contribution',
    description: 'The state generated over 20,000 MW from renewable sources on a single day, with solar parks across the southern districts leading the effort.',
    url: 'https://example.com/article/demo-015',
    sourceName: 'The Hindu',
    sourceDomain: 'thehindu.com',
    publishedAt: hoursAgo(22),
    categories: ['economy', 'infrastructure'],
    imageUrl: 'https://images.unsplash.com/photo-1509391366360-2e959784a276?w=600&q=80',
  },
];

function toDetail(a: ArticleSummary): ArticleDetail {
  return {
    ...a,
    language: 'en',
    sourceCountry: 'India',
    author: null,
    firstSeenAt: a.publishedAt,
    alsoReportedBy: articles
      .filter((o) => o.id !== a.id && o.categories.some((c) => a.categories.includes(c)))
      .slice(0, 3)
      .map((o) => ({ id: o.id, title: o.title, url: o.url, sourceName: o.sourceName, sourceDomain: o.sourceDomain, publishedAt: o.publishedAt })),
  };
}

function paginate(items: ArticleSummary[], cursor?: string): Paginated<ArticleSummary> {
  const idx = cursor ? items.findIndex((a) => a.id === cursor) + 1 : 0;
  const page = items.slice(idx, idx + 20);
  return { items: page, nextCursor: idx + 20 < items.length ? items[idx + 19].id : null };
}

/** Simulates a tiny network delay so loading states render naturally. */
function delay<T>(data: T, ms = 300): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

export const demoApi = {
  feed: (): Promise<FeedResponse> => {
    const latestItems = articles.slice(0, 8);
    const politicsItems = articles.filter((a) => a.categories.includes('politics')).slice(0, 4);
    const economyItems = articles.filter((a) => a.categories.includes('economy')).slice(0, 4);
    const infraItems = articles.filter((a) => a.categories.includes('infrastructure')).slice(0, 4);
    const educationItems = articles.filter((a) => a.categories.includes('education')).slice(0, 4);
    const healthItems = articles.filter((a) => a.categories.includes('health')).slice(0, 4);

    return delay({
      generatedAt: now.toISOString(),
      sections: [
        { key: 'latest', title: 'Latest', categorySlug: null, items: latestItems },
        { key: 'politics', title: 'Politics', categorySlug: 'politics', items: politicsItems },
        { key: 'economy', title: 'Economy', categorySlug: 'economy', items: economyItems },
        { key: 'infrastructure', title: 'Infrastructure', categorySlug: 'infrastructure', items: infraItems },
        { key: 'education', title: 'Education', categorySlug: 'education', items: educationItems },
        { key: 'health', title: 'Health', categorySlug: 'health', items: healthItems },
      ],
    });
  },

  latest: (cursor?: string): Promise<Paginated<ArticleSummary>> => delay(paginate(articles, cursor)),

  byCategory: (slug: string, cursor?: string): Promise<Paginated<ArticleSummary>> => {
    const filtered = articles.filter((a) => a.categories.includes(slug));
    return delay(paginate(filtered, cursor));
  },

  bySource: (domain: string, cursor?: string): Promise<Paginated<ArticleSummary>> => {
    const filtered = articles.filter((a) => a.sourceDomain === domain);
    return delay(paginate(filtered, cursor));
  },

  byDate: (date: string, cursor?: string): Promise<Paginated<ArticleSummary>> => {
    const filtered = articles.filter((a) => a.publishedAt.startsWith(date));
    return delay(paginate(filtered.length ? filtered : articles.slice(0, 5), cursor));
  },

  search: (q: string, _sort: 'relevance' | 'latest', cursor?: string): Promise<SearchResponse> => {
    const lower = q.toLowerCase();
    const hits = articles.filter((a) => a.title.toLowerCase().includes(lower) || (a.description ?? '').toLowerCase().includes(lower));
    const page = paginate(hits.length ? hits : articles.slice(0, 3), cursor);
    return delay({ ...page, total: hits.length || 3, degraded: false });
  },

  suggest: (q: string): Promise<{ suggestions: string[] }> => {
    const lower = q.toLowerCase();
    const matches = ['Tamil Nadu', 'Chennai', 'infrastructure', 'education', 'CM', 'metro', 'hospital', 'economy', 'renewable energy', 'police']
      .filter((s) => s.toLowerCase().includes(lower))
      .slice(0, 5);
    return delay({ suggestions: matches });
  },

  article: (id: string): Promise<ArticleDetail> => {
    const found = articles.find((a) => a.id === id) ?? articles[0];
    return delay(toDetail(found));
  },

  categories: (): Promise<{ items: Category[] }> => delay({ items: categories }),

  sources: (): Promise<{ items: Source[] }> => delay({ items: sources }),
};

