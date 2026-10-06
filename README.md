# Work Navigator

Work Navigator is the current Interior Solutions IT + AI dashboard, packaged as a small static site. It keeps the existing visual design and Kanban, Daily Plan, ticket, timer, and Suggestions interactions.

## Data model

`data/database.json` is the single source of truth. It contains stable project and item IDs, tickets, the Daily Plan, time totals and time-entry extension point, suggestions, aggregate telemetry, and empty extension points for preferences and change proposals. The file is seeded from the current live tracker: 11 projects and 55 project items. The live tracker currently has no saved tickets, daily-plan entries, time entries, or suggestions, so those collections are empty rather than filled with examples.

The dashboard reads this file. Changes made in the browser are held in memory; **Download data** exports a replacement `database.json` that you can commit. The connected ChatGPT agent can instead edit the JSON file directly and commit it through GitHub. No MCP server, API key, OAuth client ID, backend API, or browser `localStorage` is used by this package.

## Create the repository

1. Create a new **private** repository named `work-navigator`. Do not add a README or other starter files during repository creation.
2. Extract this ZIP. In a terminal opened in the extracted `github-work-navigator` folder, run:

   ```bash
   git init -b main
   git add .
   git commit -m "Add Work Navigator"
   git remote add origin https://github.com/YOUR-ORG/work-navigator.git
   git push -u origin main
   ```

   Replace `YOUR-ORG` with the GitHub organization or account that owns the repository. If Git prompts you to authenticate, sign in using GitHub's supported credential flow; do not put a token in the website files.
3. In GitHub, open **Actions** and confirm the `Validate tracker data` workflow passes.
4. Connect the GitHub app to the Workforce Agent and grant that agent access to this repository with permission to read and write repository contents. Keep the repository private and do not grant broader organization access than needed.
5. Paste the contents of [`WORKFORCE_AGENT_INSTRUCTIONS.md`](WORKFORCE_AGENT_INSTRUCTIONS.md) into the agent's instructions. The agent should update `data/database.json` and commit the changes. GitHub history provides the audit trail and lets you revert a bad data update.

## Viewing the website

Serve the folder locally for a private preview, for example with VS Code Live Server or:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

GitHub Pages is **public by default, even when its source repository is private**. This database contains internal work context. Do not enable Pages unless your GitHub organization explicitly supports private Pages and you have set the published site's visibility to private. If there is no private visibility option, leave Pages disabled and use a private host for the UI. GitHub can still be the private source of truth for the agent to update.

If private Pages is available, enable it in **Repository Settings → Pages**, choose **Deploy from a branch**, select `main` and `/(root)`, and verify the published site's visibility is **Private** before opening it. GitHub documents private Pages publishing as an Enterprise Cloud feature; verify the repository's actual visibility control before publishing. See [GitHub's Pages visibility documentation](https://docs.github.com/en/enterprise-cloud@latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site).

When a suitable private host is configured to serve the repository root, each push updates the site files and database together. The frontend reads `data/database.json` using a relative URL, so it works from the repository root or a project subpath.

## Editing data safely

- Keep existing IDs stable. An item belongs to its project through `projectId`; a Daily Plan entry refers to the original item using `projectId` and `taskId`.
- Use the existing status values. Projects and items: `Planning`, `In Progress`, `Waiting`, `Blocked`, `Completed`. Tickets: `New`, `In Progress`, `Waiting`, `Resolved`.
- Use ISO-8601 UTC timestamps for created/updated dates.
- Record actual time only. Leave initial time fields empty/zero unless there is evidence of time actually worked.
- Keep telemetry summarized. Never add keystrokes, arbitrary typed content, browser cookies, credentials, or raw message contents to telemetry.
- Validate locally with `node scripts/validate-database.mjs` before committing.

## Included files

- `index.html`, `styles.css`, `script.js`, `config.js`, `telemetry.js`: dashboard and interactions.
- `data/database.json`: current tracker data and stable IDs.
- `WORKFORCE_AGENT_INSTRUCTIONS.md`: agent connection and data-update rules.
- `scripts/validate-database.mjs` and `.github/workflows/validate-data.yml`: JSON and relationship checks on pushes and pull requests.
