#!/usr/bin/env bash
[[ $(jq -r '.tool_input.command // empty') =~ gh[[:space:]]+pr[[:space:]]+create ]] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true
plan=""
for f in PLAN.md plan.md docs/PLAN.md docs/plan.md; do [[ -f $f ]] && { plan=$f; break; }; done

# Reviewers in priority order: the first installed goes first; one that then fails (not signed in, refuses its model) hands over to the next.
first="a Claude subagent"
if command -v codex >/dev/null 2>&1; then first="Codex"; elif command -v grok >/dev/null 2>&1; then first="Grok"; fi

cat >&2 <<MSG
PR created. Before merging, review it in a fresh context, fix what holds up, and review again until nothing does.

1. Review the PR with one reviewer, in this order of priority (start with $first):
   1. Codex: codex review --base main
      (it takes no instructions alongside --base and reviews for bugs its own way: check the points below yourself while verifying)
   2. Grok, when Codex isn't installed, isn't signed in or fails: grok -p "Review this branch's diff against main (git diff main...HEAD) for the points below. Findings only, with file:line and a concrete fix."
   3. A Claude subagent, when neither CLI works, given the diff and the points below.
   The points, each with file:line and a concrete fix:
   - bugs: wrong results, crashes, leaks, races, unhandled errors, processes left running
   - repeated code that should be one helper, hook or shared component
   - if/else or switch chains that would be simpler as a data structure (lookup table, map, config array)
   - modularity: what should be easy to change in one place (shared components, style tokens, constants), and the project's own rules in CLAUDE.md
   - styles: repeated class strings, hard-coded colours and sizes that should be tokens, unused tokens
   - performance: work on hot paths, sync IO on the main thread, needless re-renders and allocations
   A review can take minutes: run it in the background.
2. Check every finding against the code before acting on it and drop what doesn't hold. Fix the confirmed ones, quickest first, with a test where one can show it, tests passing after each; commit the fixes.
3. Review again with the same reviewer (the next one if it stopped working) and repeat 2 until it finds nothing that holds up. Then tell the user what was found and fixed, and what was dropped and why.
MSG

if [[ -n $plan ]]; then
  cat >&2 <<MSG

4. Review $plan against what this PR built and the code as it is now: facts that went stale, things it promises that were never built, phases without a gate or status, sections that have grown into history. Fix the plainly factual ones; ask the user about the rest.
MSG
fi
exit 2
