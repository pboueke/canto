development flow:

- user creates a requirement file in .claude/requirements
- claude creates a plan for it at .claude/plans, asking questions directly to the user if needed
- user reviews and approves plan. Tests are always included in the planning and implementation phases
- after execution is complete and user verified, claude adds a note to .claude/notes about the implementation and updates the repo CHANGELOG and
