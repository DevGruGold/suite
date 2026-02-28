---
name: subagent-driven-development
description: Core directive for the XMRT-DAO development team. All coding tasks must go through two-stage executive review with Dr. Anya Sharma (CTO) as the primary sign-off authority. Uses specialized subagents for implement → spec-review → code-quality-review each task.
---

# Subagent-Driven Development

**Source:** <https://skills.sh/obra/superpowers/subagent-driven-development>  
**Executive Owner:** Dr. Anya Sharma (CTO) — all technical tasks route through Anya for Phase 1 sign-off and Phase 2 completion acceptance.

## Core Principle

High quality + fast iteration through specialized subagents with embedded quality assurance gates. Every significant development task follows this protocol.

## Two-Stage Executive Review

### Phase 1 — CTO Sign-Off (Before Implementation)

Before any implementation begins, Dr. Anya Sharma reviews and signs off on:

1. **Objective** — clear statement of what will be built
2. **Agreed Deliverables** — specific, testable items
3. **STAE Work Completion Checklist** — every task broken into verifiable steps

Never begin implementation without Phase 1 approval.

### Phase 2 — CTO Completion Report (After Implementation)

When implementation and review loops complete:

1. All checklist items marked complete
2. Both review stages passed (spec compliance ✅, code quality ✅)
3. Final report delivered to Dr. Anya Sharma for executive sign-off
4. User is notified via inbox message from the lead executive

## The Process (Per Task)

```
1. Extract task from plan → create checklist in STAE/TodoWrite
2. Dispatch implementer subagent
   - Fresh subagent per task (prevents context pollution)
   - Provide full task text + scene-setting context (don't make subagent read files)
   - Subagent asks questions → answer before proceeding
3. Implementer implements, tests, self-reviews, commits
4. Dispatch spec reviewer subagent
   - Confirms code matches the spec exactly
   - If gaps found → implementer fixes → re-review
5. Dispatch code quality reviewer subagent
   - Checks implementation quality, patterns, readability
   - If issues found → implementer fixes → re-review
6. Mark task complete in TodoWrite
7. Repeat for next task
8. When all tasks done → dispatch final code reviewer
9. Phase 2: deliver completion report to CTO (Dr. Anya Sharma)
```

## Executive Routing

Tasks are routed to the relevant executive for Phase 1 + Phase 2 by category:

| Category | Lead Executive |
|---|---|
| Code, AI, Architecture, APIs | Dr. Anya Sharma (CTO) |
| Finance, Budget, Treasury | Mr. Omar Al-Farsi (CFO) |
| Marketing, Brand, Content | Ms. Isabella Rodriguez (CMO) |
| Operations, Agents, Pipelines | Mr. Klaus Richter (COO) |
| People, Culture, Onboarding | Ms. Akari Tanaka (CPO) |

The user **always** receives inbox messages from the relevant executive — never from an anonymous agent.

## Red Flags (Never Do)

- ❌ Start implementation without Phase 1 executive sign-off
- ❌ Skip spec compliance review (must come before code quality review)
- ❌ Skip code quality review
- ❌ Accept "close enough" — spec reviewer found issues = not done
- ❌ Dispatch multiple implementation subagents in parallel (conflicts)
- ❌ Make subagent read plan file directly (provide full text instead)
- ❌ Ignore subagent questions (answer before proceeding)
- ❌ Move to next task while any review has open issues
- ❌ Let implementer self-review replace the formal review stages
- ❌ Start code quality review before spec compliance is ✅

## Handling Issues

**If subagent asks questions:** Answer clearly and completely. Provide context. Don't rush them.

**If reviewer finds issues:** Implementer (same subagent) fixes → reviewer reviews again. Repeat until approved.

**If subagent fails:** Dispatch fix subagent with specific instructions. Don't fix manually (context pollution).

## Context Rotation

"Fresh subagent per task" does NOT mean creating new agents constantly. It means rotating tasks to fresh agent sessions so context windows clear between tasks. This prevents confusion and hallucination from accumulated context.

## Advantages Over Manual Execution

- Subagents follow TDD naturally
- Fresh context per task = no confusion between tasks
- Parallel-safe (subagents don't interfere)
- Questions surface before work begins, not after
- Two-stage review catches issues early (cheaper than debugging later)
- Spec compliance prevents over/under-building
- Code quality ensures well-built implementation

## Integration with Suite Skills

Required skills:

- `superpowers:using-git-worktrees` — isolated workspace before starting
- `superpowers:writing-plans` — creates the plan this skill executes
- `superpowers:requesting-code-review` — template for reviewer subagents
- `superpowers:finishing-a-development-branch` — complete dev after all tasks

Subagents should use:

- `superpowers:test-driven-development` — TDD for each task
