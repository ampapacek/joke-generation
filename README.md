# Joke Generation

Generating jokes with large language models. Given a **topic**, the LLM writes a joke about it.

The project started as a YNLG project (and is still one). Current focus is **Czech**, but everything should be designed to work in any language.

## Goals

- Find good **models** for joke generation (open and API-based).
- Find good **prompts** (zero-shot, few-shot, multistep reasoning).
- Possibly explore **templates** for joke structure.
- Set up **evaluation** (human and automatic) that works across languages.
- Keep language-specific parts (prompts, data, evaluation) separable from language-independent code.

## Task definition

- **Input:** a topic (e.g. "cats", "tax office").
- **Output:** a joke about that topic, in the target language (Czech for now).

## Repository structure

```
README.md    this file
AGENTS.md    guidance for coding agents (CLAUDE.md points to it)
CLAUDE.md    entry point for Claude Code
papers/      related work (PDFs)
```

Code, data and experiments will be added as the project grows.

## Related work

PDFs are in [papers/](papers/).

### Who's Laughing Now? An Overview of Computational Humour Generation and Explanation
Loakman, Thorne, Lin. INLG 2025. [ACL Anthology](https://aclanthology.org/2025.inlg-main.45/) · [PDF](papers/inlg2025-45.pdf)

A recent survey of humour generation and explanation. It argues that humour is a demanding test of the common-sense and reasoning abilities of LLMs. It finds that work beyond puns is sparse and that models still fall well short of humans. It also discusses the subjective and ethically ambiguous side of humour and proposes future directions. This is the main up-to-date overview for the project.

### Humor Mechanics: Advancing Humor Generation with Multistep Reasoning
Tikhonov, Shtykovskiy. ICCC 2024. [arXiv:2405.07280](https://arxiv.org/abs/2405.07280) · [PDF](papers/arxiv-2405.07280.pdf)

Models how people write one-liner jokes and breaks generation into several reasoning steps. Human ratings show that the multistep system produces funnier jokes than zero-shot GPT-4 and other baselines, and approaches human-written jokes. The datasets are shared. A natural starting point for our prompting experiments.

### A Survey on Approaches to Computational Humor Generation
Amin, Burghardt. LaTeCH-CLfL 2020. [ACL Anthology](https://aclanthology.org/2020.latechclfl-1.4) · [PDF](papers/latechclfl2020-4.pdf)

A pre-LLM survey of systems generating verbal humour (jokes, short funny texts), reviewed against linguistic theories of humour. It examines how such systems are evaluated and proposes two evaluation criteria: humorousness and complexity. Useful for the classical template-based approaches and for evaluation design.

## Status

Project setup. No code yet.
