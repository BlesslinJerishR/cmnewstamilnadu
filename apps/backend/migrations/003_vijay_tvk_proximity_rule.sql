-- Seed data update (2026-09): coverage from before the swearing-in calls him "TVK chief" or
-- "Vijay's TVK" rather than Chief Minister. A proximity rule rewards Vijay near TVK.
-- Fresh installs get the same rule from the seed; ON CONFLICT keeps admin-created rules.
INSERT INTO relevance_rules (niche_id, name, rule_type, pattern, pattern_b, max_distance, fields, weight, notes)
SELECT id, 'vijay-tvk-proximity', 'proximity', 'vijay', 'tvk|tamilaga vettri kazhagam', 4,
       '{title,description,url}', 20,
       '"Vijay''s TVK", "TVK founder Vijay": the party leader before and after taking office.'
  FROM niches WHERE slug = 'tn-cm'
ON CONFLICT (niche_id, name) DO NOTHING;
