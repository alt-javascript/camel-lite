# Architecture Decision Records

This directory contains the Architecture Decision Records (ADRs) for camel-lite.

ADRs document significant design decisions made during the project. Each record is immutable once accepted — to reverse a decision, create a new ADR that supersedes the old one.

## Index

| ADR | Title | Status |
|-----|-------|--------|
| [ADR-001](ADR-001.md) | Plain JavaScript — No TypeScript | Accepted |
| [ADR-002](ADR-002.md) | Pure ESM — ES Modules Throughout | Accepted |
| [ADR-003](ADR-003.md) | npm Workspaces Monorepo — Per-Component Packages | Accepted |
| [ADR-004](ADR-004.md) | No DI Container in Core Components | Accepted |
| [ADR-005](ADR-005.md) | HTTP Component — Producer Only | Accepted |
| [ADR-006](ADR-006.md) | Expression Language — Native Functions + simple()/js() Wrappers | Accepted |
| [ADR-007](ADR-007.md) | Component Factory Chain — Component → Endpoint → Producer/Consumer | Accepted |
| [ADR-008](ADR-008.md) | URI Parsing — Manual Split for Path, URLSearchParams for Query | Accepted |
| [ADR-009](ADR-009.md) | SQLite — node:sqlite Built-in Over better-sqlite3 | Accepted |
| [ADR-010](ADR-010.md) | Test Framework — node:test Built-in | Accepted |
| [ADR-011](ADR-011.md) | Route Loading — Four Entry Points for Different Input Sources | Accepted |
| [ADR-012](ADR-012.md) | Boot Integration — CDI Conditional Beans and dependsOn Ordering | Accepted |
| [ADR-013](ADR-013.md) | Logger Categories — @alt-javascript/camel-lite/* Idiom | Accepted |
| [ADR-014](ADR-014.md) | Leader Election — Pluggable LockStrategy with Three Backends | Accepted |
