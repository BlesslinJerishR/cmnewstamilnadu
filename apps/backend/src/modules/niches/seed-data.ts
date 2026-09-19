/**
 * Initial configuration for the first niche. Seeding is additive: rows that already exist
 * (matched by their natural keys) are left untouched so admin edits are never overwritten.
 *
 * All regex patterns run against the *match text* form of a field: lower case, accents
 * removed, every run of punctuation/whitespace collapsed to a single space
 * (so "C. Joseph Vijay" becomes "c joseph vijay").
 */

export const SEED_NICHE = {
  slug: 'tn-cm',
  name: 'Tamil Nadu Chief Minister',
  description: 'News about Tamil Nadu Chief Minister C. Joseph Vijay and his government.',
  acceptThreshold: 50,
  reviewThreshold: 30,
  relevanceConfig: {
    fieldMultipliers: { title: 1, description: 0.7, url: 0.6, entities: 0.8 },
    anchorPattern: '\\bvijay\\b',
    countryBoosts: { india: 3 },
    multiQueryBonus: 5,
    frequencyBonusPerExtra: 0.1,
    frequencyBonusCap: 3,
  },
};

/** GDELT DOC API query syntax: quoted phrases, implicit AND, OR inside parentheses. */
export const SEED_QUERIES = [
  { name: 'joseph-vijay', queryText: '"Joseph Vijay"', priority: 1, windowMinutes: 180, relevanceWeight: 35 },
  { name: 'chief-minister-vijay', queryText: '"Chief Minister Vijay"', priority: 1, windowMinutes: 180, relevanceWeight: 35 },
  { name: 'cm-vijay-tamil-nadu', queryText: '"CM Vijay" "Tamil Nadu"', priority: 2, windowMinutes: 180, relevanceWeight: 30 },
  { name: 'vijay-tamil-nadu-chief-minister', queryText: 'Vijay "Tamil Nadu" "Chief Minister"', priority: 2, windowMinutes: 180, relevanceWeight: 25 },
  { name: 'vijay-tvk', queryText: 'Vijay "Tamilaga Vettri Kazhagam"', priority: 3, windowMinutes: 180, relevanceWeight: 20 },
];

type Field = 'title' | 'description' | 'url' | 'entities';
const ALL: Field[] = ['title', 'description', 'url', 'entities'];
const TEXT: Field[] = ['title', 'description', 'url'];

export interface SeedRule {
  name: string;
  ruleType: 'phrase' | 'regex' | 'proximity';
  pattern: string;
  patternB?: string;
  maxDistance?: number;
  fields: Field[];
  weight: number;
  notes: string;
}

/** Other well-known people, places and phrases named "Vijay ...". */
const OTHER_VIJAY_SURNAMES =
  'sethupathi|antony|devarakonda|deverakonda|varma|raaz|raz|mallya|rupani|shankar|hazare|sinha|wadettiwar|vasanth|yesudas|prakash|kumar|shekhar|goel|chowk|nagar|singh|bahuguna|mishra|patil|babu|milton|kedia|amritraj|mahajan|jolly|sai|sales|bank|bhaskar|raghavan|thakur|chouhan|chauhan|dahiya|kiragandur|salgaonkar|sampla|oberoi|rathore|yadav|gupta|mehta|malhotra|patel|chaudhary|chaudhry|sardesai|tendulkar|kichlu|diwas|hazaribagh|sharma|bahadur|mallik|pal';

export const SEED_RELEVANCE_RULES: SeedRule[] = [
  // High confidence
  { name: 'joseph-vijay', ruleType: 'regex', pattern: '\\b(c )?joseph (c )?vijay\\b', fields: ALL, weight: 45, notes: 'Full name, with or without the initial.' },
  { name: 'chief-minister-vijay', ruleType: 'regex', pattern: `(?<!deputy )\\b(chief minister|cm) (c )?(joseph )?vijay\\b(?! (${OTHER_VIJAY_SURNAMES})\\b)`, fields: ALL, weight: 45, notes: '"Chief Minister Vijay", "CM Vijay", "CM C Joseph Vijay" (not "CM Vijay Rupani" or "Deputy CM Vijay Sharma").' },
  { name: 'vijay-as-chief-minister', ruleType: 'regex', pattern: '\\bvijay (as |is |the )?(tamil nadu |tn |state )?(chief minister|cm)\\b', fields: TEXT, weight: 35, notes: '"Vijay as Tamil Nadu CM".' },
  { name: 'tvk-chief-vijay', ruleType: 'regex', pattern: '\\b(tvk|tamilaga vettri kazhagam) (chief|president|leader|founder|supremo) (c )?(joseph )?vijay\\b', fields: ALL, weight: 35, notes: 'Party leader references.' },
  // Medium confidence / context
  { name: 'tamil-nadu-cm', ruleType: 'regex', pattern: '\\b(tamil nadu|tn) (chief minister|cm)\\b', fields: TEXT, weight: 25, notes: 'State office; only counts when the Vijay anchor is present.' },
  { name: 'vijay-government-proximity', ruleType: 'proximity', pattern: 'vijay', patternB: 'government|govt|cabinet|secretariat|minister|ministers|assembly|administration|chief minister|cm', maxDistance: 5, fields: TEXT, weight: 15, notes: 'Vijay near government words.' },
  { name: 'vijay-tvk-proximity', ruleType: 'proximity', pattern: 'vijay', patternB: 'tvk|tamilaga vettri kazhagam', maxDistance: 4, fields: TEXT, weight: 20, notes: '"Vijay\'s TVK", "TVK founder Vijay": the party leader before and after taking office.' },
  { name: 'tamil-nadu', ruleType: 'regex', pattern: '\\b(tamil nadu|tn|tamilnadu)\\b', fields: ALL, weight: 10, notes: 'Geographic relevance.' },
  { name: 'tvk', ruleType: 'regex', pattern: '\\b(tvk|tamilaga vettri kazhagam)\\b', fields: ALL, weight: 12, notes: "The Chief Minister's party." },
  { name: 'fort-st-george', ruleType: 'regex', pattern: '\\b(fort st george|fort saint george|tamil nadu secretariat)\\b', fields: TEXT, weight: 6, notes: 'Seat of the state government.' },
  { name: 'chennai', ruleType: 'phrase', pattern: 'chennai', fields: ALL, weight: 4, notes: 'State capital.' },
  // Low confidence
  { name: 'vijay', ruleType: 'regex', pattern: '\\bvijay\\b', fields: ALL, weight: 12, notes: 'Bare name. Weak alone by design.' },
  // Negative signals
  { name: 'other-vijays', ruleType: 'regex', pattern: `\\bvijay (${OTHER_VIJAY_SURNAMES})\\b`, fields: ALL, weight: -35, notes: 'Other people and places named Vijay.' },
  { name: 'vijay-diwas', ruleType: 'regex', pattern: '\\b(kargil )?vijay (diwas|dashami|dasami|sankalp|utsav|rath|stambh)\\b', fields: ALL, weight: -80, notes: 'Events and phrases containing the word Vijay.' },
  { name: 'vijay-tv', ruleType: 'regex', pattern: '\\bvijay (tv|television|awards)\\b', fields: ALL, weight: -40, notes: 'Star Vijay television channel.' },
  { name: 'film-terms', ruleType: 'regex', pattern: '\\b(box office|trailer|teaser|film|films|movie|movies|cinema|song|songs|actor|actress|ott|shooting|audio launch|release date|fan club|fans club|biopic|remake|jana nayagan|thalapathy 69)\\b', fields: ['title', 'url'], weight: -12, notes: 'Film coverage.' },
  { name: 'entertainment-section', ruleType: 'regex', pattern: '\\b(entertainment|movies|cinema|bollywood|kollywood|tollywood|celebrity|celebrities|gossip|showbiz|web series)\\b', fields: ['url'], weight: -15, notes: 'Entertainment sections of news sites.' },
  { name: 'sports-section', ruleType: 'regex', pattern: '\\b(cricket|ipl|sports|kabaddi)\\b', fields: ['url'], weight: -15, notes: 'Sports sections (e.g. Vijay Hazare Trophy).' },
];

export interface SeedCategory {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
  isFeedSection: boolean;
  minScore: number;
  keywords: string[];
}

export const SEED_CATEGORIES: SeedCategory[] = [
  { slug: 'politics', name: 'Politics', description: 'Parties, alliances, opposition and political developments.', sortOrder: 10, isFeedSection: true, minScore: 1,
    keywords: ['politics', 'political', 'party', 'parties', 'tvk', 'tamilaga vettri kazhagam', 'dmk', 'aiadmk', 'bjp', 'congress', 'pmk', 'vck', 'ntk', 'opposition', 'alliance', 'coalition', 'rally', 'cadre', 'cadres', 'mla', 'mlas', 'mp', 'mps', 'stalin', 'palaniswami', 'eps', 'annamalai', 'seeman', 'walkout'] },
  { slug: 'government', name: 'Government', description: 'State government decisions, cabinet and administration.', sortOrder: 20, isFeedSection: true, minScore: 1,
    keywords: ['government', 'govt', 'cabinet', 'minister', 'ministers', 'ministry', 'secretariat', 'department', 'administration', 'official', 'officials', 'ias', 'chief secretary', 'governor', 'assembly', 'speaker', 'government order', 'swearing in', 'sworn in', 'portfolio', 'portfolios'] },
  { slug: 'policy', name: 'Policy', description: 'Policies, laws, bills and reforms.', sortOrder: 30, isFeedSection: true, minScore: 1,
    keywords: ['policy', 'policies', 'bill', 'bills', 'law', 'laws', 'ordinance', 'reform', 'reforms', 'white paper', 'regulation', 'regulations', 'guidelines', 'resolution', 'amendment', 'legislation'] },
  { slug: 'welfare', name: 'Welfare', description: 'Welfare schemes, subsidies and social support.', sortOrder: 40, isFeedSection: true, minScore: 1,
    keywords: ['welfare', 'scheme', 'schemes', 'subsidy', 'subsidies', 'free power', 'free electricity', 'free bus', 'pension', 'pensions', 'ration', 'assistance', 'beneficiaries', 'beneficiary', 'freebies', 'relief', 'compensation', 'social justice', 'women', 'poor', 'farmers', 'fishermen', 'loan waiver', 'monthly aid', 'honorarium'] },
  { slug: 'education', name: 'Education', description: 'Schools, colleges, exams and students.', sortOrder: 50, isFeedSection: true, minScore: 1,
    keywords: ['education', 'school', 'schools', 'college', 'colleges', 'university', 'universities', 'student', 'students', 'exam', 'exams', 'examination', 'neet', 'teacher', 'teachers', 'syllabus', 'breakfast scheme', 'nep', 'two language', 'three language', 'hindi imposition'] },
  { slug: 'healthcare', name: 'Healthcare', description: 'Hospitals, public health and medical services.', sortOrder: 60, isFeedSection: true, minScore: 1,
    keywords: ['health', 'healthcare', 'hospital', 'hospitals', 'medical', 'doctor', 'doctors', 'patients', 'disease', 'vaccine', 'vaccination', 'dengue', 'nurses', 'aiims', 'insurance scheme', 'primary health'] },
  { slug: 'economy', name: 'Economy', description: 'Economy, investment, budget and jobs.', sortOrder: 70, isFeedSection: true, minScore: 1,
    keywords: ['economy', 'economic', 'investment', 'investments', 'investor', 'investors', 'gdp', 'gsdp', 'industry', 'industries', 'industrial', 'jobs', 'employment', 'budget', 'crore', 'revenue', 'tax', 'taxes', 'gst', 'trade', 'msme', 'export', 'exports', 'finance', 'fiscal', 'debt', 'mou', 'mous', 'startup', 'startups', 'manufacturing', 'semiconductor'] },
  { slug: 'infrastructure', name: 'Infrastructure', description: 'Roads, metro, power, water and housing.', sortOrder: 80, isFeedSection: false, minScore: 1,
    keywords: ['infrastructure', 'road', 'roads', 'metro', 'bridge', 'flyover', 'highway', 'highways', 'airport', 'port', 'railway', 'power supply', 'power cut', 'power plant', 'electricity', 'water', 'drinking water', 'housing', 'construction', 'project', 'projects', 'smart city', 'desalination', 'dam'] },
  { slug: 'law-and-order', name: 'Law and Order', description: 'Police, crime, courts and public safety.', sortOrder: 90, isFeedSection: false, minScore: 1,
    keywords: ['police', 'crime', 'crimes', 'arrest', 'arrested', 'murder', 'law and order', 'court', 'high court', 'madras high court', 'supreme court', 'case registered', 'cases filed', 'fir', 'violence', 'security', 'custodial', 'drugs', 'ganja', 'safety of women', 'sexual assault', 'stampede'] },
  { slug: 'elections', name: 'Elections', description: 'Elections, polls and campaigns.', sortOrder: 100, isFeedSection: false, minScore: 1,
    keywords: ['election', 'elections', 'poll', 'polls', 'vote', 'votes', 'voting', 'voters', 'constituency', 'by election', 'bypoll', 'bypolls', 'campaign', 'campaigning', 'ballot', 'election commission', 'counting', 'election results', 'majority', 'seats', 'manifesto'] },
  { slug: 'tamil-nadu', name: 'Tamil Nadu', description: 'Stories centred on Tamil Nadu and its districts.', sortOrder: 110, isFeedSection: false, minScore: 1,
    keywords: ['tamil nadu', 'tamilnadu', 'chennai', 'madurai', 'coimbatore', 'tiruchirappalli', 'trichy', 'salem', 'tirunelveli', 'thoothukudi', 'vellore', 'erode', 'thanjavur', 'kanyakumari', 'cuddalore', 'tiruppur', 'hosur', 'kancheepuram', 'villupuram', 'dindigul', 'nilgiris', 'ooty', 'karur', 'namakkal', 'sivaganga', 'ramanathapuram', 'virudhunagar', 'pudukkottai', 'nagapattinam', 'tiruvannamalai', 'krishnagiri', 'dharmapuri', 'ariyalur', 'perambalur', 'kallakurichi', 'tenkasi', 'ranipet', 'tirupattur', 'chengalpattu', 'mayiladuthurai', 'tiruvallur', 'tiruvarur', 'theni'] },
  { slug: 'national', name: 'National', description: 'Centre-state relations and national affairs.', sortOrder: 120, isFeedSection: false, minScore: 1,
    keywords: ['centre', 'central government', 'union government', 'union minister', 'delhi', 'new delhi', 'prime minister', 'modi', 'parliament', 'lok sabha', 'rajya sabha', 'national', 'president murmu', 'niti aayog', 'kerala', 'karnataka', 'andhra pradesh', 'telangana', 'puducherry', 'delimitation', 'federalism', 'amit shah', 'rahul gandhi'] },
  { slug: 'international', name: 'International', description: 'International relations, diaspora and foreign visits.', sortOrder: 130, isFeedSection: false, minScore: 1,
    keywords: ['international', 'global', 'foreign', 'abroad', 'overseas', 'diaspora', 'sri lanka', 'sri lankan', 'singapore', 'malaysia', 'united states', 'usa', 'u s', 'uk', 'u k', 'united kingdom', 'britain', 'london', 'dubai', 'uae', 'japan', 'germany', 'france', 'australia', 'canada', 'china', 'katchatheevu', 'embassy', 'consulate'] },
  { slug: 'statements', name: 'Statements', description: 'Statements, speeches, remarks and responses.', sortOrder: 140, isFeedSection: false, minScore: 2,
    keywords: ['says', 'said', 'slams', 'urges', 'statement', 'announces', 'announced', 'assures', 'calls', 'criticises', 'criticizes', 'accuses', 'hits out', 'remarks', 'speech', 'responds', 'reacts', 'warns', 'demands', 'appeals', 'letter', 'writes to', 'thanks', 'congratulates', 'greets', 'condoles', 'condolence'] },
  { slug: 'events', name: 'Events', description: 'Inaugurations, visits, meetings and ceremonies.', sortOrder: 150, isFeedSection: false, minScore: 2,
    keywords: ['inaugurates', 'inaugurated', 'inauguration', 'launches', 'launched', 'flag off', 'flags off', 'ceremony', 'visit', 'visits', 'visited', 'meeting', 'meets', 'met', 'tribute', 'tributes', 'celebration', 'celebrations', 'function', 'conference', 'summit', 'event', 'festival', 'birthday', 'foundation stone', 'review meeting'] },
  { slug: 'general', name: 'General', description: 'Coverage that does not match a more specific category.', sortOrder: 200, isFeedSection: false, minScore: 1,
    keywords: [] },
];

/** Well-known publishers: readable names and a small trust bonus. Unknown domains start as "active". */
export const SEED_SOURCES: Array<{ domain: string; name: string; country: string; trusted: boolean }> = [
  { domain: 'thehindu.com', name: 'The Hindu', country: 'India', trusted: true },
  { domain: 'newindianexpress.com', name: 'The New Indian Express', country: 'India', trusted: true },
  { domain: 'indianexpress.com', name: 'The Indian Express', country: 'India', trusted: true },
  { domain: 'timesofindia.indiatimes.com', name: 'The Times of India', country: 'India', trusted: true },
  { domain: 'economictimes.indiatimes.com', name: 'The Economic Times', country: 'India', trusted: true },
  { domain: 'hindustantimes.com', name: 'Hindustan Times', country: 'India', trusted: true },
  { domain: 'deccanherald.com', name: 'Deccan Herald', country: 'India', trusted: true },
  { domain: 'deccanchronicle.com', name: 'Deccan Chronicle', country: 'India', trusted: true },
  { domain: 'dtnext.in', name: 'DT Next', country: 'India', trusted: true },
  { domain: 'ndtv.com', name: 'NDTV', country: 'India', trusted: true },
  { domain: 'indiatoday.in', name: 'India Today', country: 'India', trusted: true },
  { domain: 'thenewsminute.com', name: 'The News Minute', country: 'India', trusted: true },
  { domain: 'thehindubusinessline.com', name: 'The Hindu BusinessLine', country: 'India', trusted: true },
  { domain: 'livemint.com', name: 'Mint', country: 'India', trusted: true },
  { domain: 'business-standard.com', name: 'Business Standard', country: 'India', trusted: true },
  { domain: 'moneycontrol.com', name: 'Moneycontrol', country: 'India', trusted: false },
  { domain: 'aninews.in', name: 'ANI', country: 'India', trusted: true },
  { domain: 'ptinews.com', name: 'Press Trust of India', country: 'India', trusted: true },
  { domain: 'theprint.in', name: 'ThePrint', country: 'India', trusted: true },
  { domain: 'scroll.in', name: 'Scroll', country: 'India', trusted: true },
  { domain: 'thewire.in', name: 'The Wire', country: 'India', trusted: true },
  { domain: 'news18.com', name: 'News18', country: 'India', trusted: false },
  { domain: 'firstpost.com', name: 'Firstpost', country: 'India', trusted: false },
  { domain: 'tribuneindia.com', name: 'The Tribune', country: 'India', trusted: true },
  { domain: 'telegraphindia.com', name: 'The Telegraph', country: 'India', trusted: true },
  { domain: 'thestatesman.com', name: 'The Statesman', country: 'India', trusted: false },
  { domain: 'outlookindia.com', name: 'Outlook', country: 'India', trusted: false },
  { domain: 'theweek.in', name: 'The Week', country: 'India', trusted: false },
  { domain: 'frontline.thehindu.com', name: 'Frontline', country: 'India', trusted: true },
  { domain: 'devdiscourse.com', name: 'Devdiscourse', country: 'India', trusted: false },
  { domain: 'daijiworld.com', name: 'Daijiworld', country: 'India', trusted: false },
  { domain: 'mangalorean.com', name: 'Mangalorean', country: 'India', trusted: false },
  { domain: 'calcuttanews.net', name: 'Calcutta News', country: 'India', trusted: false },
  { domain: 'reuters.com', name: 'Reuters', country: 'United States', trusted: true },
  { domain: 'bbc.com', name: 'BBC', country: 'United Kingdom', trusted: true },
  { domain: 'bbc.co.uk', name: 'BBC', country: 'United Kingdom', trusted: true },
  { domain: 'aljazeera.com', name: 'Al Jazeera', country: 'Qatar', trusted: true },
  { domain: 'dailymirror.lk', name: 'Daily Mirror (Sri Lanka)', country: 'Sri Lanka', trusted: false },
  { domain: 'straitstimes.com', name: 'The Straits Times', country: 'Singapore', trusted: true },
];

export const TRUSTED_SOURCE_WEIGHT = 5;
