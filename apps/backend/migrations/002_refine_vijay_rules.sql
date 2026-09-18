-- Seed data update (2026-09): the "CM Vijay" rule no longer matches other chief ministers
-- named Vijay (e.g. "CM Vijay Rupani"), and more unrelated Vijays are negative signals.
-- Only rows still holding the originally seeded pattern are changed; admin edits are kept.

UPDATE relevance_rules SET pattern = '\b(chief minister|cm) (c )?(joseph )?vijay\b(?! (sethupathi|antony|devarakonda|deverakonda|varma|raaz|raz|mallya|rupani|shankar|hazare|sinha|wadettiwar|vasanth|yesudas|prakash|kumar|shekhar|goel|chowk|nagar|singh|bahuguna|mishra|patil|babu|milton|kedia|amritraj|mahajan|jolly|sai|sales|bank|bhaskar|raghavan|thakur|chouhan|chauhan|dahiya|kiragandur|salgaonkar|sampla|oberoi|rathore|yadav|gupta|mehta|malhotra|patel|chaudhary|chaudhry|sardesai|tendulkar|kichlu|diwas|hazaribagh)\b)', updated_at = now()
 WHERE name = 'chief-minister-vijay' AND pattern = '\b(chief minister|cm) (c )?(joseph )?vijay\b';

UPDATE relevance_rules SET pattern = '\bvijay (sethupathi|antony|devarakonda|deverakonda|varma|raaz|raz|mallya|rupani|shankar|hazare|sinha|wadettiwar|vasanth|yesudas|prakash|kumar|shekhar|goel|chowk|nagar|singh|bahuguna|mishra|patil|babu|milton|kedia|amritraj|mahajan|jolly|sai|sales|bank|bhaskar|raghavan|thakur|chouhan|chauhan|dahiya|kiragandur|salgaonkar|sampla|oberoi|rathore|yadav|gupta|mehta|malhotra|patel|chaudhary|chaudhry|sardesai|tendulkar|kichlu|diwas|hazaribagh)\b', updated_at = now()
 WHERE name = 'other-vijays' AND pattern = '\bvijay (sethupathi|antony|devarakonda|deverakonda|varma|raaz|raz|mallya|rupani|shankar|hazare|sinha|wadettiwar|vasanth|yesudas|prakash|kumar|shekhar|goel|chowk|nagar|singh|bahuguna|mishra|patil|babu|milton|kedia|amritraj|mahajan|jolly|sai|sales|bank|bhaskar|raghavan|thakur|chouhan|chauhan|dahiya|kiragandur|salgaonkar)\b';
