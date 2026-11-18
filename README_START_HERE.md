# BIZGO — HANDOFF FOR CLAUDE CODE

**Start:** read `docs/BIZGO_MASTER_IMPLEMENTATION_SPEC.md` and root `CLAUDE.md`.
**Inputs:** all source BRD, architecture, 82-item catalogue and complete HTML prototype (including assets) inside `/source`.
**Tracker:** `docs/IMPLEMENTATION_TODO.md`; **UI/API mapping:** `docs/ui_route_api_matrix.csv`; **catalogue:** `docs/catalog_source_82.csv`; **missing decisions:** `docs/decisions/DECISION_LOG.md`.

## Paste this into Claude Code
> Read `CLAUDE.md`, `docs/BIZGO_MASTER_IMPLEMENTATION_SPEC.md`, both BRD/architecture DOCX source files, original catalog, and the HTML prototype ZIP. Analyze differences and generate Phase 0 artifacts (ADRs, database/ERD, permission matrix, API OpenAPI, state machine and implementation milestones). Respect BLOCKED_DECISION; do not invent prices/SKU/legal details, do not code multi-seller marketplace, and do not pretend the HTML localStorage demo is production code. After Phase 0, implement Phase 1 in verified vertical slices with tests and responsive QA.

## Quick rule
The ZIP source prototype is a **visual reference**, not a production backend. All 82 products must start draft until SKU data verified. Frontend/backend/admin/factory must share one API.
