/**
 * OpenSearch article index definition.
 *
 * - One primary shard, zero replicas: this is a single node on a small VPS. Replicas could never
 *   be allocated on one node and would keep the cluster yellow while wasting memory.
 * - `dynamic: strict`: the index only accepts fields we map. Adding a field (for example a future
 *   Tamil title) means creating a new versioned index and reindexing from PostgreSQL.
 * - Text is analysed twice: an English analyser with stemming and stop words for recall, and a
 *   non-stemmed "exact" sub-field used to reward exact wording and phrases.
 */
export function buildArticleIndexBody(refreshInterval: string) {
  return {
    settings: {
      index: {
        number_of_shards: 1,
        number_of_replicas: 0,
        refresh_interval: refreshInterval,
        max_result_window: 10000,
      },
      analysis: {
        filter: {
          english_stop: { type: 'stop', stopwords: '_english_' },
          english_stemmer: { type: 'stemmer', language: 'english' },
          english_possessive_stemmer: { type: 'stemmer', language: 'possessive_english' },
        },
        normalizer: {
          lowercase_normalizer: { type: 'custom', filter: ['lowercase', 'asciifolding'] },
        },
        analyzer: {
          english_text: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['english_possessive_stemmer', 'lowercase', 'asciifolding', 'english_stop', 'english_stemmer'],
          },
          exact_text: {
            type: 'custom',
            tokenizer: 'standard',
            filter: ['lowercase', 'asciifolding'],
          },
        },
      },
    },
    mappings: {
      dynamic: 'strict',
      properties: {
        id: { type: 'keyword' },
        niche: { type: 'keyword' },
        title: {
          type: 'text',
          analyzer: 'english_text',
          fields: {
            exact: { type: 'text', analyzer: 'exact_text' },
            suggest: { type: 'search_as_you_type', analyzer: 'exact_text', max_shingle_size: 3 },
          },
        },
        description: {
          type: 'text',
          analyzer: 'english_text',
          fields: { exact: { type: 'text', analyzer: 'exact_text' } },
        },
        source_name: {
          type: 'text',
          analyzer: 'exact_text',
          fields: { keyword: { type: 'keyword', normalizer: 'lowercase_normalizer' } },
        },
        source_domain: { type: 'keyword' },
        source_country: { type: 'keyword' },
        categories: { type: 'keyword' },
        language: { type: 'keyword' },
        published_at: { type: 'date' },
        first_seen_at: { type: 'date' },
        relevance_score: { type: 'float' },
        url: { type: 'keyword', index: false, doc_values: false },
        image_url: { type: 'keyword', index: false, doc_values: false },
      },
    },
  };
}

export interface ArticleSearchDocument {
  id: string;
  niche: string;
  title: string;
  description: string | null;
  source_name: string;
  source_domain: string;
  source_country: string | null;
  categories: string[];
  language: string;
  published_at: string;
  first_seen_at: string;
  relevance_score: number;
  url: string;
  image_url: string | null;
}
