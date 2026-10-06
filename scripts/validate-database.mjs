import { readFileSync } from 'node:fs';

const tableNames = [
  'tracker_projects',
  'tracker_project_items',
  'tracker_records',
  'tracker_feedback',
  'tracker_time_entries'
];
const errors = [];
const loadTable = name => {
  const file = new URL(`../database/${name}.json`, import.meta.url);
  const table = JSON.parse(readFileSync(file, 'utf8'));
  if (table.schemaVersion !== 1) errors.push(`${name}: schemaVersion must be 1.`);
  if (table.table !== name) errors.push(`${name}: table name does not match its file.`);
  if (!Array.isArray(table.rows)) errors.push(`${name}: rows must be an array.`);
  return Array.isArray(table.rows) ? table.rows : [];
};
const tables = Object.fromEntries(tableNames.map(name => [name, loadTable(name)]));
const projectStatuses = new Set(['Planning', 'In Progress', 'Waiting', 'Blocked', 'Completed']);
const ticketStatuses = new Set(['New', 'In Progress', 'Waiting', 'Resolved']);
const projectIds = new Set();
const itemIds = new Set();
const allItems = new Map();

for (const project of tables.tracker_projects) {
  if (!project.id || projectIds.has(project.id)) errors.push(`Missing or duplicate project ID: ${project.id || '(empty)'}`);
  projectIds.add(project.id);
  if (!['IT', 'AI'].includes(project.role)) errors.push(`Invalid role for project ${project.id}.`);
  if (!projectStatuses.has(project.status)) errors.push(`Invalid project status for ${project.id}.`);
  if ('tasks' in project) errors.push(`Project ${project.id} embeds tasks; use tracker_project_items instead.`);
}
for (const item of tables.tracker_project_items) {
  if (!item.id || itemIds.has(item.id)) errors.push(`Missing or duplicate Project Item ID: ${item.id || '(empty)'}`);
  itemIds.add(item.id);
  allItems.set(item.id, item);
  if (!projectIds.has(item.projectId)) errors.push(`Project Item ${item.id} has missing projectId ${item.projectId}.`);
  if (!projectStatuses.has(item.status)) errors.push(`Invalid status for Project Item ${item.id}.`);
}
for (const item of tables.tracker_project_items) {
  for (const dep of item.dependencies || []) {
    const dependencyId = typeof dep === 'string' ? dep : dep.id;
    if (dependencyId && !allItems.has(dependencyId)) errors.push(`Project Item ${item.id} has missing dependency ${dependencyId}.`);
  }
}

const recordIds = new Set();
const ticketIds = new Set();
let timerCount = 0;
for (const record of tables.tracker_records) {
  if (!record.id || recordIds.has(record.id)) errors.push(`Missing or duplicate tracker_records ID: ${record.id || '(empty)'}`);
  recordIds.add(record.id);
  if (!record.recordType) errors.push(`Record ${record.id || '(empty)'} is missing recordType.`);
  if (record.recordType === 'ticket') {
    const ticketId = record.ticketId || record.id;
    if (ticketIds.has(ticketId)) errors.push(`Duplicate ticket ID: ${ticketId}`);
    ticketIds.add(ticketId);
    if (!ticketStatuses.has(record.status)) errors.push(`Invalid ticket status for ${ticketId}.`);
    if (record.projectId && !projectIds.has(record.projectId)) errors.push(`Ticket ${ticketId} has missing projectId.`);
    if (record.projectItemId && !allItems.has(record.projectItemId)) errors.push(`Ticket ${ticketId} has missing projectItemId.`);
  }
  if (record.recordType === 'daily_plan') {
    if (!projectIds.has(record.projectId)) errors.push(`Daily Plan record ${record.id} has missing projectId ${record.projectId}.`);
    const item = allItems.get(record.taskId);
    if (!item || item.projectId !== record.projectId) errors.push(`Daily Plan record ${record.id} does not reference an item in project ${record.projectId}.`);
  }
  if (record.recordType === 'project_time_total' && !projectIds.has(record.projectId)) errors.push(`Project time record ${record.id} has missing projectId.`);
  if (record.recordType === 'timer') timerCount += 1;
  if (record.recordType === 'telemetry_event' && record.eventType !== 'session_summary') errors.push(`Telemetry record ${record.id} must be a privacy-safe session_summary.`);
}
if (timerCount > 1) errors.push('tracker_records may contain only one timer record.');

const feedbackIds = new Set();
for (const feedback of tables.tracker_feedback) {
  if (!feedback.id || feedbackIds.has(feedback.id)) errors.push(`Missing or duplicate feedback ID: ${feedback.id || '(empty)'}`);
  feedbackIds.add(feedback.id);
  for (const field of ['id', 'text', 'area', 'createdAt', 'reviewStatus', 'aiClassification', 'resultingChange']) {
    if (typeof feedback[field] !== 'string') errors.push(`Feedback ${feedback.id || '(empty)'} is missing string field ${field}.`);
  }
}

const timeEntryIds = new Set();
for (const entry of tables.tracker_time_entries) {
  if (!entry.id || timeEntryIds.has(entry.id)) errors.push(`Missing or duplicate time entry ID: ${entry.id || '(empty)'}`);
  timeEntryIds.add(entry.id);
  if (entry.projectId && !projectIds.has(entry.projectId)) errors.push(`Time entry ${entry.id} has missing projectId.`);
  if (entry.projectItemId && !allItems.has(entry.projectItemId)) errors.push(`Time entry ${entry.id} has missing projectItemId.`);
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Database valid: ${projectIds.size} projects, ${itemIds.size} Project Items, ${ticketIds.size} tickets, ${tables.tracker_feedback.length} feedback rows, ${tables.tracker_time_entries.length} time entries.`);
