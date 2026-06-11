# gitwiz

> Friendly git workflows — interactive wizards for branching, commits, releases, sync, and undo.

**gitwiz** removes the friction of working with git from the terminal. Instead of memorizing commands, you answer simple questions. Every git command gitwiz runs is printed before it executes, so you learn git as you go.

```
$ gitwiz commit
? Type of change: ✨ feat — A new feature
? Scope (optional): auth
? Short description: add password reset flow
┌──────────────────────────────────────┐
│ feat(auth): add password reset flow  │
└──────────────────────────────────────┘
? Create this commit? Yes
  $ git commit -m "feat(auth): add password reset flow"
✔ Commit created.
```

## Install

```bash
npm install -g gitwiz
# or run it without installing:
npx gitwiz status
```

Requires Node.js >= 20 and git. Nothing else — no git-flow binary, no tokens, no setup.

## Commands

| Command | What it does |
|---|---|
| `gitwiz status` | Where am I and what should I do next? Human-friendly status with suggested next steps. |
| `gitwiz init` | One-time setup: pick your production/work branches and tag prefix. |
| `gitwiz branch` | Start a feature/bugfix/hotfix/refactor branch the right way (updates the base first). |
| `gitwiz commit` | Guided [conventional commit](https://www.conventionalcommits.org): pick files, type, scope, description. |
| `gitwiz sync` | Safely bring the latest changes into your branch (guided merge/rebase, auto-stash). |
| `gitwiz undo` | Undo things without fear: last commit, staged files, local changes — each option explained. |
| `gitwiz release start` | Bump the version, generate/update `CHANGELOG.md` from your commits, open a release branch. |
| `gitwiz release finish` | Merge the release, create the tag, push, clean up. |

### `gitwiz status`

The only non-interactive command (safe in scripts/CI). Shows your branch, how far ahead/behind you are, your files grouped by state, and up to 3 suggested next steps.

### `gitwiz branch`

Asks what kind of work you're starting (feature, bugfix, hotfix, refactor, chore, docs), normalizes the name you type, pulls the latest base branch, creates `feature/<name>` and optionally pushes it. Hotfixes branch off your production branch; everything else off your work branch. Uncommitted changes? It offers to stash and bring them along.

### `gitwiz commit`

If nothing is staged it lets you pick files. Then walks you through type → scope → description → breaking change, previews the message, and commits. Messages follow [Conventional Commits](https://www.conventionalcommits.org), which is what powers the automatic changelog.

### `gitwiz sync`

Fetches, shows how far ahead/behind you are of your base branch, and offers plain-English strategies: merge the base into your branch (safe default), rebase (with a clear warning if the branch is shared), or just update your local base. If a conflict happens, it tells you exactly what to do — it never tries to resolve things for you.

### `gitwiz undo`

A menu of safe undos, each showing the exact git command it will run. Destructive options ask twice and mention `git reflog` as the escape hatch. If the last commit is already pushed, it offers a `git revert` instead of rewriting history.

### `gitwiz release`

`release start` checks nothing else is mid-release, updates your work branch, creates `release/<version>`, bumps `package.json` (and `package-lock.json`), and generates the changelog section from your conventional commits since the last tag — with compare/commit links when your remote is GitHub or GitLab. Review it, then `release finish` merges it back (`--no-ff`), tags `v<version>`, pushes, and deletes the release branch.

The changelog merge is structural: your existing `CHANGELOG.md` preamble (badges, custom intro) is preserved verbatim, old releases are kept, and re-running the same version replaces its section instead of duplicating it. CRLF files stay CRLF.

## Configuration

Run `gitwiz init`, or create `.gitwizrc.json` at your repo root (a `"gitwiz"` key in `package.json` also works):

```json
{
  "mainBranch": "main",
  "developBranch": "develop",
  "tagPrefix": "v"
}
```

Without config, gitwiz auto-detects your branches (`main`/`master`, `develop`/`development`/`dev`). If there is no work branch, it operates trunk-based on your main branch.

<details>
<summary>All options (with defaults)</summary>

```jsonc
{
  "mainBranch": "main",          // production branch
  "developBranch": "develop",    // where work branches start; same as mainBranch = trunk-based
  "tagPrefix": "v",              // release tags: v1.2.3 ("" for bare 1.2.3)
  "branchTypes": [               // what "gitwiz branch" offers
    { "type": "feature", "prefix": "feature/", "description": "New functionality", "base": "develop" },
    { "type": "hotfix",  "prefix": "hotfix/",  "description": "Urgent fix for production", "base": "main" }
    // ... bugfix, refactor, chore, docs
  ],
  "commitTypes": [               // what "gitwiz commit" offers + changelog mapping
    { "type": "feat", "emoji": "✨", "description": "A new feature", "changelogSection": "Features" },
    { "type": "fix",  "emoji": "🐛", "description": "A bug fix",     "changelogSection": "Bug Fixes" }
    // changelogSection: false hides the type from the changelog
  ],
  "release": {
    "alsoMergeToMain": false,    // true: release finish also merges into mainBranch
    "changelogFile": "CHANGELOG.md"
  }
}
```

</details>

## Why gitwiz?

- **Zero prerequisites** — plain git underneath. No git-flow binary, no global config.
- **Educational** — every mutating git command is echoed before running (`--verbose` echoes the read-only ones too).
- **Safe by default** — destructive actions double-confirm, pushed commits get revert suggestions, conflicts come with step-by-step instructions.
- **Windows-first class** — no shell interpolation anywhere; arguments go to git verbatim. Tested on Windows and Linux.
- **Tiny** — 4 runtime dependencies, fast `npx` startup.

## License

MIT © Facundo Sichi
