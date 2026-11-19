# Agent instructions

`CLAUDE.md` and `AGENTS.md` at the repo root hold the same instructions for different agent tools. They must stay identical: whenever you edit one, make the same change to the other in the same commit. Check with `cmp CLAUDE.md AGENTS.md`, which prints nothing when they match.

## Keep documentation up to date

Documentation is part of every change. When a change makes any document wrong or incomplete, fix that document in the same commit as the change; never leave it for a follow-up. A change is not finished while a document still describes the old behaviour.

Before finishing a change, check each of these and update the ones it affects:

- `CONTEXT.md`: the glossary. Update it when a term is added, renamed, redefined or dropped. Use its terms everywhere, in code, tests, issues and other documents.
- `docs/adr/`: decisions. When a change reverses or departs from an ADR, mark the old ADR as superseded and write a new one explaining why. Do not edit history out of an accepted ADR.
- `.scratch/<feature>/spec.md` and `.scratch/<feature>/issues/`: when what gets built differs from the spec or a ticket, correct the spec or ticket and update its `Status:` line.
- `docs/agents/`: when the issue tracker, triage labels, domain doc layout or the way tickets are worked changes.
- `CLAUDE.md` and `AGENTS.md`: when a convention, command or workflow in them changes. Keep the two identical.
- Any other document in the repo, such as a README, changelog, setup guide or diagram, that mentions what changed.

If you find a document that is already out of date, fix it or tell the owner; do not work around it.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature-slug>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`, recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Working the tickets

Before starting, assigning or merging any ticket in `.scratch/`, read `docs/agents/manager.md`: how a ticket is claimed, how workers are briefed, the gate before a pull request, and when to stop for the owner.
