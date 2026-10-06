# Work Navigator

Work Navigator is the Interior Solutions IT + AI project tracker. It is a static GitHub Pages application with Kanban views, Daily Plan, tickets, timers, suggestions, and privacy-safe telemetry.

## Database tables

The 'database/' folder is the source of truth. Data is normalized into five visible JSON tables:

- 'tracker_projects.json': one row per project.
- 'tracker_project_items.json': one row per Project Item, joined to a project with 'projectId'.
- 'tracker_records.json': flexible typed records for roles, tickets, Daily Plan entries, timer state, project time totals, privacy-safe telemetry summaries/events, learned preferences, and change proposals.
- 'tracker_feedback.json': suggestions and review outcomes.
- 'tracker_time_entries.json': actual time-entry events with project/item references.

Each file has a 'schemaVersion', 'table', 'lastUpdatedAt', and 'rows' array. The seeded database contains 11 projects and 55 Project Items. Empty tables are intentionally empty rather than filled with examples.

The frontend fetches all five tables and joins them in memory. Browser edits remain in memory until **Download database tables** is used; the five downloaded files can replace the files in 'database/'. The connected tracker agent can edit and commit the table files directly. GitHub history provides the audit trail.

GitHub Pages is static: browser edits cannot write back to the repository by themselves. No API key, OAuth client, backend API, or browser 'localStorage' is embedded in the site.

## Live site

The public site is deployed by '.github/workflows/deploy-pages.yml':

<https://rsokolowskydev.github.io/Project-Tracker---IS-/>

Each push to 'main' republishes the website assets and the 'database/' folder.

For local preview:

    python -m http.server 8000

Then open 'http://localhost:8000'.

## Editing data safely

- Keep existing IDs stable.
- Keep Project Items in 'tracker_project_items'; do not embed them inside project rows.
- Use 'projectId' and 'taskId'/'projectItemId' references instead of duplicating related data.
- Projects and items use 'Planning', 'In Progress', 'Waiting', 'Blocked', or 'Completed'.
- Tickets use 'New', 'In Progress', 'Waiting', or 'Resolved'.
- Record actual time only.
- Telemetry records may contain aggregate/session-summary counts only. Never store keystrokes, form values, raw messages, credentials, cookies, personal identifiers, or arbitrary typed content.
- Run 'node scripts/validate-database.mjs' before committing.

## Included files

- 'index.html', 'styles.css', 'script.js', 'config.js', 'telemetry.js': dashboard and interactions.
- 'database/*.json': repository-backed database tables.
- 'WORKFORCE_AGENT_INSTRUCTIONS.md': agent data-update rules.
- 'scripts/validate-database.mjs': table and relationship validation.
- '.github/workflows/validate-data.yml': validation on database changes.
- '.github/workflows/deploy-pages.yml': public Pages deployment.
