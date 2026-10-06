/*
  Work Navigator personalization layer.
  This file is intentionally small so a future AI automation can safely tune
  labels, colors, and workflow defaults without rewriting the application.

  Recommended production workflow:
  AI proposes changes -> Git branch / pull request -> review -> Cloudflare deploy.
*/
window.WORK_NAV_CONFIG = {
  appName: 'Work Navigator',
  subtitle: 'IT + AI',
  ticketStatuses: ['New', 'In Progress', 'Waiting', 'Resolved'],
  roleColors: {
    IT: 'blue',
    AI: 'purple'
  },
  backend: {
    databasePath: './database',
    telemetryEndpoint: '',
    suggestionsEndpoint: ''
  },
  features: {
    dailyPlanning: true,
    timeTracking: true,
    outwardMindset: true,
    ticketKanban: true
  }
};
