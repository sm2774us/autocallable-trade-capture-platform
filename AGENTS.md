# AGENTS.md: trade-capture

## Stack
Java 17, Spring Boot 3.5, Spring Kafka, PostgreSQL 16, OpenTofu, Kubernetes (Kustomize).

## Hard rules (a hook enforces the first four; breaking one fails CI)
1. Never put credentials, tokens or connection strings in any file.
2. Money is `long` micros or `BigDecimal`. Never `double` or `float`.
3. Code follows the Google Java Style Guide. Run `mvn spotless:check` before finishing.
4. Never edit `infra/**/versions.tf` backend or encryption blocks, or anything under `prod/`.
5. A consumer must be idempotent: every insert uses the `(source, trade_id)` key.
6. Every new behaviour needs a test written first. Show the failing run, then the passing run.

## Workflow
Plan, then implement in small commits, then run `mvn -q verify`. Summarise what changed and what
you did not verify. If a requirement is ambiguous, ask; do not guess.

## Where things are
`core/` pure logic (no Spring). `spring/` wiring. `infra/` OpenTofu per cloud. `k8s/` manifests.
