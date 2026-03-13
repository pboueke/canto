development flow:

- user creates a requirement file in .claude/requirements
- claude creates a plan for it at .claude/plans, asking questions directly to the user if needed
- user reviews and aaproves plan
- after execution is complete and user verified, claude adds a note to .claude/node about the implementation and updates the repo CHANGELOG and version
