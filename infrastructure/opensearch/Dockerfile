# Lean single-node OpenSearch for a 4 GB VPS.
# Every bundled plugin (security, ML/neural/k-NN, alerting, performance analyzer, ...) is removed:
# the app only needs core full-text search, and each plugin costs heap, threads and startup time.
# Security is handled by network isolation instead (OpenSearch is never exposed publicly).
FROM opensearchproject/opensearch:2.19.6

RUN for pass in 1 2 3 4; do \
      for plugin in $(/usr/share/opensearch/bin/opensearch-plugin list); do \
        /usr/share/opensearch/bin/opensearch-plugin remove "$plugin" >/dev/null 2>&1 || true; \
      done; \
    done; \
    remaining="$(/usr/share/opensearch/bin/opensearch-plugin list)"; \
    if [ -n "$remaining" ]; then echo "Plugins still installed: $remaining"; exit 1; fi
