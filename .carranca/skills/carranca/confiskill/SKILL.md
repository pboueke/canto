---
name: carranca-confiskill
description: Guidance for proposing carranca runtime configuration updates for the current workspace
---

# Carranca Config Skill

When asked to configure carranca for a repo:

1. Review the workspace to identify the project stack, package managers, and development tooling needs.
2. Read both Carranca-managed skills and any user-provided skills before proposing changes.
3. Propose changes only to `.carranca.yml` and `.carranca/Containerfile`.
4. Preserve the shell-wrapper lines in the Containerfile.
5. Keep `.carranca.yml` on the `agents:` format and preserve valid existing agent entries unless the operator request says otherwise.
6. Use any explicit operator request in the prompt as a hard input when deciding what to change.
7. Prefer adding the minimum container dependencies needed for development inside the container.
8. Explain the rationale for each change clearly and briefly.
9. If no changes are needed, say so explicitly and output unchanged proposed files.
