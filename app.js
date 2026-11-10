const KEY='taskflow_github_json_v3';
const $=id=>document.getElementById(id);
const fields=['title','description','category','status','assignee','watchers','contacts','priority','start','deadline'];
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();
const dateISO=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const today=()=>dateISO(new Date());
const dateParse=s=>new Date(s+'T12:00:00');
const addDays=(d,n)=>{let x=new Date(d);x.setDate(x.getDate()+n);return x};
const fmt=d=>d?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'—';
const statusClass=s=>({'Chưa bắt đầu':'todo','Đang thực hiện':'progress','Chờ xử lý':'blocked','Hoàn thành':'done'}[s]||'todo');
const late=t=>t.deadline&&t.deadline<today()&&t.status!=='Hoàn thành';
const cleanLink=u=>{try{const url=new URL(u);return ['http:','https:'].includes(url.protocol)?url.href:null}catch{return null}};
const defaults={title:'Lập kế hoạch công việc tuần',description:'Tạo checklist và phân công công việc cho nhóm',category:'Vận hành',status:'Đang thực hiện',assignee:'Nhóm dự án',watchers:'Quản lý',contacts:'',priority:'Bình thường',start:today(),deadline:dateISO(addDays(new Date(),7)),subtasks:[{id:uid(),title:'Tổng hợp công việc',done:true},{id:uid(),title:'Phân công người phụ trách',done:false}],links:[]};
const demo=()=>[{...defaults,id:uid(),created:Date.now(),updated:Date.now()}];
let tasks=[];
let editId=null,baseRevision=null,view='list',period='month',cursor=new Date();
let githubToken='',repo={owner:'',name:'',branch:'main'},connected=false,saving=false,refreshing=false;
const state=()=>connected;
const notify=msg=>{$('teamMsg').textContent=msg};

function render(){
 const s=$('search').value.trim().toLocaleLowerCase('vi'),status=$('filterStatus').value,cat=$('filterCategory').value,sort=$('sort').value;
 const cats=[...new Set(tasks.map(t=>t.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
 $('filterCategory').innerHTML='<option value="">Tất cả danh mục</option>'+cats.map(x=>`<option value="${esc(x)}" ${cat===x?'selected':''}>${esc(x)}</option>`).join('');
 $('categories').innerHTML=cats.map(x=>`<option value="${esc(x)}"></option>`).join('');
 $('nall').textContent=tasks.filter(t=>!t.deleted).length;$('nprog').textContent=tasks.filter(t=>!t.deleted&&t.status==='Đang thực hiện').length;$('ndone').textContent=tasks.filter(t=>!t.deleted&&t.status==='Hoàn thành').length;$('nlate').textContent=tasks.filter(t=>!t.deleted&&late(t)).length;
 const rows=tasks.filter(t=>!t.deleted).filter(t=>(!status||t.status===status)&&(!cat||t.category===cat)&&[t.title,t.description,t.assignee,t.watchers,t.contacts,t.category,...(t.subtasks||[]).map(x=>x.title)].join(' ').toLocaleLowerCase('vi').includes(s));
 rows.sort((a,b)=>sort==='updated'?b.updated-a.updated:sort==='created'?b.created-a.created:sort==='title'?a.title.localeCompare(b.title,'vi'):(a.deadline||'9999').localeCompare(b.deadline||'9999'));
 $('tasklist').innerHTML=rows.length?rows.map(t=>{let n=t.subtasks?.length||0,d=t.subtasks?.filter(z=>z.done).length||0;return `<tr><td><div role="button" tabindex="0" class="taskname" data-open="${esc(t.id)}">${esc(t.title)}</div><div class="subtxt">${n?`${d}/${n} task nhỏ · `:''}${esc(t.priority||'Bình thường')}${t.links?.length?' · '+t.links.length+' link':''}</div></td><td>${esc(t.category||'—')}</td><td>${esc(t.assignee||'—')}</td><td><span class="pill ${statusClass(t.status)}">${esc(t.status)}</span></td><td class="nowrap ${late(t)?'overdue':''}">${fmt(t.deadline)}${late(t)?' ⚠':''}</td><td><button class="btn light small" data-open="${esc(t.id)}">Chi tiết</button></td></tr>`}).join(''):'<tr><td colspan="6" class="empty">Không có công việc phù hợp.</td></tr>';
 renderCalendar();
}
function addSub(item={}){const row=document.createElement('div');row.className='subrow';row.dataset.id=item.id||uid();row.innerHTML=`<label><input type="checkbox" ${item.done?'checked':''}><input type="text" value="${esc(item.title||'')}" placeholder="Nội dung task nhỏ"></label><button type="button" class="btn danger small" aria-label="Xóa task nhỏ">×</button>`;row.querySelector('button').onclick=()=>row.remove();$('subtasks').append(row)}
function addLink(item={}){const row=document.createElement('div');row.className='linkrow';row.innerHTML=`<input class="fieldname control" placeholder="Tên file / tài liệu" value="${esc(item.name||'')}"><input class="fieldurl control" placeholder="https://..." value="${esc(item.url||'')}"><button type="button" class="btn danger small">×</button>`;row.querySelector('button').onclick=()=>row.remove();$('links').append(row)}
function openTask(id=null,chosenDate=null){if(!connected)return alert('Vui lòng kết nối GitHub trước');editId=id;const t=tasks.find(x=>x.id===id&&!x.deleted);baseRevision=t?.revision??null;$('taskform').reset();fields.forEach(f=>$(f).value=t?.[f]||({status:'Chưa bắt đầu',priority:'Bình thường',start:chosenDate||''}[f]||''));$('subtasks').replaceChildren();$('links').replaceChildren();(t?.subtasks||[]).forEach(addSub);(t?.links||[]).forEach(addLink);$('modalTitle').textContent=t?'Chi tiết / Sửa công việc':'Thêm công việc';$('remove').hidden=!t;$('dialog').showModal()}
function closeTask(){$('dialog').close()}
async function persistTask(task){
 const expected=baseRevision;
 await mutateTasks((list)=>{
  const pos=list.findIndex(x=>x.id===task.id),current=pos>=0?list[pos]:null;
  if(expected===null){if(current)throw conflictError('Task mới đã tồn tại.')}else if(!current||current.deleted||current.revision!==expected)throw conflictError('Công việc này đã được người khác chỉnh sửa hoặc xóa. Dữ liệu trên web đã được tải lại; hãy mở lại task trước khi sửa.');
  const next={...task,revision:(current?.revision||0)+1,updatedBy:githubUsername,deleted:false};
  if(pos>=0)list[pos]=next;else list.push(next);
  return list;
 },`Cập nhật task: ${task.title.slice(0,65)}`);
}
async function deleteTask(id){
 const expected=baseRevision;
 await mutateTasks((list)=>{
  const pos=list.findIndex(x=>x.id===id),current=list[pos];
  if(!current||current.deleted||current.revision!==expected)throw conflictError('Task đã bị thay đổi hoặc xóa bởi người khác. Hãy tải lại và mở lại.');
  list[pos]={...current,deleted:true,revision:current.revision+1,updated:Date.now(),updatedBy:githubUsername};
  return list;
 },'Xóa task '+id.slice(0,8));
}
$('create').onclick=()=>openTask();$('close').onclick=closeTask;$('cancel').onclick=closeTask;$('addSub').onclick=()=>addSub();$('addLink').onclick=()=>addLink();
$('remove').onclick=async()=>{if(!connected||!editId||!confirm('Xóa công việc này cùng toàn bộ task nhỏ?'))return;try{await deleteTask(editId);closeTask()}catch(e){alert('Không xóa được: '+e.message)}};
$('taskform').onsubmit=async e=>{e.preventDefault();if(!connected)return;const now=Date.now(),old=tasks.find(t=>t.id===editId&&!t.deleted),t={id:old?.id||uid(),created:old?.created||now,updated:now};fields.forEach(f=>t[f]=$(f).value.trim());if(t.start&&t.deadline&&t.deadline<t.start){alert('Deadline phải bằng hoặc sau ngày bắt đầu');return}t.subtasks=[...$('subtasks').children].map(row=>({id:row.dataset.id,title:row.querySelector('input[type=text]').value.trim(),done:row.querySelector('input[type=checkbox]').checked})).filter(x=>x.title);t.links=[...$('links').children].map(row=>({name:row.querySelector('.fieldname').value.trim(),url:row.querySelector('.fieldurl').value.trim()})).filter(x=>x.url);if(t.links.some(x=>!cleanLink(x.url))){alert('Link phải bắt đầu bằng https:// hoặc http://');return}const submit=$('taskform').querySelector('[type=submit]');submit.disabled=true;try{await persistTask(t);closeTask()}catch(err){alert('Không lưu được: '+err.message)}finally{submit.disabled=false}};
$('tasklist').addEventListener('click',e=>{const id=e.target.closest('[data-open]')?.dataset.open;if(id)openTask(id)});
$('tasklist').addEventListener('keydown',e=>{if(e.key==='Enter'){const id=e.target.closest('[data-open]')?.dataset.open;if(id)openTask(id)}});
['search','filterStatus','filterCategory','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:3,exportedAt:new Date().toISOString(),tasks:tasks.filter(t=>!t.deleted)},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='taskflow-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('import').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{
 if(!connected)throw Error('Cần kết nối GitHub trước khi nhập');
 const data=JSON.parse(await f.text());if(!data||!Array.isArray(data.tasks)||data.tasks.some(t=>!t||typeof t.title!=='string'||!Array.isArray(t.subtasks)||!Array.isArray(t.links)))throw Error('File không đúng định dạng');
 if(!confirm(`Nhập ${data.tasks.length} task dưới dạng công việc mới?`))return;
 await mutateTasks(list=>{const now=Date.now();for(const t of data.tasks){list.push({...t,id:uid(),created:now,updated:now,revision:1,updatedBy:githubUsername,deleted:false})}return list},`Nhập ${data.tasks.length} task`);
 }catch(err){alert('Lỗi nhập JSON: '+err.message)}finally{e.target.value=''}};

// Calendar: deadline hiển thị nét liền, ngày bắt đầu hiển thị nét đứt.
const stamp=d=>dateISO(d);
const labelDate=d=>d.toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
function dailyTasks(key){return tasks.filter(t=>!t.deleted&&(t.start===key||t.deadline===key)).sort((a,b)=>(a.deadline===key?0:1)-(b.deadline===key?0:1))}
function chip(t,key){return `<button class="cal-chip ${t.status==='Hoàn thành'?'done':late(t)?'late':''} ${t.start===key&&t.deadline!==key?'startchip':''}" data-open="${esc(t.id)}" title="${esc(t.title)} — ${t.start===key&&t.deadline!==key?'Ngày bắt đầu':'Deadline'}">${t.start===key&&t.deadline!==key?'▶':'●'} ${esc(t.title)}</button>`}
function renderCalendar(){
 if(view!=='calendar')return;
 const now=new Date(cursor),day=new Date(now.getFullYear(),now.getMonth(),now.getDate());
 $('calTitle').textContent=period==='month'?`Tháng ${day.getMonth()+1}/${day.getFullYear()}`:period==='week'?`${fmt(stamp(addDays(day,-(day.getDay()+6)%7)))} – ${fmt(stamp(addDays(day,6-(day.getDay()+6)%7)))}`:labelDate(day);
 document.querySelectorAll('[data-period]').forEach(b=>{b.style.background=b.dataset.period===period?'#4269e9':'';b.style.color=b.dataset.period===period?'#fff':''});
 if(period==='day'){renderAgenda([day]);return}
 if(period==='week'){let start=addDays(day,-(day.getDay()+6)%7);renderAgenda(Array.from({length:7},(_,i)=>addDays(start,i)));return}
 const first=new Date(day.getFullYear(),day.getMonth(),1),start=addDays(first,-(first.getDay()+6)%7),last=new Date(day.getFullYear(),day.getMonth()+1,0),end=addDays(last,6-(last.getDay()+6)%7);
 let html='<div class="cal-grid">'+['T2','T3','T4','T5','T6','T7','CN'].map(x=>`<div class="cal-weekday">${x}</div>`).join('');
 for(let d=new Date(start);d<=end;d=addDays(d,1)){const key=stamp(d),list=dailyTasks(key);html+=`<div class="cal-day ${d.getMonth()!==day.getMonth()?'other':''} ${key===today()?'today':''}"><div class="cal-date">${d.getDate()}</div>${list.slice(0,3).map(t=>chip(t,key)).join('')}${list.length>3?`<div class="micro">+${list.length-3} công việc</div>`:''}</div>`}
 $('calBody').innerHTML=html+'</div>';
}
function renderAgenda(dates){let html='<div class="agenda">';for(const d of dates){const key=stamp(d);html+=`<div class="agenda-date">${esc(labelDate(d))}</div>`;const list=dailyTasks(key);html+=list.length?list.map(t=>`<div class="agenda-task"><div><div class="taskname" data-open="${esc(t.id)}">${esc(t.title)}</div><div class="micro">${t.start===key&&t.deadline!==key?'Bắt đầu':'Deadline'} · ${esc(t.assignee||'Chưa phân công')}</div></div><span class="pill ${statusClass(t.status)}">${esc(t.status)}</span></div>`).join(''):'<div class="micro" style="padding:10px 0">Không có công việc trong ngày</div>'} $('calBody').innerHTML=html+'</div>'}
$('tabList').onclick=()=>switchView('list');$('tabCalendar').onclick=()=>switchView('calendar');
function switchView(next){view=next;$('tabList').classList.toggle('active',next==='list');$('tabCalendar').classList.toggle('active',next==='calendar');$('listView').classList.toggle('hidden',next!=='list');$('calendarView').classList.toggle('hidden',next!=='calendar');render()}
$('calPrev').onclick=()=>{if(period==='month')cursor=new Date(cursor.getFullYear(),cursor.getMonth()-1,1);else cursor=addDays(cursor,period==='week'?-7:-1);renderCalendar()};
$('calNext').onclick=()=>{if(period==='month')cursor=new Date(cursor.getFullYear(),cursor.getMonth()+1,1);else cursor=addDays(cursor,period==='week'?7:1);renderCalendar()};
$('calToday').onclick=()=>{cursor=new Date();renderCalendar()};
document.querySelectorAll('[data-period]').forEach(b=>b.onclick=()=>{period=b.dataset.period;renderCalendar()});
$('calBody').addEventListener('click',e=>{const id=e.target.closest('[data-open]')?.dataset.open;if(id)openTask(id)});


// GitHub JSON backend. Token is held in memory only (not localStorage or git).
const API='https://api.github.com';
let githubUsername='';
function conflictError(message){const e=new Error(message);e.name='TaskConflict';return e}
function uiStatus(message,ok=false){const el=$('authInfo');el.textContent=message;el.classList.toggle('is-ok',ok);el.classList.toggle('is-error',!ok&&message.startsWith('Lỗi'))}
function endpoint(){return `${API}/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}/contents/data/tasks.json`}
function headers(){return {'Accept':'application/vnd.github+json','Authorization':`Bearer ${githubToken}`,'X-GitHub-Api-Version':'2022-11-28'}}
async function request(url,options={}){
 const res=await fetch(url,{...options,headers:{...headers(),...(options.headers||{})},cache:'no-store'});
 let data={};try{data=await res.json()}catch{}
 if(!res.ok){const err=new Error(data.message||`GitHub HTTP ${res.status}`);err.status=res.status;throw err}
 return data;
}
const decode64=s=>new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));
const encode64=text=>{const b=new TextEncoder().encode(text);let binary='';for(let i=0;i<b.length;i+=8192)binary+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(binary)};
async function readLatest(){
 const data=await request(endpoint()+'?ref='+encodeURIComponent(repo.branch)+'&nocache='+Date.now());
 if(data.type!=='file'||typeof data.content!=='string')throw Error('data/tasks.json không phải một file JSON hợp lệ');
 const doc=JSON.parse(decode64(data.content));
 if(!doc||!Array.isArray(doc.tasks))throw Error('data/tasks.json phải chứa đối tượng có mảng tasks');
 return {sha:data.sha,tasks:doc.tasks,document:doc};
}
function updateTasks(list){tasks=list;render();$('storageHint').textContent=`Đã đồng bộ • ${repo.owner}/${repo.name} • ${new Date().toLocaleTimeString('vi-VN')}`}
async function reloadTasks(silent=false){if(!connected||saving||refreshing)return;refreshing=true;try{
 const remote=await readLatest();updateTasks(remote.tasks);
 if(!silent)uiStatus(`Đã đồng bộ với ${repo.owner}/${repo.name}. Đăng nhập: @${githubUsername}`,true);
 }catch(err){if(!silent)uiStatus('Lỗi làm mới: '+err.message);else notify('Không đồng bộ được: '+err.message)}finally{refreshing=false}}
async function mutateTasks(change,message){
 if(!connected||saving)throw Error('Chưa kết nối hoặc đang lưu dữ liệu');
 saving=true;$('create').disabled=true;
 try{
  for(let n=0;n<4;n++){
   const remote=await readLatest();
   let updated;
   try{updated=change(structuredClone(remote.tasks))}catch(e){updateTasks(remote.tasks);throw e}
   const payload={...remote.document,tasks:updated,updatedAt:new Date().toISOString()};
   try{
    await request(endpoint(),{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,content:encode64(JSON.stringify(payload,null,2)+'\n'),sha:remote.sha,branch:repo.branch})});
    updateTasks(updated);uiStatus(`Lưu thành công lên GitHub • @${githubUsername} • ${new Date().toLocaleTimeString('vi-VN')}`,true);return;
   }catch(e){if(e.status===409){if(n<3)continue;throw conflictError('Hai người cập nhật liên tục. Hãy làm mới và thử lại.')}throw e}
  }
 }finally{saving=false;$('create').disabled=!connected}
}
function setConnected(value){connected=value;$('create').disabled=!value;$('refresh').disabled=!value;$('disconnect').disabled=!value;$('connect').disabled=value;$('githubToken').disabled=value;$('repoOwner').disabled=value;$('repoName').disabled=value;$('repoBranch').disabled=value;$('import').disabled=!value;$('syncBadge').textContent=value?'● GitHub đang kết nối':'Chưa kết nối GitHub';$('setupBanner').classList.toggle('hidden',value);if(!value){tasks=[];render();$('storageHint').textContent='Chưa kết nối • không thể chỉnh sửa'}}
$('connect').onclick=async()=>{
 const owner=$('repoOwner').value.trim(),name=$('repoName').value.trim(),branch=$('repoBranch').value.trim()||'main',token=$('githubToken').value.trim();
 if(!/^[a-zA-Z0-9-]{1,39}$/.test(owner)||!/^[\w.-]{1,100}$/.test(name)||!branch||!token)return uiStatus('Lỗi: Hãy nhập đúng chủ repo, tên repo, nhánh và token.');
 repo={owner,name,branch};githubToken=token;$('connect').disabled=true;uiStatus('Đang kiểm tra quyền truy cập GitHub…');
 try{
  const user=await request(API+'/user');githubUsername=user.login;
  const remote=await readLatest();
  localStorage.setItem('taskflow_repo_v3',JSON.stringify(repo));
  setConnected(true);updateTasks(remote.tasks);
  uiStatus(`Đã kết nối @${githubUsername} • ${repo.owner}/${repo.name} (${repo.branch}). Tự kiểm tra thay đổi 30 giây/lần.`,true);
 }catch(e){githubToken='';githubUsername='';$('githubToken').value='';uiStatus('Lỗi kết nối: '+(e.status===404?'Không thấy data/tasks.json hoặc không có quyền đọc repository Private.':e.status===401?'Token không hợp lệ hoặc đã hết hạn.':e.message));$('connect').disabled=false}
};
$('disconnect').onclick=()=>{githubToken='';githubUsername='';$('githubToken').value='';setConnected(false);uiStatus('Đã ngắt kết nối và xóa token khỏi bộ nhớ trang.')};
$('refresh').onclick=()=>reloadTasks();
try{const r=JSON.parse(localStorage.getItem('taskflow_repo_v3'));if(r){$('repoOwner').value=r.owner||'';$('repoName').value=r.name||'';$('repoBranch').value=r.branch||'main'}}catch{}
setConnected(false);
render();
setInterval(()=>{if(connected&&!document.hidden&&!$('dialog').open)reloadTasks(true)},30000);
