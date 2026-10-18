# AGENTS.md

Guidance for coding agents working in this repository.

## Project

LLM-based joke generation: input is a topic, output is a joke about it. Current target language is English, but the design must stay language-agnostic. See [README.md](README.md) for goals and related work.

## Conventions

- Keep language-specific material (prompts, data, evaluation sets) separate from language-independent code. Do not hardcode English in shared code; take the language as a parameter.
- Prompts and templates are experiment artifacts: store them as files and version them. Do not bury them in code strings.
- Record model name, prompt version, and decoding settings with every generated output so experiments are reproducible.
- Never commit API keys or secrets. Use environment variables.
- Large data, model outputs, and downloaded weights stay out of git (add to `.gitignore` when they appear).
- Papers live in `papers/`. When adding one, put the PDF there and add a short summary and links to the related-work section of the README.

## Working with the maintainer

- The maintainer wants to discuss before big work: multi-file changes, new scripts or pipelines, refactors, launching long or costly jobs (including paid API calls). Ask clarifying questions and propose a plan first.
- A question about options is not permission to edit.
- Small, clearly scoped changes can be done directly.

## Commands

- Rating app local preview: `python3 -m http.server -d docs 8000`
- Generate seed SQL from a joke list: `python3 scripts/make_seed_sql.py jokes/by_people.txt --source curated > db/seed.sql`
- Database schema: `db/schema.sql` (run in the Supabase SQL editor)
