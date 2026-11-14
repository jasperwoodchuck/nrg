# AGENTS.md

## Purpose

This file defines the rules for AI coding agents working on this repository.

The primary goal is to produce **correct, minimal, verifiable code** and avoid fabricated APIs, dependencies, configuration, project requirements, or existing functionality.

---

## Core Rules

### 1. Do Not Invent Facts

Never assume something exists when it has not been verified.

Do not fabricate:

- APIs
- endpoints
- database tables or columns
- environment variables
- packages
- functions
- components
- routes
- configuration options
- authentication providers
- external services
- project requirements
- files or directories
- existing application behavior

If something is unknown, **say that it is unknown and inspect the repository before proceeding**.

---

### 2. Inspect Before Modifying

Before making changes:

1. Inspect the relevant files.
2. Understand the existing implementation.
3. Reuse existing patterns where possible.
4. Check `package.json` before adding dependencies.
5. Check existing configuration before changing it.
6. Check existing types and database definitions before using them.

Do not recreate functionality that already exists.

---

### 3. Verify Dependencies

Never add a dependency solely because you believe it exists or because it would be convenient.

Before adding a package:

- Check `package.json`.
- Prefer an existing dependency if it already provides the required functionality.
- Use the package's documented API.
- Do not invent package names or APIs.

If internet access or documentation lookup is unavailable, explicitly state the uncertainty rather than fabricating an API.

---

### 4. Database Rules

Never assume the database schema.

Before writing database queries:

- Inspect the schema.
- Verify table names.
- Verify column names.
- Verify relationships.
- Verify constraints.
- Verify generated types if the project uses them.

Never silently create a new table or column to make an implementation work.

If a schema change is actually required, clearly identify it before making it.

---

### 5. Environment Variables

Never invent environment variables.

Use only variables that are:

- already present in the repository,
- documented in the project,
- or explicitly provided by the user.

When introducing a new environment variable:

1. Add it to `.env.example`.
2. Document what it is used for.
3. Never commit its secret value.

---

## TypeScript Rules

Prefer type-safe code.

- Do not use `any` unless there is a specific, documented reason.
- Do not suppress TypeScript errors with `@ts-ignore` without justification.
- Do not use type assertions to hide incorrect types.
- Reuse existing types when available.
- Update types when the underlying data model changes.

If the correct type is unknown, investigate it rather than guessing.

---

## Next.js Rules

Follow the conventions already established by the project.

Be explicit about server/client boundaries.

Before adding `"use client"`:

- Determine whether the component actually requires client-side behavior.
- Prefer Server Components when appropriate.
- Do not move logic to the client merely to bypass an error.

Do not introduce unnecessary API routes, Server Actions, middleware, or abstractions.

Prefer the simplest implementation that satisfies the requirement.

---

## UI Rules

Reuse existing components before creating new ones.

Prefer:

- existing shadcn/ui components
- existing design tokens
- existing utility classes
- existing layout patterns

Do not introduce a new UI library unless explicitly requested.

Do not redesign unrelated parts of the application.

Keep responsive behavior in mind.

---

## Error Handling

Do not hide errors.

Avoid patterns such as:

```ts
try {
  // ...
} catch {
  // silently ignore
}
```

Errors should either be:

- handled meaningfully,
- returned to the caller,
- logged appropriately,
- or surfaced to the user.

Do not make an operation appear successful when it actually failed.

---

## External APIs

Before integrating an external API:

1. Verify the API exists.
2. Verify the endpoint.
3. Verify authentication requirements.
4. Verify request/response formats.
5. Check rate limits or relevant restrictions.

Never invent API responses or fields.

When an external service is unavailable during development, use a clearly identified mock rather than pretending the real integration works.

---

## AI / LLM Features

Never treat an LLM response as guaranteed to be valid.

When consuming structured AI output:

1. Define the expected schema.
2. Validate the response.
3. Handle invalid responses.
4. Handle missing fields.
5. Handle API failures and timeouts.

Do not assume the model will always return valid JSON or follow instructions perfectly.

---

## Security

Never expose secrets in:

- source code
- client-side JavaScript
- Git history
- logs
- README files
- screenshots

Never move server-only secrets into client-side code.

Do not weaken authentication or authorization merely to make a feature work.

---

## Minimal Changes

Make the smallest change necessary to solve the task.

Do not:

- refactor unrelated code,
- rename unrelated files,
- rewrite working components,
- change the architecture unnecessarily,
- upgrade dependencies without a reason,
- introduce abstractions for hypothetical future requirements.

A working simple solution is preferable to an elaborate speculative one.

---

## When Requirements Are Ambiguous

If the repository or user request does not provide enough information to determine the correct implementation:

**Do not guess silently.**

Instead:

1. Inspect the repository for relevant context.
2. Infer only what is strongly supported by existing code.
3. If multiple interpretations remain plausible, explain the ambiguity.
4. Choose the least invasive reasonable implementation when proceeding is appropriate.

Clearly distinguish:

- **Known**
- **Inferred**
- **Unknown**

---

## Testing

Before declaring a task complete:

- Run the relevant type checks.
- Run the relevant lint checks.
- Run tests if they exist.
- Verify the affected functionality.
- Check for obvious runtime errors.

Do not claim that something was tested if it was not.

Do not claim a build succeeds without actually running it.

---

## Git

Do not make destructive Git operations unless explicitly requested.

Commit every change to `AGENTS.md` immediately after making it. Stage only `AGENTS.md` for that commit so unrelated working-tree changes remain untouched.

Never run commands such as:

```bash
git reset --hard
git clean -fd
git push --force
```

without explicit user authorization.

Do not rewrite existing commits unnecessarily.

Keep commits focused when the user asks for commits.

---

## Communication

When reporting completed work:

- State what changed.
- State what was verified.
- Mention important limitations.
- Be honest about anything that could not be verified.

Do not claim:

- "this definitely works"
- "the API supports this"
- "the database contains..."
- "this is compatible with..."
- "tests pass"

unless there is evidence for the claim.

---

## Hackathon Priority

During the hackathon, optimize for:

1. Correctness
2. Working MVP
3. Simplicity
4. Reliability
5. User experience
6. Polish

Do not sacrifice a working MVP for unnecessary architecture.

If a feature is not required for the current task, do not build it speculatively.

---

## Golden Rule

**If you don't know, inspect. If you can't verify, say so. Never invent.**
