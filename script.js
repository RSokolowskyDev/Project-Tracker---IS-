const CONFIG = window.WORK_NAV_CONFIG || {};
const TICKET_STATUSES = CONFIG.ticketStatuses || ['New', 'In Progress', 'Waiting', 'Resolved'];
const WORK_STATUSES = ['Planning', 'In Progress', 'Waiting', 'Blocked', 'Completed'];

let persistTimer=null, storageReady=false, hasUnsavedChanges=false, databaseSnapshot=null;
function stateSnapshot(){return {projects,tickets,timeData,timer,dailyPlan}}
function persistNow(){
  if(!storageReady)return Promise.resolve(false);
  hasUnsavedChanges=true;updateExportButton();return Promise.resolve(true);
}
function save(){clearTimeout(persistTimer);persistTimer=setTimeout(persistNow,180);updateBadge()}
function exportDatabase(){
  const previous=databaseSnapshot?.telemetrySummary||{},current=window.WorkNavTelemetry?.getSummary?.()||{};
  const addCounts=(a={},b={})=>Object.fromEntries(Array.from(new Set([...Object.keys(a),...Object.keys(b)]),k=>[k,(Number(a[k])||0)+(Number(b[k])||0)]));
  const db={schemaVersion:1,lastUpdatedAt:new Date().toISOString(),roles:structuredClone(databaseSnapshot?.roles||[{id:'IT',name:'IT'},{id:'AI',name:'AI'}]),projects:structuredClone(projects),tickets:structuredClone(tickets),dailyPlan:structuredClone(dailyPlan),timeData:structuredClone(timeData),timeEntries:structuredClone(databaseSnapshot?.timeEntries||[]),timer:structuredClone(timer),suggestions:structuredClone(suggestions),telemetrySummary:{schemaVersion:1,lastUpdatedAt:new Date().toISOString(),totalEvents:(Number(previous.totalEvents)||0)+(Number(current.totalEvents)||0),sessionCount:(Number(previous.sessionCount)||0)+(current.totalEvents?1:0),eventCounts:addCounts(previous.eventCounts,current.eventCounts),viewCounts:addCounts(previous.viewCounts,current.viewCounts),activeSecondsByView:addCounts(previous.activeSecondsByView,current.activeSecondsByView),scrollingSecondsByView:addCounts(previous.scrollingSecondsByView,current.scrollingSecondsByView),notes:'Aggregate interaction counts only. No raw click targets, keystrokes, or field values are retained.'},changeProposals:structuredClone(databaseSnapshot?.changeProposals||[]),learnedPreferences:structuredClone(databaseSnapshot?.learnedPreferences||[])};
  const blob=new Blob([JSON.stringify(db,null,2)+'\\n'],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='database.json';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  hasUnsavedChanges=false;updateExportButton();showToast('Downloaded database.json. Commit it to GitHub to keep these changes.');
}
function updateExportButton(){const button=document.getElementById('export-data'),note=document.getElementById('repo-sync-note');if(!button)return;button.textContent=hasUnsavedChanges?'Download updated data':'Download data';if(note){note.classList.toggle('dirty',hasUnsavedChanges);note.innerHTML=hasUnsavedChanges?'Unsaved browser changes · download the updated <code>database.json</code> and commit it to GitHub.':'GitHub data snapshot · use <strong>Download data</strong> after editing here, then commit the file as <code>data/database.json</code>.'}}
window.WorkNavDataDirty=()=>{if(storageReady){hasUnsavedChanges=true;updateExportButton()}};
function escapeHtml(value){return String(value??'').replace(/[&<>'"]/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch]))}
function statusSlug(status){return String(status).toLowerCase().replace(/[^a-z0-9]+/g,'-')}
function statusClass(status){return `status-${statusSlug(status)}`}
function normalizeTicket(t){return {...t,unread:Boolean(t.unread),description:t.description||'',affected:t.affected||'',attempted:t.attempted||'',nextAction:t.nextAction||'',updated:t.updated||t.created||''}}
function normalizeProjects(){projects.forEach(p=>{p.tasks=(p.tasks||[]).map(t=>({id:t.id||crypto.randomUUID(),title:t.title||'Untitled item',status:WORK_STATUSES.includes(t.status)?t.status:'Planning',done:t.status==='Completed'||Boolean(t.done),notes:t.notes||'',source:t.source||'Manual',priority:t.priority||'Medium',estimatedMinutes:Number(t.estimatedMinutes)||60,dueDate:t.dueDate||'',dependencies:Array.isArray(t.dependencies)?t.dependencies:[],evidence:t.evidence||'',createdAt:t.createdAt||new Date().toISOString(),updatedAt:t.updatedAt||new Date().toISOString(),manualEdited:Boolean(t.manualEdited)}))})}
function normalizeDailyPlan(){dailyPlan=dailyPlan.map(x=>{const p=projects.find(y=>y.id===x.projectId);const task=p?.tasks.find(t=>t.id===x.taskId);return p&&task?{time:x.time||'',projectId:p.id,taskId:task.id}:null}).filter(Boolean)}

let projects=[];
let tickets=[];
let timeData={};
let timer={projectId:'',running:false,startedAt:null};
let dailyPlan=[];
let suggestions=[];
let state={view:'dashboard',role:null,projectId:null};
let tickHandle=null;

const content=document.getElementById('content');
const breadcrumb=document.getElementById('breadcrumb');
const topNav=document.getElementById('top-nav');
const projectModal=document.getElementById('project-modal');
const ticketModal=document.getElementById('ticket-modal');
const ticketForm=document.getElementById('ticket-form');
const toast=document.getElementById('toast');

function ensureWorkItemModal(){
  if(document.getElementById('work-item-modal'))return;
  document.body.insertAdjacentHTML('beforeend',`<div id="work-item-modal" class="modal-backdrop hidden">
    <div class="modal compact-modal">
      <div class="modal-head"><div><div class="eyebrow">Project item</div><h2 id="work-item-modal-title">Work item</h2></div><button class="icon-button" id="close-work-item-modal">×</button></div>
      <form id="work-item-form" class="form-grid">
        <input type="hidden" name="projectId"><input type="hidden" name="taskId">
        <label class="full">Title<input name="title" required></label>
        <label>Status<select name="status">${WORK_STATUSES.map(s=>`<option>${s}</option>`).join('')}</select></label>
        <label>Priority<select name="priority"><option>High</option><option selected>Medium</option><option>Low</option></select></label>
        <label>Estimated minutes<input name="estimatedMinutes" type="number" min="5" step="5"></label>
        <label>Due date<input name="dueDate" type="date"></label>
        <label>Source<input name="source" placeholder="Manual / AI / Teams / Ticket"></label>
        <label class="full">Notes<textarea name="notes" rows="4" placeholder="Context, expected output, or definition of done"></textarea></label>
        <label class="full">Dependencies<input name="dependencies" placeholder="Other item IDs, separated by commas"></label>
        <label class="full">Source / evidence<input name="evidence" placeholder="Link, ticket ID, file, or supporting context"></label>
        <div class="modal-actions full"><button type="button" class="secondary" id="delete-work-item">Delete</button><span class="modal-spacer"></span><button type="button" class="secondary" id="cancel-work-item-modal">Cancel</button><button class="primary" type="submit">Save</button></div>
      </form>
    </div>
  </div>`);
  const modal=document.getElementById('work-item-modal');
  document.getElementById('close-work-item-modal').addEventListener('click',closeWorkItemModal);
  document.getElementById('cancel-work-item-modal').addEventListener('click',closeWorkItemModal);
  modal.addEventListener('click',e=>{if(e.target===modal)closeWorkItemModal()});
  document.getElementById('work-item-form').addEventListener('submit',saveWorkItemModal);
  document.getElementById('delete-work-item').addEventListener('click',deleteWorkItemModal);
}
ensureWorkItemModal();

function setView(view,arg=null){state.view=view;state.role=view==='role'?arg:null;state.projectId=view==='project'?arg:null;window.WorkNavTelemetry?.setView(view,{role:state.role||'',projectId:state.projectId||''});render()}
function openProject(id){setView('project',id)}
function render(){
  updateNav();updateBreadcrumb();updateBadge();
  if(state.view==='dashboard')renderDashboard();
  else if(state.view==='role')renderRole(state.role);
  else if(state.view==='project')renderProject(state.projectId);
  else if(state.view==='daily')renderDaily();
  else if(state.view==='tickets')renderTickets();
  else if(state.view==='suggestions')renderSuggestions();
}
function updateNav(){document.querySelectorAll('#top-nav button').forEach(b=>{b.classList.toggle('active',b.dataset.nav===state.view||(state.view==='project'&&b.dataset.nav==='role'&&b.dataset.role===projects.find(p=>p.id===state.projectId)?.role))})}
function updateBreadcrumb(){
  if(state.view==='dashboard'){breadcrumb.innerHTML=''}
  else if(state.view==='daily')breadcrumb.innerHTML='<button data-go="dashboard">Dashboard</button><span>›</span><span>Daily Plan</span>';
  else if(state.view==='tickets')breadcrumb.innerHTML='<button data-go="dashboard">Dashboard</button><span>›</span><span>Tickets</span>';
  else if(state.view==='suggestions')breadcrumb.innerHTML='<button data-go="dashboard">Dashboard</button><span>›</span><span>Suggestions</span>';
  else if(state.view==='role')breadcrumb.innerHTML=`<button data-go="dashboard">Dashboard</button><span>›</span><span>${escapeHtml(state.role)}</span>`;
  else if(state.view==='project'){
    const p=projects.find(x=>x.id===state.projectId);
    breadcrumb.innerHTML=`<button data-go="dashboard">Dashboard</button><span>›</span><button data-role-crumb="${p?.role||''}">${escapeHtml(p?.role||'')}</button><span>›</span><span>${escapeHtml(p?.name||'Project')}</span>`;
  }
  breadcrumb.querySelectorAll('[data-go]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.go)));
  breadcrumb.querySelectorAll('[data-role-crumb]').forEach(b=>b.addEventListener('click',()=>setView('role',b.dataset.roleCrumb)));
}
function updateBadge(){const n=tickets.filter(t=>t.unread).length;const b=document.getElementById('ticket-badge');b.textContent=n;b.classList.toggle('hidden',n===0)}

function projectProgress(p){if(!p.tasks.length)return 0;return Math.round(p.tasks.filter(t=>t.status==='Completed').length/p.tasks.length*100)}
function projectTrack(p){
  const total=Math.max(1,p.tasks.length),planned=p.tasks.filter(t=>t.status==='Planning').length,completed=p.tasks.filter(t=>t.status==='Completed').length;
  const plannedPct=planned/total*100,nonPlannedPct=100-plannedPct;
  return `<div class="project-track-wrap"><div class="project-track-labels"><span>Start</span><span>${planned?`${planned} planned`:'Active work'}</span><span>Done</span></div><div class="project-track"><button class="project-track-dark c-${p.color}" style="width:${nonPlannedPct}%" data-open-project="${p.id}" title="Open ${escapeHtml(p.name)}"></button>${planned?`<button class="project-track-planned c-${p.color}" style="width:${plannedPct}%" data-open-project="${p.id}" title="Open ${escapeHtml(p.name)}"></button>`:''}<span class="track-endpoint start"></span><span class="track-endpoint end"></span></div></div>`;
}
function roleBlock(role){
  const list=projects.filter(p=>p.role===role&&p.status!=='Completed');
  return `<div class="role-card ${role.toLowerCase()}"><div class="role-head"><h3><span class="dot ${role.toLowerCase()}"></span>${role}</h3><button class="secondary" data-open-role="${role}">Open</button></div><div class="project-mini-list">${list.slice(0,5).map(p=>`<article class="project-mini-card"><div class="project-mini-head"><div class="project-mini-name"><span class="color-dot c-${p.color}"></span><strong title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</strong></div><span>${projectProgress(p)}%</span></div><div class="project-mini-meta"><span class="status-pill ${statusClass(p.status)}">${p.status}</span><span>${p.tasks.filter(t=>t.status!=='Completed').length} open items</span></div>${projectTrack(p)}</article>`).join('')}</div></div>`;
}
function renderDashboard(){
  const unread=tickets.filter(t=>t.unread);
  const openTickets=tickets.filter(t=>t.status!=='Resolved').length;
  const active=projects.filter(p=>p.status!=='Completed').length;
  content.innerHTML=`<div class="page-head"><div><h1>Your work</h1><p>Projects first. Open a role, then a project, like folders.</p></div></div>
    <section class="hero-grid"><div class="panel"><div class="panel-title"><div><h2>Projects</h2><p>IT and AI stay separated until you need the detail.</p></div></div><div class="role-split">${roleBlock('IT')}${roleBlock('AI')}</div></div>
    <div class="panel"><div class="panel-title"><div><h2>At a glance</h2><p>Just enough to decide where to go.</p></div></div><div class="stats"><div class="stat"><span>Active projects</span><strong>${active}</strong></div><div class="stat"><span>Open tickets</span><strong>${openTickets}</strong></div><div class="stat"><span>New tickets</span><strong>${unread.length}</strong></div></div><div class="dashboard-quick"><button class="secondary" data-go="daily">Plan today</button><button class="secondary" data-go="tickets">Open tickets</button></div></div></section>
    <section class="dashboard-bottom"><div class="panel"><div class="panel-title"><div><h2>New tickets</h2><p>Click for the complete request.</p></div><button class="secondary" data-go="tickets">All tickets</button></div>${ticketList(unread.slice(0,4))||'<div class="empty">No unread tickets.</div>'}</div>
    <div class="panel"><div class="panel-title"><div><h2>Time by project</h2><p>Where focused time is going.</p></div></div>${timeChart()}</div>
    <div class="panel"><div class="panel-title"><div><h2>Needs attention</h2><p>Blocked and waiting project items.</p></div></div>${projects.flatMap(p=>p.tasks.filter(t=>['Blocked','Waiting'].includes(t.status)).map(t=>`<button class="attention-item" data-open-project="${p.id}"><span class="status-pill ${statusClass(t.status)}">${t.status}</span><strong>${escapeHtml(t.title)}</strong><small>${escapeHtml(p.name)}</small></button>`)).slice(0,5).join('')||'<div class="empty">Nothing blocked or waiting.</div>'}</div>
    <div class="panel"><div class="panel-title"><div><h2>Planning lens</h2><p>Keep people visible in the work.</p></div></div><div class="focus-card"><strong>Outcome</strong><span>What needs to be different when the work is done?</span></div><div class="focus-card"><strong>People</strong><span>Who is affected, and what do they need?</span></div><div class="focus-card"><strong>Friction</strong><span>What can be made easier for them?</span></div></div></section>`;
  bindCommon();
}

function renderRole(role){
  const list=projects.filter(p=>p.role===role);
  content.innerHTML=`<div class="page-head"><div><h1>${role} projects</h1><p>Drag a project between columns to update its overall status. Click it to open the project.</p></div><button class="primary" id="role-new-project">+ Project</button></div>
    <section class="work-kanban project-kanban" id="role-project-board">${WORK_STATUSES.map(status=>projectKanbanColumn(status,list)).join('')}</section>`;
  document.getElementById('role-new-project').addEventListener('click',()=>openProjectModal(role));
  bindProjectBoard();bindCommon();
}
function projectKanbanColumn(status,list){
  const rows=list.filter(p=>p.status===status);
  return `<div class="work-column ${statusClass(status)}" data-project-status="${status}"><div class="work-column-head"><div><span class="kanban-status-dot"></span><strong>${status}</strong></div><span>${rows.length}</span></div><div class="work-dropzone">${rows.map(projectKanbanCard).join('')||'<div class="kanban-empty">Drop projects here</div>'}</div></div>`;
}
function projectKanbanCard(p){
  return `<article class="project-kanban-card" draggable="true" data-project-card-id="${p.id}"><div class="kanban-card-top"><span class="color-dot c-${p.color}"></span><span class="project-percent">${projectProgress(p)}%</span></div><strong>${escapeHtml(p.name)}</strong><p>${escapeHtml(p.summary)}</p><div class="progress"><span style="width:${projectProgress(p)}%"></span></div><div class="kanban-card-meta"><span>${p.tasks.filter(t=>t.status!=='Completed').length} open items</span><span>${p.role}</span></div></article>`;
}
function bindProjectBoard(){
  let dragging=null;
  document.querySelectorAll('[data-project-card-id]').forEach(card=>{
    card.addEventListener('dragstart',e=>{dragging=card.dataset.projectCardId;card.classList.add('dragging');e.dataTransfer.setData('application/x-project-id',dragging);e.dataTransfer.effectAllowed='move'});
    card.addEventListener('dragend',()=>{card.classList.remove('dragging');dragging=null;document.querySelectorAll('[data-project-status]').forEach(c=>c.classList.remove('drag-over'))});
    card.addEventListener('click',()=>openProject(card.dataset.projectCardId));
  });
  document.querySelectorAll('[data-project-status]').forEach(col=>{
    col.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-project-id')){e.preventDefault();col.classList.add('drag-over')}});
    col.addEventListener('dragleave',e=>{if(!col.contains(e.relatedTarget))col.classList.remove('drag-over')});
    col.addEventListener('drop',e=>{const id=dragging||e.dataTransfer.getData('application/x-project-id');if(!id)return;e.preventDefault();const p=projects.find(x=>x.id===id);if(!p)return;p.status=col.dataset.projectStatus;save();renderRole(p.role);showToast(`Project moved to ${p.status}`)});
  });
}

function renderProject(id){
  const p=projects.find(x=>x.id===id);if(!p){setView('dashboard');return}
  const progress=projectProgress(p);
  content.innerHTML=`<div class="page-head project-head"><div><div class="eyebrow">${p.role} project</div><h1>${escapeHtml(p.name)}</h1><p>${escapeHtml(p.summary)}</p></div><div class="project-head-actions"><label class="project-status-control"><span>Project status</span><select id="project-status">${WORK_STATUSES.map(x=>`<option ${p.status===x?'selected':''}>${x}</option>`).join('')}</select></label><button class="primary" id="new-work-item">+ Item</button></div></div>
    <div class="project-summary"><div class="info-box"><span>Completed</span><strong>${progress}%</strong></div><div class="info-box"><span>Open items</span><strong>${p.tasks.filter(t=>t.status!=='Completed').length}</strong></div><div class="info-box"><span>Planned today</span><strong>${dailyPlan.filter(x=>x.projectId===p.id).length}</strong></div><div class="info-box"><span>Focused time</span><strong>${formatShort(accumulatedSeconds(p.id))}</strong></div></div>
    <details class="panel outcome-details"><summary><div><strong>Outcome check</strong><span>People, outcome, friction, and next helpful move</span></div><span class="section-chevron">›</span></summary><div class="mindset mindset-grid"><label>Who is impacted?<textarea data-field="impact">${escapeHtml(p.impact||'')}</textarea></label><label>What do they need?<textarea data-field="needs">${escapeHtml(p.needs||'')}</textarea></label><label>Where might we add friction?<textarea data-field="friction">${escapeHtml(p.friction||'')}</textarea></label><label>Next helpful action<textarea data-field="helpfulAction">${escapeHtml(p.helpfulAction||'')}</textarea></label></div></details>
    <div class="board-heading"><div><h2>Project items</h2><p>These are the schedulable action items. Drag between columns to update status.</p></div><button class="secondary" id="generate-items">Generate Project Items</button></div>
    <section class="work-kanban item-kanban" id="project-item-board">${WORK_STATUSES.map(status=>itemKanbanColumn(p,status)).join('')}</section>`;
  document.getElementById('project-status').addEventListener('change',e=>{p.status=e.target.value;save();renderProject(p.id)});
  document.getElementById('new-work-item').addEventListener('click',()=>openWorkItemModal(p.id,null,'Planning'));
  document.getElementById('generate-items').addEventListener('click',()=>generatePrototypeItems(p));
  document.querySelectorAll('[data-field]').forEach(el=>el.addEventListener('change',e=>{p[e.target.dataset.field]=e.target.value;save()}));
  bindItemBoard(p);bindCommon();
}
function itemKanbanColumn(p,status){
  const rows=p.tasks.filter(t=>t.status===status);
  return `<div class="work-column ${statusClass(status)}" data-item-status="${status}"><div class="work-column-head"><div><span class="kanban-status-dot"></span><strong>${status}</strong></div><span>${rows.length}</span></div><div class="work-dropzone">${rows.map(t=>itemKanbanCard(p,t)).join('')||'<div class="kanban-empty">Drop items here</div>'}</div></div>`;
}
function itemKanbanCard(p,t){
  const planned=dailyPlan.some(x=>x.projectId===p.id&&x.taskId===t.id);
  return `<article class="item-kanban-card" draggable="true" data-item-card-id="${t.id}"><div class="kanban-card-top"><span class="source-chip">${escapeHtml(t.source||'Manual')}</span>${planned?'<span class="planned-chip">TODAY</span>':''}</div><strong>${escapeHtml(t.title)}</strong>${t.notes?`<p>${escapeHtml(t.notes)}</p>`:''}<div class="kanban-card-meta"><button class="text-button plan-item-btn" data-plan-task="${t.id}">${planned?'Planned':'Add to today'}</button><span>Click to edit</span></div></article>`;
}
function bindItemBoard(p){
  let dragging=null;
  document.querySelectorAll('[data-item-card-id]').forEach(card=>{
    card.addEventListener('dragstart',e=>{if(e.target.closest('button')){e.preventDefault();return}dragging=card.dataset.itemCardId;card.classList.add('dragging');e.dataTransfer.setData('application/x-item-id',dragging);e.dataTransfer.effectAllowed='move'});
    card.addEventListener('dragend',()=>{card.classList.remove('dragging');dragging=null;document.querySelectorAll('[data-item-status]').forEach(c=>c.classList.remove('drag-over'))});
    card.addEventListener('click',e=>{if(e.target.closest('button'))return;openWorkItemModal(p.id,card.dataset.itemCardId)});
  });
  document.querySelectorAll('[data-item-status]').forEach(col=>{
    col.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-item-id')){e.preventDefault();col.classList.add('drag-over')}});
    col.addEventListener('dragleave',e=>{if(!col.contains(e.relatedTarget))col.classList.remove('drag-over')});
    col.addEventListener('drop',e=>{const id=dragging||e.dataTransfer.getData('application/x-item-id');if(!id)return;e.preventDefault();const t=p.tasks.find(x=>x.id===id);if(!t)return;t.status=col.dataset.itemStatus;t.done=t.status==='Completed';save();renderProject(p.id);showToast(`Item moved to ${t.status}`)});
  });
  document.querySelectorAll('[data-plan-task]').forEach(btn=>btn.addEventListener('click',e=>{e.stopPropagation();const task=p.tasks.find(t=>t.id===btn.dataset.planTask);if(task)addTaskToToday(p,task)}));
}
function generatePrototypeItems(p){
  const context=`${p.name} ${p.summary} ${p.needs} ${p.helpfulAction}`.toLowerCase();
  const candidates=[
    'Create executive summary',
    /migrat|cloud|server|move|cutover/.test(context)?'Document migration sequence':'Prepare implementation plan',
    /access|identity|endpoint|network|vpn|permission/.test(context)?'Validate access and user impact':'Confirm success criteria',
    /vendor|carrier|provider|cabling/.test(context)?'Contact vendor and confirm next checkpoint':'Review costs and dependencies'
  ];
  let added=0;
  for(const title of candidates){const fullTitle=`${title} — ${p.name}`;if(!p.tasks.some(t=>t.title.toLowerCase()===fullTitle.toLowerCase())){const item=makeTask(crypto.randomUUID(),fullTitle,'Planning',`Draft proposal based on this project’s context: ${p.summary||p.name}`,'AI proposed');item.aiGenerated=true;item.aiClassification='draft';item.evidence='Generated from current project name, summary, needs, and next helpful action.';p.tasks.push(item);added++}}
  save();renderProject(p.id);showToast(added?`Added ${added} editable project item proposals.`:'Suggested items already exist.');
}

function openWorkItemModal(projectId,taskId=null,defaultStatus='Planning'){
  const p=projects.find(x=>x.id===projectId);if(!p)return;
  const task=taskId?p.tasks.find(t=>t.id===taskId):null;
  const modal=document.getElementById('work-item-modal'),form=document.getElementById('work-item-form');
  form.elements.projectId.value=p.id;form.elements.taskId.value=task?.id||'';form.elements.title.value=task?.title||'';form.elements.status.value=task?.status||defaultStatus;form.elements.priority.value=task?.priority||'Medium';form.elements.estimatedMinutes.value=task?.estimatedMinutes||60;form.elements.dueDate.value=task?.dueDate||'';form.elements.source.value=task?.source||'Manual';form.elements.notes.value=task?.notes||'';form.elements.dependencies.value=(task?.dependencies||[]).join(', ');form.elements.evidence.value=task?.evidence||'';
  document.getElementById('work-item-modal-title').textContent=task?'Edit item':'New item';
  document.getElementById('delete-work-item').classList.toggle('hidden',!task);
  modal.classList.remove('hidden');document.body.classList.add('modal-open');setTimeout(()=>form.elements.title.focus(),0);
}
function closeWorkItemModal(){document.getElementById('work-item-modal').classList.add('hidden');document.body.classList.remove('modal-open')}
function saveWorkItemModal(e){
  e.preventDefault();const form=e.currentTarget,d=Object.fromEntries(new FormData(form).entries()),p=projects.find(x=>x.id===d.projectId);if(!p)return;
  let task=p.tasks.find(t=>t.id===d.taskId);
  if(task){task.title=d.title.trim()||task.title;task.status=d.status;task.done=d.status==='Completed';task.source=d.source.trim()||'Manual';task.notes=d.notes.trim();task.priority=d.priority||'Medium';task.estimatedMinutes=Number(d.estimatedMinutes)||60;task.dueDate=d.dueDate||'';task.dependencies=d.dependencies.split(',').map(x=>x.trim()).filter(Boolean);task.evidence=d.evidence.trim();task.updatedAt=new Date().toISOString();task.manualEdited=true;if(task.source==='AI suggestion')task.source='Manual edit'}
  else{task=makeTask(crypto.randomUUID(),d.title.trim(),d.status,d.notes.trim(),d.source.trim()||'Manual');Object.assign(task,{priority:d.priority||'Medium',estimatedMinutes:Number(d.estimatedMinutes)||60,dueDate:d.dueDate||'',dependencies:d.dependencies.split(',').map(x=>x.trim()).filter(Boolean),evidence:d.evidence.trim()});p.tasks.push(task)}
  save();closeWorkItemModal();renderProject(p.id);showToast(d.taskId?'Item updated':'Item added');
}
function deleteWorkItemModal(){
  const form=document.getElementById('work-item-form'),p=projects.find(x=>x.id===form.elements.projectId.value),id=form.elements.taskId.value;if(!p||!id)return;
  p.tasks=p.tasks.filter(t=>t.id!==id);dailyPlan=dailyPlan.filter(x=>!(x.projectId===p.id&&x.taskId===id));save();closeWorkItemModal();renderProject(p.id);showToast('Item deleted');
}

function planningLens(){return `<section class="panel planning-lens-panel"><div class="panel-title"><div><h2>Planning lens</h2><p>A quick check before you commit the day.</p></div></div><div class="planning-lens-grid"><div class="focus-card"><strong>Outcome</strong><span>What must be meaningfully different by the end of today?</span></div><div class="focus-card"><strong>People</strong><span>Who depends on your work, and what do they need from you?</span></div><div class="focus-card"><strong>Focus</strong><span>Protect time for the few items that create the most movement.</span></div><div class="focus-card"><strong>Reality check</strong><span>Leave room for tickets, interruptions, and work that takes longer than expected.</span></div></div></section>`}
function renderDaily(){
  normalizeDailyPlan();if(!dailyPlan.length)buildPlan(false);
  content.innerHTML=`<div class="daily-heading"><div><div class="eyebrow">Daily planning session</div><h1>Daily Plan</h1><p>Schedule project items directly. Drag in from the right, or drag back out to unschedule.</p></div><button class="secondary" id="rebuild-plan-top">Build from open work</button></div>${planningLens()}
    <div class="planner-grid"><section class="panel planner-schedule"><div class="panel-title"><div><h2>Today’s schedule</h2><p>Drag to reorder. Every row points to the same project item used everywhere else.</p></div><span class="drag-hint">Drop items here ↓</span></div><div class="schedule-head"><span></span><span>Time</span><span>Project</span><span>Item</span><span>Status</span><span></span></div><div class="schedule-list" id="schedule-list">${dailyPlan.map((x,i)=>scheduleRow(x,i)).join('')}</div><div class="schedule-actions"><button class="secondary" id="rebuild-plan">Rebuild from open work</button><button class="primary" id="send-plan">Send to ChatGPT</button></div></section>
    <aside class="panel available-work" id="available-work"><div class="panel-title"><div><h2>Available work</h2><p>IT and AI stay separated. Expand a role, then a project, and drag an item into today.</p></div><span class="pool-count">${availablePlanItems().length}</span></div><div class="available-project-list">${availableProjectGroups()}</div><div class="return-zone">↩ Drop a scheduled item here to remove it from today</div></aside></div>`;
  bindDaily();
}
function scheduleRow(x,i){
  const p=projects.find(y=>y.id===x.projectId)||projects[0];const task=p?.tasks.find(t=>t.id===x.taskId)||p?.tasks[0];
  return `<div class="schedule-row" data-plan-index="${i}" draggable="true"><span class="drag-grip" title="Drag to reorder or back to Available work">⋮⋮</span><input class="plan-time" value="${escapeHtml(x.time||'')}"><select class="plan-project">${projects.filter(proj=>proj.status!=='Completed'||proj.id===x.projectId).map(proj=>`<option value="${proj.id}" ${x.projectId===proj.id?'selected':''}>${escapeHtml(proj.name)}</option>`).join('')}</select><select class="plan-item">${(p?.tasks||[]).filter(t=>t.status!=='Completed'||t.id===x.taskId).map(t=>`<option value="${t.id}" ${x.taskId===t.id?'selected':''}>${escapeHtml(t.title)}</option>`).join('')}</select><select class="plan-status">${WORK_STATUSES.map(status=>`<option ${task?.status===status?'selected':''}>${status}</option>`).join('')}</select><button class="icon-button remove-schedule" title="Remove from today">×</button></div>`;
}
function availablePlanItems(){
  const scheduled=new Set(dailyPlan.map(x=>`${x.projectId}|${x.taskId}`));
  return projects.flatMap(p=>p.tasks.filter(t=>t.status!=='Completed'&&!scheduled.has(`${p.id}|${t.id}`)).map(task=>({p,task})));
}
function availableProjectGroups(){
  return ['IT','AI'].map(role=>{
    const roleProjects=projects.filter(p=>p.role===role&&p.status!=='Completed');
    const roleItems=availablePlanItems().filter(x=>x.p.role===role);
    return `<details class="available-role-group ${role.toLowerCase()}" open><summary><div><span class="role-folder-icon ${role.toLowerCase()}"></span><strong>${role}</strong><span class="role-folder-label">${role==='IT'?'Information Technology':'Artificial Intelligence'}</span></div><span class="group-count">${roleItems.length}</span></summary><div class="available-role-projects">${roleProjects.map((p,index)=>{
      const items=roleItems.filter(x=>x.p.id===p.id);
      return `<details class="available-project-group" ${index===0&&items.length?'open':''}><summary><div><span class="color-dot c-${p.color}"></span><strong>${escapeHtml(p.name)}</strong></div><span class="group-count">${items.length}</span></summary><div class="available-project-items">${items.map(availableItemCard).join('')||'<div class="empty compact-empty">Everything open is already scheduled.</div>'}</div></details>`;
    }).join('')}</div></details>`;
  }).join('');
}
function availableItemCard(x){return `<article class="available-item-card" draggable="true" data-available-project="${x.p.id}" data-available-task="${x.task.id}"><div class="kanban-card-top"><span class="status-pill ${statusClass(x.task.status)}">${x.task.status}</span><button class="text-button quick-plan" title="Add to today">+ Today</button></div><strong>${escapeHtml(x.task.title)}</strong>${x.task.notes?`<p>${escapeHtml(x.task.notes)}</p>`:''}</article>`}
function buildPlan(saveIt=true){
  const rank={'In Progress':0,'Planning':1,'Waiting':2,'Blocked':3};
  const candidates=projects.flatMap(p=>p.tasks.filter(t=>!['Completed','Waiting','Blocked'].includes(t.status)).map(task=>({p,task}))).sort((a,b)=>(rank[a.task.status]??9)-(rank[b.task.status]??9)).slice(0,5);
  const times=['8:30 AM','9:30 AM','10:45 AM','1:00 PM','2:30 PM'];dailyPlan=candidates.map((x,i)=>({time:times[i]||'',projectId:x.p.id,taskId:x.task.id}));if(saveIt)save();
}
function nextPlanTime(){const times=['8:30 AM','9:15 AM','10:30 AM','1:00 PM','2:30 PM','3:30 PM','4:15 PM'];return times[dailyPlan.length]||''}
function addTaskToToday(p,task,atIndex=null){
  if(dailyPlan.some(x=>x.projectId===p.id&&x.taskId===task.id)){showToast('That item is already scheduled today.');return}
  const entry={time:nextPlanTime(),projectId:p.id,taskId:task.id};if(atIndex===null||atIndex<0||atIndex>dailyPlan.length)dailyPlan.push(entry);else dailyPlan.splice(atIndex,0,entry);save();
  if(state.view==='daily')renderDaily();else renderProject(p.id);showToast('Added to today’s plan.');
}
function bindDaily(){
  document.querySelectorAll('.schedule-row').forEach(row=>{
    const i=Number(row.dataset.planIndex);
    row.querySelector('.plan-time').addEventListener('change',e=>{dailyPlan[i].time=e.target.value;save()});
    row.querySelector('.plan-project').addEventListener('change',e=>{const p=projects.find(x=>x.id===e.target.value);const task=p?.tasks.find(t=>!['Completed','Blocked'].includes(t.status))||p?.tasks[0];dailyPlan[i].projectId=p?.id||'';dailyPlan[i].taskId=task?.id||'';save();renderDaily()});
    row.querySelector('.plan-item').addEventListener('change',e=>{dailyPlan[i].taskId=e.target.value;save();renderDaily()});
    row.querySelector('.plan-status').addEventListener('change',e=>{const p=projects.find(x=>x.id===dailyPlan[i].projectId),task=p?.tasks.find(t=>t.id===dailyPlan[i].taskId);if(task){task.status=e.target.value;task.done=task.status==='Completed';save();renderDaily()}});
    row.querySelector('.remove-schedule').addEventListener('click',()=>{dailyPlan.splice(i,1);save();renderDaily()});
    row.addEventListener('dragstart',e=>{if(e.target.closest('input,select,button')){e.preventDefault();return}e.dataTransfer.setData('application/x-plan-index',String(i));e.dataTransfer.effectAllowed='move';row.classList.add('dragging')});
    row.addEventListener('dragend',()=>row.classList.remove('dragging'));
    row.addEventListener('dragover',e=>{e.preventDefault();row.classList.add('drag-target')});
    row.addEventListener('dragleave',()=>row.classList.remove('drag-target'));
    row.addEventListener('drop',e=>{e.preventDefault();row.classList.remove('drag-target');const raw=e.dataTransfer.getData('application/x-work-ref');if(raw){const ref=JSON.parse(raw),p=projects.find(x=>x.id===ref.projectId),task=p?.tasks.find(t=>t.id===ref.taskId);if(task)addTaskToToday(p,task,Number(row.dataset.planIndex));return}const from=e.dataTransfer.getData('application/x-plan-index');if(from!==''){const fromIndex=Number(from);const [entry]=dailyPlan.splice(fromIndex,1);let target=Number(row.dataset.planIndex);if(fromIndex<target)target--;dailyPlan.splice(target,0,entry);save();renderDaily()}});
  });
  document.querySelectorAll('.available-item-card').forEach(card=>{
    card.addEventListener('dragstart',e=>{if(e.target.closest('button')){e.preventDefault();return}e.dataTransfer.setData('application/x-work-ref',JSON.stringify({projectId:card.dataset.availableProject,taskId:card.dataset.availableTask}));e.dataTransfer.effectAllowed='move';card.classList.add('dragging')});
    card.addEventListener('dragend',()=>card.classList.remove('dragging'));
    card.querySelector('.quick-plan').addEventListener('click',()=>{const p=projects.find(x=>x.id===card.dataset.availableProject),task=p?.tasks.find(t=>t.id===card.dataset.availableTask);if(task)addTaskToToday(p,task)});
  });
  const schedule=document.getElementById('schedule-list');
  schedule.addEventListener('dragover',e=>{e.preventDefault();schedule.classList.add('drop-ready')});
  schedule.addEventListener('dragleave',e=>{if(!schedule.contains(e.relatedTarget))schedule.classList.remove('drop-ready')});
  schedule.addEventListener('drop',e=>{if(e.target.closest('.schedule-row'))return;e.preventDefault();schedule.classList.remove('drop-ready');const raw=e.dataTransfer.getData('application/x-work-ref');if(raw){const ref=JSON.parse(raw),p=projects.find(x=>x.id===ref.projectId),task=p?.tasks.find(t=>t.id===ref.taskId);if(task)addTaskToToday(p,task);return}const from=e.dataTransfer.getData('application/x-plan-index');if(from!==''){const [entry]=dailyPlan.splice(Number(from),1);dailyPlan.push(entry);save();renderDaily()}});
  const available=document.getElementById('available-work');
  available.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('application/x-plan-index')){e.preventDefault();available.classList.add('return-ready');e.dataTransfer.dropEffect='move'}});
  available.addEventListener('dragleave',e=>{if(!available.contains(e.relatedTarget))available.classList.remove('return-ready')});
  available.addEventListener('drop',e=>{const from=e.dataTransfer.getData('application/x-plan-index');if(from==='')return;e.preventDefault();available.classList.remove('return-ready');dailyPlan.splice(Number(from),1);save();renderDaily();showToast('Removed from today and returned to available work.')});
  const rebuild=()=>{buildPlan(true);renderDaily()};document.getElementById('rebuild-plan').addEventListener('click',rebuild);document.getElementById('rebuild-plan-top').addEventListener('click',rebuild);document.getElementById('send-plan').addEventListener('click',sendPlanToChatGPT);
}
async function sendPlanToChatGPT(){
  const lines=dailyPlan.map(x=>{const p=projects.find(y=>y.id===x.projectId),task=p?.tasks.find(t=>t.id===x.taskId);return `${x.time} | ${p?.name||'Project'} | ${task?.title||'Item'} | ${task?.status||''}`}).join('\n');
  const prompt=`Help me stay on track today. Review this proposed schedule, account for realistic transition time and interruptions, and suggest adjustments while keeping the highest-impact work first. Use an outward-mindset lens: consider who is affected and what they need. These are project action items from my tracker; status updates should stay synchronized with the source item.\n\n${lines}`;
  try{await navigator.clipboard.writeText(prompt);showToast('Plan copied. Paste it into ChatGPT now; the backend can submit it automatically later.')}catch{showToast('Could not copy automatically.')}
}

function renderTickets(){
  const counts=Object.fromEntries(TICKET_STATUSES.map(status=>[status,tickets.filter(t=>t.status===status).length]));
  content.innerHTML=`<div class="page-head"><div><h1>Tickets</h1><p>Drag tickets between columns to update status. Click a card for full details.</p></div><button class="secondary" id="mark-all-read">Mark all read</button></div><div class="ticket-summary-strip">${TICKET_STATUSES.map(status=>`<div class="ticket-summary-item"><span>${status}</span><strong>${counts[status]||0}</strong></div>`).join('')}</div><section class="kanban-board" id="ticket-kanban">${TICKET_STATUSES.map(status=>kanbanColumn(status)).join('')}</section>`;
  document.getElementById('mark-all-read').addEventListener('click',()=>{tickets.forEach(t=>t.unread=false);save();renderTickets()});bindTicketKanban();bindCommon();
}
function kanbanColumn(status){const list=tickets.filter(t=>t.status===status);return `<div class="kanban-column status-${statusSlug(status)}" data-ticket-status="${escapeHtml(status)}"><div class="kanban-column-head"><div><span class="kanban-status-dot"></span><strong>${escapeHtml(status)}</strong></div><span>${list.length}</span></div><div class="kanban-dropzone">${list.map(ticketCard).join('')||'<div class="kanban-empty">Drop tickets here</div>'}</div></div>`}
function ticketCard(t){return `<article class="kanban-card ${t.unread?'unread':''}" draggable="true" data-ticket-id="${t.id}"><div class="kanban-card-top"><span class="priority priority-${t.priority.toLowerCase()}">${t.priority}</span>${t.unread?'<span class="new-label">NEW</span>':''}</div><strong>${escapeHtml(t.title)}</strong><p>${escapeHtml(t.description||t.nextAction||'No description yet.')}</p><div class="kanban-card-meta"><span>${escapeHtml(t.source)}</span><span>${escapeHtml(t.created)}</span></div></article>`}
function ticketList(list){return list.map(t=>`<div class="ticket-item" data-ticket-id="${t.id}"><div class="ticket-line"><strong>${t.unread?'<span class="unread-dot"></span>':''}${escapeHtml(t.title)}</strong><span class="priority priority-${t.priority.toLowerCase()}">${t.priority}</span></div><div class="ticket-meta">${escapeHtml(t.status)} · ${escapeHtml(t.source)} · ${escapeHtml(t.created)}</div></div>`).join('')}
function bindTicketKanban(){
  let draggingId=null;
  document.querySelectorAll('.kanban-card').forEach(card=>{card.addEventListener('dragstart',e=>{draggingId=card.dataset.ticketId;card.classList.add('dragging');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',draggingId)});card.addEventListener('dragend',()=>{draggingId=null;card.classList.remove('dragging');document.querySelectorAll('.kanban-column').forEach(c=>c.classList.remove('drag-over'))})});
  document.querySelectorAll('.kanban-column').forEach(column=>{column.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';column.classList.add('drag-over')});column.addEventListener('dragleave',e=>{if(!column.contains(e.relatedTarget))column.classList.remove('drag-over')});column.addEventListener('drop',e=>{e.preventDefault();column.classList.remove('drag-over');const id=draggingId||e.dataTransfer.getData('text/plain');const t=tickets.find(x=>x.id===id);if(!t)return;t.status=column.dataset.ticketStatus;t.unread=false;t.updated='Just now';save();renderTickets();showToast(`Moved to ${t.status}`)})});
}
function openTicketModal(id){
  const t=tickets.find(x=>x.id===id);if(!t)return;t.unread=false;save();updateBadge();document.getElementById('ticket-modal-title').textContent=t.title;document.getElementById('ticket-modal-meta').textContent=`Last updated: ${t.updated||t.created}`;ticketForm.elements.id.value=t.id;ticketForm.elements.status.innerHTML=TICKET_STATUSES.map(s=>`<option ${s===t.status?'selected':''}>${escapeHtml(s)}</option>`).join('');for(const field of ['priority','source','created','title','description','affected','attempted','nextAction'])ticketForm.elements[field].value=t[field]||'';ticketModal.classList.remove('hidden');document.body.classList.add('modal-open');
}
function closeTicketModal(){ticketModal.classList.add('hidden');document.body.classList.remove('modal-open')}

function focusTracker(){const opts=projects.map(p=>`<option value="${p.id}" ${timer.projectId===p.id?'selected':''}>${p.role} · ${escapeHtml(p.name)}</option>`).join('');return `<div><select id="focus-project"><option value="">Choose project...</option>${opts}</select><div class="timer-row"><button class="${timer.running?'secondary':'primary'}" id="focus-toggle">${timer.running?'Stop':'Start focus'}</button><strong id="timer-display">${formatDuration(currentSessionSeconds())}</strong></div></div>`}
function currentSessionSeconds(){return timer.running&&timer.startedAt?Math.max(0,Math.floor((Date.now()-timer.startedAt)/1000)):0}
function accumulatedSeconds(id){return Number(timeData[id]||0)+(timer.running&&timer.projectId===id?currentSessionSeconds():0)}
function timeChart(){const rows=projects.map(p=>({p,seconds:accumulatedSeconds(p.id)})).filter(x=>x.seconds>0).sort((a,b)=>b.seconds-a.seconds).slice(0,5);if(!rows.length)return '<div class="empty">Start a focus timer to build this chart.</div>';const total=rows.reduce((s,x)=>s+x.seconds,0),colors=['#4e7ce8','#53a86b','#e09a3e','#8265d4','#d96464'];let cursor=0;const seg=rows.map((x,i)=>{const a=cursor;cursor+=x.seconds/total*100;return `${colors[i]} ${a}% ${cursor}%`}).join(',');return `<div class="time-layout"><div class="pie" style="background:conic-gradient(${seg})"></div><div>${rows.map((x,i)=>`<div class="legend-row"><span class="legend-dot" style="background:${colors[i]}"></span><span>${escapeHtml(x.p.name)}</span><strong>${formatShort(x.seconds)}</strong></div>`).join('')}</div></div>`}
function startTimer(){const id=document.getElementById('focus-project')?.value||timer.projectId;if(!id)return;timer={projectId:id,running:true,startedAt:Date.now()};save();startTick();render()}
function stopTimer(){if(timer.running&&timer.projectId)timeData[timer.projectId]=Number(timeData[timer.projectId]||0)+currentSessionSeconds();timer={projectId:timer.projectId,running:false,startedAt:null};save();stopTick();render()}
function startTick(){stopTick();tickHandle=setInterval(()=>{const d=document.getElementById('timer-display');if(d)d.textContent=formatDuration(currentSessionSeconds())},1000)}
function stopTick(){if(tickHandle)clearInterval(tickHandle);tickHandle=null}
function formatDuration(s){const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;return `${h}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`}
function formatShort(s){if(s<60)return `${s}s`;const h=Math.floor(s/3600),m=Math.floor((s%3600)/60);return h?`${h}h ${m}m`:`${m}m`}

function renderSuggestions(){
  const stats=window.WorkNavTelemetry?.getStats?.()||{queuedEvents:0,pageViews:0,clicks:0,dragDrops:0};
  const rows=[...suggestions].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  content.innerHTML=`<div class="page-head"><div><div class="eyebrow">Product feedback</div><h1>Suggestions</h1><p>Capture what should change. The future nightly review can combine this with usage telemetry and classify each idea before touching the code.</p></div></div>
    <div class="suggestions-grid">
      <section class="panel"><div class="panel-title"><div><h2>Add a suggestion</h2><p>Write the outcome you want, not implementation instructions unless they matter.</p></div></div>
        <form id="suggestion-form" class="suggestion-form">
          <label>Area<select name="area"><option>Dashboard</option><option>Daily Plan</option><option>IT</option><option>AI</option><option>Tickets</option><option>Navigation</option><option>Other</option></select></label>
          <label class="full">Suggestion<textarea name="text" rows="6" required placeholder="Example: Keep the Daily Plan available-work panel grouped by IT and AI, and remember which folders I leave expanded."></textarea></label>
          <div class="suggestion-note full">Submitted ideas remain <strong>Pending classification</strong> until the nightly review decides whether they are low-level or high-level.</div>
          <div class="modal-actions full"><button class="primary" type="submit">Save suggestion</button></div>
        </form>
      </section>
      <aside class="panel"><div class="panel-title"><div><h2>Usage signal</h2><p>Session activity is included when you download the database file.</p></div></div>
        <div class="telemetry-stats"><div><span>Queued events</span><strong>${stats.queuedEvents}</strong></div><div><span>Page views</span><strong>${stats.pageViews}</strong></div><div><span>Clicks</span><strong>${stats.clicks}</strong></div><div><span>Drag/drop</span><strong>${stats.dragDrops}</strong></div></div>
        <p class="privacy-note">Only aggregate counts are exported. The tracker does not record keystrokes, typed text, or form values.</p>
      </aside>
    </div>
    <section class="panel suggestions-history"><div class="panel-title"><div><h2>Suggestion inbox</h2><p>This becomes the human-authored input to the nightly improvement pass.</p></div><span class="pool-count">${rows.length}</span></div>
      <div class="suggestion-list">${rows.length?rows.map(x=>`<article class="suggestion-card"><div class="suggestion-card-top"><span class="source-chip">${escapeHtml(x.area)}</span><span class="status-pill status-planning">${escapeHtml(x.aiClassification||x.level||'Pending classification')}</span></div><p>${escapeHtml(x.text)}</p><div class="suggestion-meta"><span>${new Date(x.createdAt).toLocaleString()} · ${escapeHtml(x.reviewStatus||'Pending review')}</span><button class="text-button" data-delete-suggestion="${x.id}">Remove</button></div>${x.resultingChange?`<p class="muted">Review: ${escapeHtml(x.resultingChange)}</p>`:''}</article>`).join(''):'<div class="empty">No suggestions yet.</div>'}</div>
    </section>`;
  document.getElementById('suggestion-form').addEventListener('submit',saveSuggestion);
  document.querySelectorAll('[data-delete-suggestion]').forEach(btn=>btn.addEventListener('click',()=>removeSuggestion(btn.dataset.deleteSuggestion)));
  bindCommon();
}
async function saveSuggestion(e){
  e.preventDefault();
  const data=Object.fromEntries(new FormData(e.currentTarget).entries());
  const suggestion={id:crypto.randomUUID(),area:data.area||'Other',text:(data.text||'').trim(),createdAt:new Date().toISOString(),reviewStatus:'Pending review',aiClassification:'Pending classification',resultingChange:''};
  if(!suggestion.text)return;
  suggestions.push(suggestion);e.currentTarget.reset();save();
  window.WorkNavTelemetry?.track('suggestion_submitted',{area:suggestion.area,suggestionId:suggestion.id});
  renderSuggestions();showToast('Suggestion added. Download and commit the database file to keep it.');
}
async function removeSuggestion(id){
  suggestions=suggestions.filter(x=>x.id!==id);save();window.WorkNavTelemetry?.track('suggestion_removed');renderSuggestions()
}

function bindCommon(){
  document.querySelectorAll('[data-open-project]').forEach(el=>el.addEventListener('click',()=>openProject(el.dataset.openProject)));
  document.querySelectorAll('[data-open-role]').forEach(el=>el.addEventListener('click',()=>setView('role',el.dataset.openRole)));
  document.querySelectorAll('[data-go]').forEach(el=>el.addEventListener('click',()=>setView(el.dataset.go)));
  document.querySelectorAll('[data-ticket-id]').forEach(el=>el.addEventListener('click',()=>openTicketModal(el.dataset.ticketId)));
  document.getElementById('focus-toggle')?.addEventListener('click',()=>timer.running?stopTimer():startTimer());
  document.getElementById('focus-project')?.addEventListener('change',e=>{if(timer.running)stopTimer();timer.projectId=e.target.value;save()});
}

function openProjectModal(role='IT'){projectModal.classList.remove('hidden');const sel=document.querySelector('#project-form [name="role"]');if(sel)sel.value=role}
function closeProjectModal(){projectModal.classList.add('hidden');document.getElementById('project-form').reset()}
function showToast(msg){toast.textContent=msg;toast.classList.remove('hidden');setTimeout(()=>toast.classList.add('hidden'),3200)}

// Static modal / navigation bindings
projectModal.addEventListener('click',e=>{if(e.target===projectModal)closeProjectModal()});
document.getElementById('new-project-btn').addEventListener('click',()=>openProjectModal());
document.getElementById('close-project-modal').addEventListener('click',closeProjectModal);
document.getElementById('cancel-project-modal').addEventListener('click',closeProjectModal);
document.getElementById('project-form').addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(e.target).entries());const p=project(crypto.randomUUID(),d.role,d.name,d.color,d.status,d.summary,d.impact,d.needs,'','',[]);projects.unshift(p);save();closeProjectModal();openProject(p.id)});

document.getElementById('close-ticket-modal').addEventListener('click',closeTicketModal);
document.getElementById('cancel-ticket-modal').addEventListener('click',closeTicketModal);
ticketModal.addEventListener('click',e=>{if(e.target===ticketModal)closeTicketModal()});
ticketForm.addEventListener('submit',e=>{e.preventDefault();const d=Object.fromEntries(new FormData(ticketForm).entries()),t=tickets.find(x=>x.id===d.id);if(!t)return;for(const field of ['status','priority','source','created','title','description','affected','attempted','nextAction'])t[field]=d[field]||'';t.updated='Just now';t.unread=false;save();closeTicketModal();render();showToast('Ticket updated')});

document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(!ticketModal.classList.contains('hidden'))closeTicketModal();if(!document.getElementById('work-item-modal').classList.contains('hidden'))closeWorkItemModal()}});
topNav.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.nav==='role')setView('role',b.dataset.role);else setView(b.dataset.nav)});
document.querySelector('.brand').addEventListener('click',()=>setView('dashboard'));
document.getElementById('ticket-bell').addEventListener('click',()=>setView('tickets'));

if(timer.running)startTick();
window.WorkNavTelemetry?.setView('dashboard');
async function bootstrapPersistent(){
  try{
    const response=await fetch(CONFIG.backend?.dataFile||'./data/database.json',{cache:'no-store'});
    if(!response.ok)throw new Error('Database file unavailable');
    const data=await response.json();databaseSnapshot=data;
    projects=Array.isArray(data.projects)?data.projects:[];
    tickets=Array.isArray(data.tickets)?data.tickets.map(normalizeTicket):[];
    timeData=data.timeData&&typeof data.timeData==='object'?{...data.timeData}:{};
    timer=data.timer||{projectId:'',running:false,startedAt:null};
    dailyPlan=Array.isArray(data.dailyPlan)?data.dailyPlan:[];
    suggestions=Array.isArray(data.suggestions)?data.suggestions:[];
    if(timer.running){timer={projectId:timer.projectId||'',running:false,startedAt:null}}
    normalizeProjects();normalizeDailyPlan();
    storageReady=true;hasUnsavedChanges=false;updateExportButton();
  }catch(error){storageReady=false;projects=[];tickets=[];timeData={};timer={projectId:'',running:false,startedAt:null};dailyPlan=[];suggestions=[];showToast('Could not load data/database.json. Serve this folder through a local web server or GitHub Pages.');}
  render();
}
bootstrapPersistent();
document.getElementById('export-data').addEventListener('click',exportDatabase);
