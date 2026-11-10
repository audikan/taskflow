const KEY='taskflow_v2';
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
let tasks=[];try{let stored=JSON.parse(localStorage.getItem(KEY));tasks=Array.isArray(stored)?stored:demo()}catch{tasks=demo()}
let editId=null, view='list',period='month',cursor=new Date(),db=null,session=null,workspaceId=null,workspaceName='',realtimeChannel=null,inviteCache={},loadedCloud=false,refreshing=false;
const cloudConfigured=!!(window.TASKFLOW_CONFIG?.supabaseUrl && window.TASKFLOW_CONFIG?.supabaseAnonKey);
const notify=msg=>{$('teamMsg').textContent=msg};
const state=()=>({shared:cloudConfigured&&!!session&&!!workspaceId});

function render(){
 const s=$('search').value.trim().toLocaleLowerCase('vi'),status=$('filterStatus').value,cat=$('filterCategory').value,sort=$('sort').value;
 const cats=[...new Set(tasks.map(t=>t.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'vi'));
 $('filterCategory').innerHTML='<option value="">Tất cả danh mục</option>'+cats.map(x=>`<option value="${esc(x)}" ${cat===x?'selected':''}>${esc(x)}</option>`).join('');
 $('categories').innerHTML=cats.map(x=>`<option value="${esc(x)}"></option>`).join('');
 $('nall').textContent=tasks.length;$('nprog').textContent=tasks.filter(t=>t.status==='Đang thực hiện').length;$('ndone').textContent=tasks.filter(t=>t.status==='Hoàn thành').length;$('nlate').textContent=tasks.filter(late).length;
 const rows=tasks.filter(t=>(!status||t.status===status)&&(!cat||t.category===cat)&&[t.title,t.description,t.assignee,t.watchers,t.contacts,t.category,...(t.subtasks||[]).map(x=>x.title)].join(' ').toLocaleLowerCase('vi').includes(s));
 rows.sort((a,b)=>sort==='updated'?b.updated-a.updated:sort==='created'?b.created-a.created:sort==='title'?a.title.localeCompare(b.title,'vi'):(a.deadline||'9999').localeCompare(b.deadline||'9999'));
 $('tasklist').innerHTML=rows.length?rows.map(t=>{let n=t.subtasks?.length||0,d=t.subtasks?.filter(z=>z.done).length||0;return `<tr><td><div role="button" tabindex="0" class="taskname" data-open="${esc(t.id)}">${esc(t.title)}</div><div class="subtxt">${n?`${d}/${n} task nhỏ · `:''}${esc(t.priority||'Bình thường')}${t.links?.length?' · '+t.links.length+' link':''}</div></td><td>${esc(t.category||'—')}</td><td>${esc(t.assignee||'—')}</td><td><span class="pill ${statusClass(t.status)}">${esc(t.status)}</span></td><td class="nowrap ${late(t)?'overdue':''}">${fmt(t.deadline)}${late(t)?' ⚠':''}</td><td><button class="btn light small" data-open="${esc(t.id)}">Chi tiết</button></td></tr>`}).join(''):'<tr><td colspan="6" class="empty">Không có công việc phù hợp.</td></tr>';
 renderCalendar();
}
function addSub(item={}){const row=document.createElement('div');row.className='subrow';row.dataset.id=item.id||uid();row.innerHTML=`<label><input type="checkbox" ${item.done?'checked':''}><input type="text" value="${esc(item.title||'')}" placeholder="Nội dung task nhỏ"></label><button type="button" class="btn danger small" aria-label="Xóa task nhỏ">×</button>`;row.querySelector('button').onclick=()=>row.remove();$('subtasks').append(row)}
function addLink(item={}){const row=document.createElement('div');row.className='linkrow';row.innerHTML=`<input class="fieldname control" placeholder="Tên file / tài liệu" value="${esc(item.name||'')}"><input class="fieldurl control" placeholder="https://..." value="${esc(item.url||'')}"><button type="button" class="btn danger small">×</button>`;row.querySelector('button').onclick=()=>row.remove();$('links').append(row)}
function openTask(id=null,chosenDate=null){editId=id;const t=tasks.find(x=>x.id===id);$('taskform').reset();fields.forEach(f=>$(f).value=t?.[f]||({status:'Chưa bắt đầu',priority:'Bình thường',start:chosenDate||''}[f]||''));$('subtasks').replaceChildren();$('links').replaceChildren();(t?.subtasks||[]).forEach(addSub);(t?.links||[]).forEach(addLink);$('modalTitle').textContent=t?'Chi tiết / Sửa công việc':'Thêm công việc';$('remove').hidden=!t;$('dialog').showModal()}
function closeTask(){$('dialog').close()}
async function persistTask(task){
 if(!state()){const ix=tasks.findIndex(t=>t.id===task.id);if(ix>=0)tasks[ix]=task;else tasks.push(task);localStorage.setItem(KEY,JSON.stringify(tasks));render();return}
 const existing=tasks.some(t=>t.id===task.id);
 const query=existing?db.from('tf_tasks').update({data:task,updated_by:session.user.id,updated_at:new Date().toISOString()}).eq('id',task.id).eq('workspace_id',workspaceId):db.from('tf_tasks').insert({id:task.id,workspace_id:workspaceId,data:task,updated_by:session.user.id,created_by:session.user.id});
 const {error}=await query;if(error)throw error;await reloadTasks();
}
async function deleteTask(id){
 if(!state()){tasks=tasks.filter(x=>x.id!==id);localStorage.setItem(KEY,JSON.stringify(tasks));render();return}
 const {error}=await db.from('tf_tasks').delete().eq('id',id).eq('workspace_id',workspaceId);if(error)throw error;await reloadTasks();
}
$('create').onclick=()=>openTask();$('close').onclick=closeTask;$('cancel').onclick=closeTask;$('addSub').onclick=()=>addSub();$('addLink').onclick=()=>addLink();
$('remove').onclick=async()=>{if(!editId||!confirm('Xóa công việc này cùng toàn bộ task nhỏ?'))return;try{await deleteTask(editId);closeTask()}catch(e){alert('Không xóa được: '+e.message)}};
$('taskform').onsubmit=async e=>{e.preventDefault();const now=Date.now(),old=tasks.find(t=>t.id===editId),t={id:old?.id||uid(),created:old?.created||now,updated:now};fields.forEach(f=>t[f]=$(f).value.trim());if(t.start&&t.deadline&&t.deadline<t.start){alert('Deadline phải bằng hoặc sau ngày bắt đầu');return}t.subtasks=[...$('subtasks').children].map(row=>({id:row.dataset.id,title:row.querySelector('input[type=text]').value.trim(),done:row.querySelector('input[type=checkbox]').checked})).filter(x=>x.title);t.links=[...$('links').children].map(row=>({name:row.querySelector('.fieldname').value.trim(),url:row.querySelector('.fieldurl').value.trim()})).filter(x=>x.url);if(t.links.some(x=>!cleanLink(x.url))){alert('Link phải bắt đầu bằng https:// hoặc http://');return}const submit=$('taskform').querySelector('[type=submit]');submit.disabled=true;try{await persistTask(t);closeTask()}catch(err){alert('Không lưu được: '+err.message)}finally{submit.disabled=false}};
$('tasklist').addEventListener('click',e=>{const id=e.target.closest('[data-open]')?.dataset.open;if(id)openTask(id)});
$('tasklist').addEventListener('keydown',e=>{if(e.key==='Enter'){const id=e.target.closest('[data-open]')?.dataset.open;if(id)openTask(id)}});
['search','filterStatus','filterCategory','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',render));
$('export').onclick=()=>{const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),workspace:state()?workspaceName:null,tasks},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='taskflow-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('import').onclick=()=>$('importFile').click();
$('importFile').onchange=async e=>{const f=e.target.files?.[0];if(!f)return;try{const data=JSON.parse(await f.text());if(!data||!Array.isArray(data.tasks)||data.tasks.some(t=>!t||typeof t.title!=='string'||!Array.isArray(t.subtasks)||!Array.isArray(t.links)))throw Error('File không đúng định dạng');if(!confirm(`Nhập ${data.tasks.length} task? ${state()?'Các task sẽ được thêm vào nhóm chung.':'Dữ liệu máy hiện tại sẽ được thay thế.'}`))return;
 if(state()){for(let t of data.tasks){const copy={...t,id:uid(),created:Date.now(),updated:Date.now()};await persistTask(copy)}}else{tasks=data.tasks.map(t=>({...t,id:t.id||uid()}));localStorage.setItem(KEY,JSON.stringify(tasks));render()}
 }catch(err){alert('Lỗi nhập JSON: '+err.message)}finally{e.target.value=''}};

// Calendar: deadline hiển thị nét liền, ngày bắt đầu hiển thị nét đứt.
const stamp=d=>dateISO(d);
const labelDate=d=>d.toLocaleDateString('vi-VN',{weekday:'long',day:'numeric',month:'long',year:'numeric'});
function dailyTasks(key){return tasks.filter(t=>t.start===key||t.deadline===key).sort((a,b)=>(a.deadline===key?0:1)-(b.deadline===key?0:1))}
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

// Supabase shared mode; no credentials are ever stored in repository besides public anon key.
async function initCloud(){
 if(!cloudConfigured)return;
 $('setupBanner').classList.add('hidden');$('cloudPanel').classList.remove('hidden');$('storageHint').textContent='Đang kết nối Supabase…';
 try{
  const {createClient}=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
  db=createClient(window.TASKFLOW_CONFIG.supabaseUrl,window.TASKFLOW_CONFIG.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data:{session:initialSession}}=await db.auth.getSession();session=initialSession;
  db.auth.onAuthStateChange((event,newSession)=>{if(session?.user?.id!==newSession?.user?.id){session=newSession;setTimeout(()=>showAuth(),0)}else session=newSession});
  await showAuth();
 }catch(e){$('authInfo').textContent='Không kết nối được Supabase: '+e.message;$('storageHint').textContent='Lỗi kết nối';}
}
async function showAuth(){
 $('loginBlock').classList.toggle('hidden',!!session);$('teamBlock').classList.toggle('hidden',!session);
 $('authInfo').textContent=session?`Đã đăng nhập: ${session.user.email}`:'Đăng nhập để xem dữ liệu nhóm làm việc chung.';
 if(session){await loadWorkspaces()}else{workspaceId=null;workspaceName='';tasks=[];render();syncUi()}
}
$('login').onclick=async()=>{const email=$('email').value.trim();if(!email)return alert('Vui lòng nhập email');$('login').disabled=true;try{const {error}=await db.auth.signInWithOtp({email,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;$('authInfo').textContent='Đã gửi liên kết đăng nhập. Mở email và bấm liên kết, rồi quay lại trang này.'}catch(e){alert(e.message)}finally{$('login').disabled=false}};
$('logout').onclick=async()=>{if(realtimeChannel){await db.removeChannel(realtimeChannel);realtimeChannel=null}await db.auth.signOut()};
async function loadWorkspaces(preferred=null){
 const {data,error}=await db.rpc('tf_my_workspaces');if(error){notify('Lỗi danh sách nhóm: '+error.message);return}
 const chosen=preferred||workspaceId||localStorage.getItem('taskflow_workspace');
 $('workspaceSelect').innerHTML='<option value="">Chọn nhóm...</option>'+(data||[]).map(w=>`<option value="${esc(w.id)}">${esc(w.name)} (${w.member_count}/5)</option>`).join('');
 const selected=(data||[]).find(w=>w.id===chosen)||(data||[])[0];
 if(selected){$('workspaceSelect').value=selected.id;await selectWorkspace(selected.id,selected.name)}else{workspaceId=null;workspaceName='';tasks=[];syncUi();render()}
}
async function selectWorkspace(id,name){if(realtimeChannel){await db.removeChannel(realtimeChannel);realtimeChannel=null}workspaceId=id;workspaceName=name;localStorage.setItem('taskflow_workspace',id);await reloadTasks();realtimeChannel=db.channel('taskflow-'+id).on('postgres_changes',{event:'*',schema:'public',table:'tf_tasks',filter:`workspace_id=eq.${id}`},()=>reloadTasks()).subscribe();syncUi()}
async function reloadTasks(){if(!workspaceId||!session)return;const active=workspaceId;const {data,error}=await db.from('tf_tasks').select('id,data,created_at,updated_at').eq('workspace_id',active).order('updated_at',{ascending:false});if(error){notify('Lỗi tải task: '+error.message);return}if(active!==workspaceId)return;tasks=(data||[]).map(row=>({...row.data,id:row.id}));loadedCloud=true;render()}
function syncUi(){const on=state();$('syncBadge').textContent=on?'● Nhóm đang đồng bộ':'Chưa chọn nhóm';$('storageHint').textContent=on?`Dữ liệu chung · ${workspaceName}`:'Đăng nhập và chọn nhóm để quản lý task chung';$('create').disabled=cloudConfigured&&!on;$('copyInvite').classList.toggle('hidden',!on||!inviteCache[workspaceId])}
$('workspaceSelect').onchange=async()=>{const opt=$('workspaceSelect').selectedOptions[0];if(opt?.value)await selectWorkspace(opt.value,opt.textContent.replace(/ \(\d+\/5\)$/,''))};
$('createTeam').onclick=async()=>{const name=$('teamName').value.trim();if(!name)return alert('Nhập tên nhóm');const code=Array.from(crypto.getRandomValues(new Uint8Array(24)),b=>b.toString(16).padStart(2,'0')).join('');$('createTeam').disabled=true;try{const {data:id,error}=await db.rpc('tf_create_workspace',{p_name:name,p_code:code});if(error)throw error;inviteCache[id]=id+':'+code;await loadWorkspaces(id);notify('Nhóm đã tạo! BẤM “Sao chép mã mời” và lưu lại. Mã chỉ hiển thị trong phiên làm việc này; làm mất mã sẽ không thể mời thêm thành viên.') }catch(e){notify('Không tạo được nhóm: '+e.message)}finally{$('createTeam').disabled=false}};
$('joinTeam').onclick=async()=>{const input=$('invite').value.trim();const pos=input.indexOf(':');const id=input.slice(0,pos),code=input.slice(pos+1);if(pos<0||!(/^[0-9a-f-]{36}$/i.test(id))||!code){notify('Mã mời không đúng định dạng. Cần dán đủ ID:mã.');return}try{const {error}=await db.rpc('tf_join_workspace',{p_workspace:id,p_code:code});if(error)throw error;await loadWorkspaces(id);notify('Đã tham gia nhóm thành công.')}catch(e){notify('Không thể tham gia: '+e.message)}};
$('copyInvite').onclick=async()=>{const code=inviteCache[workspaceId];if(!code)return;try{await navigator.clipboard.writeText(code);notify('Đã sao chép mã mời. Gửi mã qua kênh riêng cho người cần tham gia nhóm.')}catch{prompt('Sao chép mã mời:',code)}};
render();initCloud();
