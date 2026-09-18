# Security policy

Please report vulnerabilities privately by email to the maintainer listed on
https://blessl.in rather than opening a public issue. Include steps to reproduce and the affected
component (backend API, worker, mobile app, infrastructure). We aim to acknowledge reports within
7 days.

Design notes relevant to security are in [docs/ARCHITECTURE.md §28](docs/ARCHITECTURE.md#28-security-architecture):
databases are never exposed publicly, the server never fetches article URLs (no SSRF surface),
passwords use scrypt, session tokens are stored hashed, and all input is validated.
