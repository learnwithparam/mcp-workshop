---

paths:

- "README.md"
- "00-orientation/**/*.md"
- "parts/**/README.md"
- "parts/**/problem/README.md"

---

# Learner pages

These pages are for the learner doing the course. Write them for that reader, not about how this repo was built.

- Talk to the learner as "you". Say what they do, then what they see.
- One idea per sentence, 25 words at most. Split a sentence that has two ideas.
- No paragraph over 5 sentences. Start a new paragraph at each new idea.
- Plain words. Name a term once, then say what it means.
- No em dashes and no semicolons. Use a full stop or a comma.
- Every step page shows a picture (Mermaid or image) before its "Your challenge" section.
- Give one real example on each teaching page, with real ids and numbers from the diary (for example Biscuit, P-0001).
- No exact minutes on a learner page.
- Keep every code block, `Expect:` line and backticked token exactly as it is. Change only the words around them.

`bun run check` enforces the sentence, paragraph, punctuation, minutes and picture rules. Meaning is for you to judge. Read the page as a learner who has not seen MCP before. Fix anything they would have to re-read.
