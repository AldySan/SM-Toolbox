# Contributing to SM+ Toolbox

Thanks for your interest in making SM+ Toolbox better. Whether you've contributed to open source before or this is your first time, you're welcome here. This guide walks you through everything you need, step by step.

## Ways to contribute

You don't have to write code to help:

- **Report bugs.** If something behaves oddly, [open a bug report](https://github.com/AldySan/SM-Toolbox/issues/new?template=bug_report.yml). Good reports save everyone time.
- **Suggest features.** Ideas for making the app more comfortable to use are always interesting. [Open a feature request](https://github.com/AldySan/SM-Toolbox/issues/new?template=feature_request.yml).
- **Improve documentation.** Clearer wording, fixed typos, and better instructions help every user after you.
- **Write code.** Bug fixes and small features are the best place to start.

Unsure where to begin? Look through the [open issues](https://github.com/AldySan/SM-Toolbox/issues) and pick one that speaks to you. For bigger ideas, please open an issue and discuss the approach before investing a lot of time in code.

## Getting set up

You'll need [Node.js](https://nodejs.org) 22 or newer and [Git](https://git-scm.com).

**1. Fork the repository** on GitHub, then clone your fork:

```sh
git clone https://github.com/<your-username>/SM-Toolbox.git
cd SM-Toolbox
```

**2. Install dependencies:**

```sh
npm install
```

You may see a few deprecation warnings from Electron's packaging tools. They're expected and safe to ignore; see the [README](README.md#building-from-source) for the full story.

**3. Start the app:**

```sh
npm start
```

If the app window opens, you're all set.

**4. Run the checks** (you'll do this often):

```sh
npm test           # unit tests
npm run typecheck  # TypeScript type check
```

Both must pass before you open a pull request. They run quickly and don't need a display or network access.

## Finding your way around

The app is an Electron project with three processes:

```text
src/
├── main/       Runs with full privileges: builds, external tools, settings
├── preload/    The small bridge between the two processes
├── renderer/   The React UI: views, components, styles
└── shared/     Types and IPC channel names used by both sides
test/           Unit tests (Vitest)
```

Most feature work touches one of two places: the UI lives in `src/renderer/src/views/` and `src/renderer/src/components/`, while build steps, tool handling, and app logic live in `src/main/lib/`. The [README](README.md#how-its-built) describes each module in more detail.

A convention you'll notice right away: every source file starts with the line `// SPDX-License-Identifier: GPL-3.0-or-later`. Add it to any new `.ts` or `.tsx` file you create.

## The development workflow

The repository uses a simple branch model:

- **`dev`** is where development happens. All pull requests target this branch.
- **`main`** only receives releases. Please never open a pull request against it.

To work on a change:

```sh
git checkout dev
git pull
git checkout -b <branch-name>
```

Give the branch a short, descriptive name, like `fix/verify-queue-crash` or `docs/usage-screenshots`.

Two rules keep the history readable:

1. **One pull request, one purpose.** A PR that fixes a bug and also renames sidebar labels is two PRs. Unrelated changes make reviews harder than they need to be.
2. **Keep it as small as you can.** Small changes are reviewed faster, merged sooner, and break less.

When your work is done, push the branch to your fork and open a pull request against `dev`. The pull request template will guide you through the description.

## Code style

The project keeps things simple and consistent:

- **TypeScript everywhere**, with strict mode on. Let the type checker catch problems for you.
- **Follow the existing code.** The best style guide is the code around your change. Match naming, structure, and patterns you see nearby.
- **Comments are for the "why", not the "what".** The codebase stays lightly commented on purpose: comment only when a piece of logic is genuinely hard to read.
- **New external tools** should follow the existing `ToolInvocation` pattern (`command`, `prefix`, `env`, `origin`) so they work with tool overrides and the built-in tool manager.

If your change touches the UI, it also needs to respect the project's [design direction](DESIGN.md). The short version:

- The app should feel calm, comfortable, and native: quiet surfaces, one accent color, no decorative flourishes.
- Labels are sentence case (not UPPERCASE), and UI copy never uses the em dash character.
- Both the dark and the light theme must look right. Test your change in both.

## Commit messages

Commits follow [Conventional Commits](https://www.conventionalcommits.org). A commit message looks like this:

```text
fix: cancel a running build when its source folder is removed
feat: remember the last used output folder
docs: explain the exFAT requirements for Linux
```

The format is `type: short description`, all lowercase, no period at the end. Common types:

| Type | Use it for |
|---|---|
| `feat` | New user-facing functionality |
| `fix` | Bug fixes |
| `docs` | Documentation |
| `refactor` | Code changes that don't alter behavior |
| `test` | Adding or changing tests |
| `chore` | Tooling, dependencies, CI |

## Testing

The test suite runs with [Vitest](https://vitest.dev) and lives in `test/`. Tests are plain unit tests over pure logic: they need no network access, no console, and no Electron runtime, so they finish in seconds.

If you fix a bug, add a test that would have caught it. If you add logic to one of the pure modules (build recipes, queues, verification), cover it the same way the neighboring tests do. UI-only changes don't need new tests; a clear description of what you checked manually is enough.

Before sending your work, run:

```sh
npm test
npm run typecheck
```

CI runs both, plus a build and smoke test, on every pull request. If CI fails, the log usually says exactly why.

## Opening a pull request

1. Make sure `npm test` and `npm run typecheck` pass on your branch.
2. Push the branch to your fork.
3. Open a pull request against `dev` and fill in the [template](.github/PULL_REQUEST_TEMPLATE.md). A good description says what changed and why; screenshots help a lot for UI changes.
4. Respond to review feedback. Review comments are about the code, never about you; the [code of conduct](CODE_OF_CONDUCT.md) applies on both sides.

After the PR is merged, the branch is deleted. Thank you for contributing!

## Questions?

If anything in this guide is unclear, or you're stuck on something, [open an issue](https://github.com/AldySan/SM-Toolbox/issues) and ask. Questions are contributions too.
