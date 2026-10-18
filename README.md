# Joke Generation

Generating jokes with large language models. Given a **topic**, the LLM writes a joke about it.

The project started as a YNLG project (and is still one). Jokes are in **English** for now, but everything should be designed to work in any language.

## Goals

- Find good **models** for joke generation (open and API-based).
- Find good **prompts** (zero-shot, few-shot, multistep reasoning).
- Possibly explore **templates** for joke structure.
- Set up **evaluation** (human and automatic) that works across languages.
- Keep language-specific parts (prompts, data, evaluation) separable from language-independent code.

## Task definition

- **Input:** a topic (e.g. "cats", "tax office").
- **Output:** a joke about that topic, in the target language (English for now).

## Repository structure

```
README.md    this file
AGENTS.md    guidance for coding agents (CLAUDE.md points to it)
CLAUDE.md    entry point for Claude Code
papers/      related work (PDFs + summaries in papers/README.md)
jokes/       joke collections (one joke per line)
docs/        joke rating web app (served by GitHub Pages)
db/          database schema and seed data for the rating app (Supabase)
scripts/     helper scripts
```

Code, data and experiments will be added as the project grows.

## Related work

Summaries and PDFs are in [papers/](papers/README.md).

- Loakman, Thorne, Lin (2025). [Who's Laughing Now? An Overview of Computational Humour Generation and Explanation](https://aclanthology.org/2025.inlg-main.45/). INLG 2025.
- Tikhonov, Shtykovskiy (2024). [Humor Mechanics: Advancing Humor Generation with Multistep Reasoning](https://arxiv.org/abs/2405.07280). ICCC 2024.
- Amin, Burghardt (2020). [A Survey on Approaches to Computational Humor Generation](https://aclanthology.org/2020.latechclfl-1.4). LaTeCH-CLfL 2020.

## Human evaluation: rating app

A small web page where anyone can rate jokes on a 1-5 "how funny" scale and add their own. The page is static (`docs/`, hosted on GitHub Pages) and stores data in a free Supabase Postgres database.

- Each annotator gets an anonymous random ID kept in their browser.
- The next joke is one the annotator has not seen yet, never their own submission. Jokes with fewer than 3 ratings come first; after that, better-rated jokes are shown more often (weight = average score squared, with a 20% uniform pick for exploration). See `next_joke` in `db/schema.sql`.
- Skips are stored as ratings with an empty score.
- Annotators never see a joke's source (human/model). `docs/stats.html` lists jokes least-rated first.

Setup:

1. Create a Supabase project, open the SQL editor, run `db/schema.sql`, then `db/seed.sql`.
2. Put the project URL and publishable (anon) key into `docs/config.js`. Both are public by design.
3. In GitHub: Settings -> Pages -> Deploy from branch `main`, folder `/docs`.

Local preview: `python3 -m http.server -d docs 8000`, then open http://localhost:8000.

Add more jokes (e.g. model outputs):

```
python3 scripts/make_seed_sql.py outputs.txt --source model --model <name> --prompt-version <v> > db/seed_<name>.sql
```

and run the file in the Supabase SQL editor. Ratings and jokes can be exported as CSV from the Supabase table editor. To remove a bad submitted joke, set `hidden = true` on it.

## Status

Rating app for human evaluation. No generation code yet.
