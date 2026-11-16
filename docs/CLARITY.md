# Clarity rubric for learner pages

Use this when you rewrite a learner page: the root README, orientation, part READMEs, step `problem/README.md` and
troubleshooting. Do not change code, check messages, solutions, `wrong/` or `research/`.

Read the page for meaning first. Ask what job it does for the learner, what they already know at that point, and which
words they will not know. Then apply the five rules.

## The five rules

1. **One idea per sentence, 20 words or fewer.** Split a long sentence at "and", "which" or "so" when it carries two ideas.
2. **Plain words.** Use the everyday word. Name a term once, with its meaning right after it.
3. **Say what the learner sees, then what to do.** For each stuck point: the message, then the fix.
4. **One worked example per step.** Use real ids and numbers from the diary, such as Biscuit (P-0001) and 10:20.
5. **Keep every fact, command and `Expect:` line exactly.** Change the words around them, never the code or the output.

## Before and after

**Pair 1 (rule 1).**

Before: "For example, Biscuit at 10:40 with Dr Reyes fails. The model guesses 10:50, and that fails too. Each wrong guess
costs a tool call, tokens and a receptionist's wait."

After: "For example, Biscuit at 10:40 with Dr Reyes fails. The model guesses 10:50. That fails too. Each wrong guess costs
a tool call, tokens and a receptionist's wait."

**Pair 2 (rule 3).**

Before: "Connect a host. In Claude Code, open a terminal in this folder. Run `claude`. Approve `harrow-lane`, and check
it with `/mcp`."

After: "Connect a host, such as Claude Code. Open a terminal in this folder and run `claude`. Approve `harrow-lane`. Check
it with `/mcp`."

**Pair 3 (rules 1 and 2).**

Before: "The PIMS (practice management system) is the clinic's main record system. It holds the diary, patients and
owners, and it is the system the front desk uses every day to book visits, move visits and take payment."

After: "The PIMS is the clinic's main record system. Its full name is practice management system. It holds the diary,
the patients and the owners."

## Words replaced

| Avoid | Use instead |
| --- | --- |
| utilise, leverage | use |
| in order to | to |
| prior to | before |
| ensure | make sure |
| subsequently | then, after that |
| approximately | about |
| simply, just | (cut it) |
| obviously, clearly | (cut it) |
| functionality | feature, or say what it does |

## Check before you finish

- Every sentence reads alone and has 20 words or fewer.
- No semicolons in prose.
- No em dashes.
- Each code block, `Expect:` line and backticked token is the same as before. Run the diff in the scratchpad to check.
- `bun run check` and `bun scripts/verify.ts --all` give the same results as before.
