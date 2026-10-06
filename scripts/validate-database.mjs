import { readFileSync } from 'node:fs';

const file = new URL('../data/database.json', import.meta.url);
const db = JSON.parse(readFileSync(file, 'utf8'));
const errors = [];
const projectStatuses = new Set(['Planning', 'In Progress', 'Waiting', 'Blocked', 'Completed']);
const ticketStatuses = new Set(['New', 'In Progress', 'Waiting', 'Resolved']);
const projects = Array.isArray(db.projects) ? db.projects : [];
const projectIds = new Set();
const itemIds = new Set();
const allItems = new Map();

if (db.schemaVersion !== 1) errors.push('schemaVersion must be 1.');
for (const project of projects) {
  if (!project.id || projectIds.has(project.id)) errors.push(`Missing or duplicate project ID: ${project.id || '(empty)'}`);
  projectIds.add(project.id);
  if (!['IT', 'AI'].includes(project.role)) errors.push(`Invalid role for project ${project.id}.`);
  if (!projectStatuses.has(project.status)) errors.push(`Invalid project status for ${project.id}.`);
  for (const item of project.tasks || []) {
    if (!item.id || itemIds.has(item.id)) errors.push(`Missing or duplicate Project Item ID: ${item.id || '(empty)'}`);
    itemIds.add(item.id);
    allItems.set(item.id, item);
    if (item.projectId !== project.id) errors.push(`Project Item ${item.id} has the wrong projectId.`);
    if (!projectStatuses.has(item.status)) errors.push(`Invalid status for Project Item ${item.id}.`);
  }
}
for (const project of projects) for (const item of project.tasks || []) {
  for (const dep of item.dependencies || []) {
    const dependencyId = typeof dep === 'string' ? dep : dep.id;
    if (dependencyId && !allItems.has(dependencyId)) errors.push(`Project Item ${item.id} has missing dependency ${dependencyId}.`);
  }
}
const ticketIds = new Set();
for (const ticket of db.tickets || []) {
  if (!ticket.id || ticketIds.has(ticket.id)) errors.push(`Missing or duplicate ticket ID: ${ticket.id || '(empty)'}`);
  ticketIds.add(ticket.id);
  if (!ticketStatuses.has(ticket.status)) errors.push(`Invalid ticket status for ${ticket.id}.`);
  if (ticket.projectId && !projectIds.has(ticket.projectId)) errors.push(`Ticket ${ticket.id} has missing projectId.`);
  if (ticket.projectItemId && !allItems.has(ticket.projectItemId)) errors.push(`Ticket ${ticket.id} has missing projectItemId.`);
}
for (const entry of db.dailyPlan || []) {
  if (!projectIds.has(entry.projectId)) errors.push(`Daily Plan entry has missing projectId ${entry.projectId}.`);
  const item = allItems.get(entry.taskId);
  if (!item || item.projectId !== entry.projectId) errors.push(`Daily Plan entry does not reference an item in project ${entry.projectId}.`);
}
for (const suggestion of db.suggestions || []) {
  for (const field of ['id', 'text', 'area', 'createdAt', 'reviewStatus', 'aiClassification', 'resultingChange']) {
    if (typeof suggestion[field] !== 'string') errors.push(`Suggestion ${suggestion.id || '(empty)'} is missing string field ${field}.`);
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`Database valid: ${projects.length} projects, ${itemIds.size} Project Items, ${(db.tickets || []).length} tickets.`);
