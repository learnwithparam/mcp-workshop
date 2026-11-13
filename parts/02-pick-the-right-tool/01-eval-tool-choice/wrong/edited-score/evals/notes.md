# What the baseline shows

Score: 20/20

The worst mix-up: T02

The tool the model called instead: list_clinical_notes

Why I think it picked wrong: every description starts with the same words, and none says "vaccine due". The model
guessed that a vet writes the due date in the notes, read all of Biscuit's notes, and never found it.
