# Manager runbook

For an agent that runs other agents through the tickets in `.scratch/<feature>/issues/`. The manager assigns, checks and reports. It writes no product code itself: every ticket is built by a **worker**, a fresh agent session that sees only its brief.

A lone agent working one ticket by hand follows the same claim, gate and pull-request rules, acting as its own manager.

## Owner's settings

The owner changes behaviour by editing this table.

| Setting | Value |
|---|---|
| Workers running at once | 3 |
| Who merges into `main` | The owner, one pull request per ticket |
| Pushing branches to GitHub | Allowed |

## Ticket states

Git is the record of who holds what. A ticket's state is read, never remembered:

| State | How to recognise it |
|---|---|
| **Blocked** | A ticket in its "Blocked by" line is not yet done. |
| **Ready** | `Status: ready-for-agent`, every blocker done, and no branch named `ticket/<NN>-<slug>` on GitHub. |
| **Claimed** | The branch `ticket/<NN>-<slug>` exists on GitHub. |
| **In review** | That branch has an open pull request. |
| **Done** | The ticket file on `main` reads `Status: done`. |
| **Owner's** | `Status: ready-for-human`. Only the owner does these. |

A ticket becomes done when its pull request merges, because the worker's branch carries the change to `Status: done`. A blocker counts as done only on `main`: a finished branch that is still in review unblocks nothing.

## The loop

Repeat until every ticket is done or the loop reaches a stop.

1. **Sync.** Fetch from GitHub, then read each ticket's "Blocked by" and "Status" lines on `main`, the `ticket/*` branches, and the open pull requests. Done when every ticket is placed in exactly one state above.

2. **Report owner's tickets.** For each owner's ticket whose blockers are all done, tell the owner it is ready and quote its checklist. When the owner says one is finished, open a pull request that sets its `Status: done` and records anything the ticket says to write down. Done when every unblocked owner's ticket has been reported once.

3. **Claim.** Take ready tickets in number order until the worker limit is reached. For each, create `ticket/<NN>-<slug>` from current `main` and push it before anything else, so a second manager sees the claim. Done when each claimed ticket has its branch on GitHub.

4. **Brief a worker** for each claim, in its own git worktree on that branch, using the brief below. Done when each worker is running.

5. **Gate** each worker's result as it comes back, using the gate below. Send a failing result back to the same worker with the failing items named. Done when every item passes, checked by the manager and not taken from the worker's word.

6. **Open the pull request** into `main`, titled with the ticket's number and title, with a body that lists what was built, how each acceptance criterion was verified, and anything the owner should look at. Tell the owner it is waiting. Done when the owner has the link.

7. **Refresh after a merge.** When the owner merges a pull request, bring each claimed or in-review branch up to date with `main` and run the gate on it again. Done when every open branch passes the gate on top of the new `main`.

## Worker brief

A worker knows only what the brief says. Give it:

- The ticket file to build, and that it is the whole assignment.
- To read `CLAUDE.md`, `CONTEXT.md`, the ticket's spec sections, and any `docs/design/` image the ticket names, before writing code.
- The branch and worktree it owns, and that all its commits go there.
- To build test-first at the seams the spec's "Testing Decisions" names, and to review its own diff against the ticket and the spec before finishing.
- To tick each acceptance criterion in the ticket file as it is met, and to set `Status: done` in its final commit.
- To return a report: what was built, how each criterion was verified, the result of the checks, every document it updated, and anything it could not do.
- The rule under "Stops" for a ticket or spec that turns out to be wrong.

## Gate

A branch is ready for a pull request when all of these hold:

- Every acceptance criterion in the ticket file is ticked, and the manager has confirmed each one against the code or by running it.
- The project's full set of checks passes on the branch, run by the manager.
- The branch is up to date with `main`.
- The diff stays within the ticket. Work that belongs to another ticket is taken out.
- Every document the change made wrong is corrected in the same branch, as `CLAUDE.md` requires.
- `CLAUDE.md` and `AGENTS.md` are identical.
- The ticket file reads `Status: done`.
- The diff contains no secret, no real phone number, and nothing about Susan beyond her first name.

## Stops

Stop and report to the owner, with the question stated in one sentence and a recommendation, when:

- **A decision would change.** A worker finds that a ticket, the spec, an ADR or `CONTEXT.md` is wrong in a way that changes what gets built or how it behaves. Correcting a plain factual error in a document is part of the ticket; changing a decision is the owner's.
- **Something is the owner's.** Merging into `main`, any owner's ticket, anything that spends money, and anything that needs a credential, an account or a person.
- **A worker fails the gate twice** on the same item. Report what was tried.
- **Two branches conflict** beyond a routine merge. Tickets that share a surface say so in their "Parallel" line.
- **Nothing is ready.** Every remaining ticket is blocked, in review, or the owner's. Report which pull requests and owner's tickets the work is waiting on.

A stop on one ticket leaves the others running.

## Reporting

Each report to the owner leads with what needs their action, then lists every ticket by state. Refer to a ticket by number and title together.
