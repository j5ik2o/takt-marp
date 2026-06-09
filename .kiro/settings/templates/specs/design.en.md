# Design Document Template

---
**Purpose**: Provide enough detail for consistent implementation by different implementers and prevent interpretation drift.

**Approach**:
- Include required sections that directly inform implementation decisions
- Omit optional sections unless they are necessary to prevent implementation errors
- Scale detail to feature complexity
- Prefer diagrams and tables over long prose

**Warning**: If this approaches 1000 lines, the feature is probably too large. Simplify the design or split it into multiple specs.
---

> Sections may be reordered when that improves clarity, such as moving Requirements Traceability earlier or placing Data Models near Architecture. Within each section, keep a **summary -> scope -> decisions -> impact/risk** flow so reviewers can read the document consistently.

## Overview
Maximum 2-3 paragraphs.
**Purpose**: This feature provides [specific value] to [target users].
**Users**: [target users] use it for [specific workflow].
**Impact** (if applicable): It changes [current system state] by [specific change].

### Goals
- Primary objective 1
- Primary objective 2
- Success criteria

### Non-Goals
- Explicitly excluded functionality
- Future considerations outside current scope
- Deferred integration points

## Boundary Commitments

Describe this spec's responsibility boundary concretely. Treat this as the anchor for architecture, tasks, and later validation.

### This Spec Owns
- Capabilities or behavior owned by this spec
- Data this spec owns or makes authoritative
- Interfaces or contracts this spec defines or stabilizes

### Out of Boundary
- Related concerns this spec explicitly does not own
- Work delegated to another spec, existing subsystem, or later phase
- Changes that must not be pulled in as incidental work

### Allowed Dependencies
- Upstream systems, specs, or components this design may depend on
- Shared infrastructure this design may use
- Dependency constraints that must not be violated

### Revalidation Triggers
List changes that should force downstream or consuming specs to re-check integration.

- Contract shape changes
- Data ownership changes
- Dependency direction changes
- Startup or runtime prerequisite changes

## Architecture

> Use `research.md` only as background notes. Record all decisions and contracts here so design.md remains self-contained for reviewers.
> State key decisions in text and let diagrams carry structural detail. Do not repeat the same information in prose.
> Keep the supplementary sections below lightweight unless they materially clarify ownership, dependency rules, or integration points.

### Existing Architecture Analysis (if applicable)
When changing an existing system:
- Current architecture patterns and constraints
- Existing domain boundaries to preserve
- Integration points that must remain stable
- Technical debt to resolve or avoid

### Architecture Pattern and Boundary Map
**Recommended**: Include a Mermaid diagram for the chosen architecture pattern and system boundaries. Required for complex features, optional for simple additions.

**Architecture Integration**:
- Pattern: [name and brief rationale]
- Domain / feature boundaries: [how responsibilities are split to avoid conflicts]
- Existing patterns to preserve: [list key patterns]
- New component rationale: [why each new component is needed]
- Steering alignment: [principles preserved]

### Technology Stack

| Layer | Choice / Version | Role in Feature | Notes |
|-------|------------------|-----------------|-------|
| Frontend / CLI | | | |
| Backend / Service | | | |
| Data / Storage | | | |
| Messaging / Events | | | |
| Infrastructure / Runtime | | | |

> Keep rationale concise here. If deeper tradeoffs or benchmarks are needed, add a short summary plus Supporting References and link to raw research notes in `research.md`.

## File Structure Plan

Map the feature's directory structure and file responsibilities. This section directly drives task `_Boundary:_` annotations and implementation task briefs. Use appropriate detail:

- **Small feature**: List individual files and responsibilities
- **Large feature**: Describe directory-level structure plus domain/module patterns, and list only non-obvious files individually

### Directory Structure
```
src/
├── domain-a/              # Domain A responsibility
│   ├── controller.ts      # Endpoint handler
│   ├── service.ts         # Business logic
│   └── types.ts           # Domain types
├── domain-b/              # Same pattern as domain-a
└── shared/
    └── cross-cutting.ts   # Non-obvious: why it exists
```

> Describe repeated structure once, for example "domain-b follows the same pattern as domain-a". List individual files only when the path does not make the responsibility obvious.

### Files to Modify
- `path/to/existing.ts` - what changes and why

> Each file must have one clear responsibility. Group files that change together. Do not duplicate details already covered by Components and Interfaces; focus on physical file placement for those components.

## System Flows

Provide only diagrams needed to explain non-obvious flows. Use pure Mermaid syntax. Common patterns:
- Sequence diagrams for multi-actor interactions
- Process/state diagrams for branching logic or lifecycle
- Data/event flow diagrams for pipelines or async messaging

Omit this section entirely for simple CRUD changes.

## Requirements Traceability

| Requirement | Summary | Components | Interfaces | Flows |
|-------------|---------|------------|------------|-------|
| 1.1 | | | | |

## Components and Interfaces

| Component | Domain/Layer | Intent | Req Coverage | Key Dependencies | Contracts |
|-----------|--------------|--------|--------------|------------------|-----------|
| ComponentName | | | | | Service [ ] / API [ ] / Event [ ] / Batch [ ] / State [ ] |

### ComponentName

| Field | Detail |
|-------|--------|
| Intent | |
| Requirements | |

**Responsibilities & Constraints**

- Responsibility or invariant
- Boundary constraint
- Validation responsibility

**Dependencies**

- Inbound: [caller / owner] (P0/P1/P2)
- Outbound: [dependency] (P0/P1/P2)
- External: [external prerequisite] (P0/P1/P2)

**Contracts**: Service [ ] / API [ ] / Event [ ] / Batch [ ] / State [ ]

## Data Models

### Domain Model
- Main entities and relationships
- Ownership and lifecycle

### Logical Data Model
- Storage shape, state transitions, or report/front matter shape
- Consistency rules

### Data Contracts & Integration
- Input/output contracts
- Compatibility and versioning expectations

## Error Handling

### Error Strategy
- Error categories
- User/operator visible behavior
- Recovery and retry behavior

## Testing Strategy
- Requirement-specific unit or integration checks
- Boundary and dependency regression checks
- User-visible workflow checks

## Security Considerations
- Permissions and data access
- Secret handling
- External access assumptions

## Migration Strategy
- Rollout order
- Backward compatibility
- Data or artifact migration
