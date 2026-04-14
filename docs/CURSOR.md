# Cursor & AI workflow — Mentis

This project uses **Cursor rules** under `.cursor/rules/` so the assistant stays aligned with team habits. The product is also built with **AI-assisted** coding (IDE agents, LLMs); the root **README** states that explicitly for downstream readers. That disclosure does **not** replace the repository **Business Source License 1.1** — see [`LICENSE`](../LICENSE) and [`docs/ARCHITECTURE.md`](./ARCHITECTURE.md) §10.

## Active rules

| Rule | Purpose |
|------|---------|
| `greeting-and-docs.mdc` (`alwaysApply: true`) | Greet with **Assalamualaikum** on substantive replies; after meaningful changes, update `docs/` (and `README.md` when relevant), note **Documentation** in the closeout, and add a **Manual verification** checklist (and refresh `docs/LAUNCH_DEFERRALS.md` → *Manual verification queue*) when behavior/UX changes. |
| `ui-copy.mdc` | Settings/forms: avoid subtitle “hints” under labels unless they prevent a real mistake; keep UI minimal. |

## Expectations for AI-generated changes

- Prefer **small, reviewable diffs**; match existing patterns in the touched files.
- Do **not** strip license headers from third-party code; do **not** commit secrets.
- When suggesting redistribution or “open sourcing,” remind readers that **BSL 1.1** governs this repo until the Change Date — point to `LICENSE`.
- Security-sensitive areas (crypto, vault paths, FS adapters): extra care and human review.

## For maintainers

- Edit rules in `.cursor/rules/*.mdc` (YAML frontmatter + markdown body).
- When you change how the AI should behave, update this file and keep `docs/CONVENTIONS.md` in sync if it’s a team-wide convention.
