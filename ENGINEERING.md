# ENGINEERING.md

Practical engineering guidance for planning, implementing, verifying, and maintaining software projects.

Project-specific conventions override this file. Existing architecture, framework conventions, security requirements, performance constraints, and user instructions take precedence. Use judgment: these are decision prompts and defaults, not a checklist that every project must satisfy.

## Core principle

Engineer for the actual project context. A prototype, CLI tool, library, production service, data pipeline, frontend app, and infrastructure project require different tradeoffs. Prefer the simplest design that satisfies current requirements while leaving clear seams for likely change.

## Understand before building

Before making changes:

- Understand the goal, constraints, users, runtime environment, and success criteria.
- Inspect the existing codebase before proposing new structure, tools, dependencies, or abstractions.
- Identify the project type, language, framework, tooling, deployment target, and testing approach.
- Follow existing conventions for naming, module boundaries, error handling, logging, dependencies, and tests.
- Adapt to the language and ecosystem in use instead of importing patterns from other ecosystems.
- Before using or changing specialized tooling, package managers, build systems, containers, CI/CD, databases, cloud services, or infrastructure, inspect existing project usage and consult authoritative documentation when uncertainty exists.
- Do not assume generic practices are correct when the project uses specialized tooling.
- If requirements are ambiguous or tradeoffs matter, ask clarifying questions before implementation.
- For non-trivial work, provide a short implementation plan covering approach, affected areas, verification strategy, and major risks.

## Architecture and design

- Keep design proportional to complexity; avoid both under-engineering and speculative over-engineering.
- Separate concerns where it improves clarity and maintainability.
- Keep modules cohesive with clear responsibilities and limited public APIs.
- Prefer explicit data flow and dependency injection over hidden global state.
- Make important boundaries testable without requiring external services where practical.
- Introduce abstractions only when they reduce real duplication, isolate volatility, or clarify domain concepts.
- Preserve the existing architectural style unless there is a clear reason to change it.
- Document important design decisions and tradeoffs when they are not obvious.

## Code quality

- Prefer clear, maintainable code over cleverness.
- Keep functions, classes, and modules focused on a single responsibility.
- Use meaningful names that reflect domain concepts and behavior.
- Handle errors deliberately; fail clearly and preserve useful context.
- Validate inputs at trust boundaries.
- Avoid unnecessary shared mutable state and hidden side effects.
- Keep public interfaces stable and documented when consumed outside their module.
- Add concise comments or docstrings for public entrypoints, non-obvious logic, invariants, important domain rules, and surprising tradeoffs.
- Avoid noisy comments that restate obvious code; comments should help future maintainers understand intent, constraints, or consequences.
- Remove dead code, unused imports, debug output, and temporary scaffolding before completion.

## Documentation

Document what future maintainers need to understand.

- Document public APIs, configuration, operational steps, and non-obvious behavior.
- Explain assumptions, invariants, constraints, and tradeoffs.
- Use comments to explain why something exists, how non-obvious behavior should be maintained, and what future changes must preserve — not what the code already states.
- Keep documentation synchronized with implementation.
- For user-facing tools, document installation, configuration, usage, and common failure modes when relevant.

## Testing and verification

- Add tests for important behavior, edge cases, regressions, and error paths where appropriate.
- Prefer fast, deterministic tests.
- Keep test structure aligned with project conventions.
- Use mocks and fakes judiciously.
- Run relevant quality gates when possible: formatter, linter, type checker, tests, build, packaging, or smoke tests.
- If verification cannot be performed, explicitly state what was not verified and the associated risk.

## Performance and resource efficiency

Consider performance only to the degree required by the project.

- Avoid obviously inefficient designs.
- Avoid repeated expensive work when safe caching is possible.
- Do not optimize prematurely.
- For data processing, consider streaming or batching when memory pressure may be significant.
- For networked systems, consider timeouts, retries, backoff, idempotency, and rate limits.
- For containerized systems, structure builds to avoid repeated dependency downloads and unnecessary cache invalidation.
- Copy dependency manifests before source code when possible.
- Install dependencies in cacheable layers.
- Use multi-stage builds where they reduce final size or separate build/runtime concerns.
- Keep images minimal without sacrificing debuggability or security requirements.
- Pin or constrain base images and dependencies appropriately for reproducibility.

## Security and reliability

- Treat external input and external systems as untrusted.
- Avoid exposing secrets in code, logs, tests, images, or error messages.
- Apply least privilege where credentials or permissions are involved.
- Prefer secure defaults for authentication, authorization, encryption, and configuration.
- Make failures observable through appropriate logging, metrics, status reporting, or error messages.
- Consider concurrency, retries, cancellation, cleanup, and recovery where relevant.

## Configuration and operations

- Keep configuration explicit and environment-appropriate.
- Avoid hardcoded machine-specific assumptions.
- Provide safe defaults while keeping production-sensitive settings explicit.
- Keep development, testing, deployment, and operational workflows understandable.
- Consider observability, migrations, health checks, graceful shutdown, and rollback paths when relevant.

## Delivery discipline

- Implement incrementally and keep changes scoped to the requested goal.
- Prefer small, reviewable changes over broad rewrites unless a redesign is required.
- Maintain backward compatibility unless a breaking change is requested or justified.
- Update tests and documentation alongside behavior changes.

## Final verification pass

Before considering work complete:

- Verify that the solution satisfies the requested goal.
- Verify that project conventions and language/framework idioms were respected.
- Verify that tooling, package management, build, deployment, and infrastructure changes follow project conventions and documented best practices rather than generic defaults.
- Verify that tests and checks pass, or clearly state what was not verified.
- Review the implementation as if written by another engineer and look for defects, unnecessary complexity, missing edge cases, and simpler alternatives.
- Summarize:
  - what changed
  - how it was verified
  - remaining risks, assumptions, or follow-up work
