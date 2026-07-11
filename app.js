/* ЗАКВАСКУЛЯТОР — логика приложения */
'use strict';
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];
const fmtH = h => {                       // часы (дроб.) → «6 ч 30 м»
  if (!isFinite(h)) return '—';
  const m = Math.round(h*60);
  const H = Math.floor(m/60), M = m%60;
  return (H? H+' ч ' : '') + (M? M+' м' : (H?'':'0 м'));
};
const fmtTime = d => `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
const startOfLocalDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const dayLabel = (d, base=new Date()) => {
  const diff = Math.round((startOfLocalDay(d) - startOfLocalDay(base)) / 86400000);
  if (diff === -1) return 'вчера';
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}`;
};
const fmtDayTime = (d, base=new Date()) => `${dayLabel(d, base)} в ${fmtTime(d)}`;
const parseTimeValue = v => {
  const [hh, mm] = String(v || '').split(':').map(Number);
  if (!Number.isInteger(hh) || !Number.isInteger(mm) || hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return { hh, mm };
};
const parseNumberValue = v => {
  const s = String(v ?? '').trim();
  if (!s) return NaN;
  return Number(s.replace(',', '.'));
};
const clamp = (v,a,b)=>Math.min(b,Math.max(a,v));
const LS = { get:(k,d)=>{try{return JSON.parse(localStorage.getItem('zk_'+k))??d}catch{return d}},
             set:(k,v)=>localStorage.setItem('zk_'+k, JSON.stringify(v)) };

/* ============ Модель прогноза (Q10) ============ */
// activity: множитель влажности (норма=1, сухо=0.9, влажно=1.1)
function timeToPeak(p, temp, activity=1){
  let effT = temp;
  if (effT > MODEL.tInhibit) effT = MODEL.tInhibit;          // плато: жара не ускоряет
  const t = p.tBase * Math.pow(2, (p.tRef - effT)/MODEL.dtDouble) / activity;
  return t;
}
function tempRegime(temp){
  if (temp < MODEL.tHibernate) return {key:'hib',  txt:'Гибернация — брожение почти остановлено', c:'var(--blue)'};
  if (temp > MODEL.tDeath)     return {key:'death',txt:'Слишком жарко — дрожжи угнетаются и гибнут', c:'var(--red)'};
  if (temp > MODEL.tInhibit)   return {key:'hot',  txt:'Выше оптимума — рост не ускоряется, риск перегрева', c:'var(--red)'};
  if (temp >= MODEL.tOptLow && temp <= MODEL.tOptHigh) return {key:'opt', txt:'Оптимум активности', c:'var(--green)'};
  return {key:'ok', txt:'Рабочий диапазон', c:'var(--amber)'};
}

/* ============ Навигация ============ */
function go(tab){
  $$('.screen').forEach(s=>s.classList.toggle('active', s.id===tab));
  $$('.tab').forEach(t=>t.classList.toggle('on', t.dataset.tab===tab));
  window.scrollTo({top:0});
}
$$('.tab').forEach(t=>t.onclick=()=>go(t.dataset.tab));
$$('[data-close]').forEach(b=>b.onclick=()=>$$('.sheet').forEach(s=>s.classList.remove('open')));

/* ============ Заполнение селектов ============ */
function fillProfileSelect(sel){
  const groups = {};
  PROFILES.forEach(p=>(groups[p.group]=groups[p.group]||[]).push(p));
  sel.innerHTML='';
  Object.entries(groups).forEach(([g,arr])=>{
    const og=document.createElement('optgroup'); og.label=g;
    arr.forEach(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;og.appendChild(o);});
    sel.appendChild(og);
  });
}
const profById = id => PROFILES.find(p=>p.id===id);

/* ============ КАЛЬКУЛЯТОР ============ */
let cShyd = 100;
let lastCalcText = '';
async function copyText(text){
  if(!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta=document.createElement('textarea');
    ta.value=text;
    ta.setAttribute('readonly','');
    ta.style.position='fixed';
    ta.style.left='-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok=false;
    try { ok=document.execCommand('copy'); } catch { ok=false; }
    ta.remove();
    return ok;
  }
}
function showCalcWarning(text){
  lastCalcText = '';
  $('#r-flour').textContent = '—';
  $('#r-water').textContent = '—';
  $('#r-starter').textContent = '—';
  $('#r-salt').textContent = '—';
  $('#r-build').classList.add('hidden');
  $('#r-add').classList.add('hidden');
  $('#c-copy').classList.add('hidden');
  $('#c-copy-status').classList.add('hidden');
  $('#c-alert').textContent = text;
  $('#c-alert').classList.remove('hidden');
  $('#c-result').classList.remove('hidden');
}
function showCalcResult(){
  $('#c-alert').classList.add('hidden');
  $('#r-build').classList.remove('hidden');
  $('#r-add').classList.remove('hidden');
  $('#c-copy').classList.remove('hidden');
  $('#c-copy-status').classList.add('hidden');
  $('#c-result').classList.remove('hidden');
}
function showWhenResult(html, kind=''){
  const el=$('#c-when-res');
  el.className='callout';
  if(kind) el.classList.add(kind);
  el.innerHTML=html;
  el.classList.remove('hidden');
}
$('#c-shyd').onclick = e => { const b=e.target.closest('button'); if(!b)return;
  $$('#c-shyd button').forEach(x=>x.classList.toggle('on',x===b)); cShyd=+b.dataset.v; };
$$('[data-step]').forEach(b=>b.onclick=()=>{ const inp=$('#c-dough');
  inp.value = Math.max(50, (+inp.value||0)+ (+b.dataset.d)); });

$('#c-go').onclick = ()=>{
  const W=parseNumberValue($('#c-dough').value);
  const H=parseNumberValue($('#c-hyd').value);
  const S=parseNumberValue($('#c-starter').value);
  const saltPct=parseNumberValue($('#c-salt').value);
  const SH=cShyd;
  if(!(W>0&&H>0&&S>=0&&saltPct>=0&&SH>0)){
    showCalcWarning('Введите вес теста больше 0 г, гидратацию теста больше 0%, долю закваски от 0% и соль от 0%.');
    return;
  }
  if(saltPct>5){
    showCalcWarning('Проверьте соль: для хлебного теста обычно используют около 1,8–2,2% от муки. Введите значение от 0 до 5%.');
    return;
  }
  const F = W/(1+H/100+saltPct/100);  // мука всего
  const Wt = F*H/100;                 // вода всего
  const Salt = F*saltPct/100;         // соль
  const St = S/100 * F;              // зрелой закваски нужно
  const Sf = St/(1+SH/100);          // мука в закваске
  const Sw = St - Sf;                // вода в закваске
  const Fa = F - Sf, Wa = Wt - Sw;   // добавить в тесто
  const maxByFlour = F * (1 + SH/100);
  const maxByWater = Wt * (1 + SH/100) / (SH/100);
  const maxStarter = Math.min(maxByFlour, maxByWater);
  if(St - maxStarter > 0.5 || Fa < -0.5 || Wa < -0.5){
    const maxPct = maxStarter / F * 100;
    const reason = Wa < -0.5 ? 'в закваске уже больше воды, чем нужно тесту' : 'в закваске уже больше муки, чем нужно тесту';
    showCalcWarning(`Параметры невозможны: ${reason}. При ${H}% теста и ${SH}% закваске максимум зрелой закваски ≈ ${Math.floor(maxPct)}% муки (${Math.floor(maxStarter)} г). Уменьшите долю закваски или измените гидратацию.`);
    return;
  }
  $('#r-flour').textContent   = Math.round(F);
  $('#r-water').textContent   = Math.round(Wt);
  $('#r-starter').textContent = Math.round(St);
  $('#r-salt').textContent    = Math.round(Salt);
  // схема выращивания закваски
  const ratio = SH>=150 ? [1,2,3] : [1,2,2];
  const parts = ratio[0]+ratio[1]+ratio[2];
  const need = St*1.15;              // +15% запас
  const seed=need*ratio[0]/parts, fl=need*ratio[1]/parts, wa=need*ratio[2]/parts;
  const rounded = {
    flour: Math.round(F),
    water: Math.round(Wt),
    starter: Math.round(St),
    salt: Math.round(Salt),
    seed: Math.round(seed),
    feedFlour: Math.round(fl),
    feedWater: Math.round(wa),
    need: Math.round(need),
    addFlour: Math.round(Math.max(0, Fa)),
    addWater: Math.round(Math.max(0, Wa)),
  };
  $('#r-build').innerHTML = `<b>Вырастить закваску</b> (${ratio.join(':')}, +15% запас): `
    + `${rounded.seed} г стартера + ${rounded.feedFlour} г муки + ${rounded.feedWater} г воды → ≈${rounded.need} г.`;
  $('#r-add').innerHTML = `<b>В тесто добавить:</b> мука ${rounded.addFlour} г · вода ${rounded.addWater} г · соль ${rounded.salt} г · зрелая закваска ${rounded.starter} г.`;
  lastCalcText = [
    'Закваскулятор: расчёт теста',
    '',
    `Параметры: тесто ${W} г, гидратация ${H}%, зрелая закваска ${S}% муки, соль ${saltPct}%, гидратация закваски ${SH}%.`,
    `Итог: мука всего ${rounded.flour} г, вода всего ${rounded.water} г, зрелая закваска ${rounded.starter} г, соль ${rounded.salt} г.`,
    `Вырастить закваску (${ratio.join(':')}, +15% запас): ${rounded.seed} г стартера + ${rounded.feedFlour} г муки + ${rounded.feedWater} г воды -> около ${rounded.need} г.`,
    `В тесто добавить: мука ${rounded.addFlour} г, вода ${rounded.addWater} г, соль ${rounded.salt} г, зрелая закваска ${rounded.starter} г.`,
  ].join('\n');
  showCalcResult();
};

$('#c-copy').onclick = async ()=>{
  const status=$('#c-copy-status');
  const ok=await copyText(lastCalcText);
  status.textContent=ok?'Расчёт скопирован.':'Не удалось скопировать автоматически. Выделите результат вручную.';
  status.classList.toggle('warn', !ok);
  status.classList.toggle('ok', ok);
  status.classList.remove('hidden');
};

$('#c-when').onclick = ()=>{
  const p=profById($('#c-prof').value); const temp=parseNumberValue($('#c-temp').value);
  const parsed=parseTimeValue($('#c-bake').value);
  if(!p){
    showWhenResult('Выберите профиль закваски.', 'warn');
    return;
  }
  if(!isFinite(temp)){
    showWhenResult('Введите температуру ведения в °C.', 'warn');
    return;
  }
  if(!parsed){
    showWhenResult('Укажите корректное время замеса.', 'warn');
    return;
  }
  const reg=tempRegime(temp);
  if(reg.key==='hib'){
    showWhenResult(`При ${temp} °C закваска находится в режиме хранения: брожение почти остановлено. Для расчёта кормления под замес поднимите температуру до ${p.tMin}–${p.tMax} °C.`, 'warn');
    return;
  }
  if(reg.key==='death'){
    showWhenResult(`При ${temp} °C дрожжи угнетаются и могут погибнуть. Не планируйте кормление под замес в таком режиме: охладите закваску до ${p.tMin}–${p.tMax} °C.`, 'warn');
    return;
  }
  const t=timeToPeak(p,temp);
  const now=new Date();
  const bake=new Date(now); bake.setHours(parsed.hh,parsed.mm,0,0);
  if(bake<=now) bake.setDate(bake.getDate()+1);
  const feed=new Date(bake.getTime()-t*3600*1000);
  const html = `Поставьте кормление <b>${fmtDayTime(feed, now)}</b> `
    + `(за ${fmtH(t)} до замеса). Профиль «${p.name}» при ${temp} °C.`
    + (reg.key==='hot' ? `<br><b>Внимание:</b> ${reg.txt}` : '');
  showWhenResult(html, reg.key==='hot'?'warn':'');
};

/* ============ ПРОГНОЗ ============ */
let fMode='forward', fHum=1;
$('#f-mode').onclick=e=>{const b=e.target.closest('button');if(!b)return;
  fMode=b.dataset.v; $$('#f-mode button').forEach(x=>x.classList.toggle('on',x===b));
  $('#f-target-wrap').style.display = fMode==='reverse'?'block':'none';};
$('#f-hum').onclick=e=>{const b=e.target.closest('button');if(!b)return;
  fHum=+b.dataset.v; $$('#f-hum button').forEach(x=>x.classList.toggle('on',x===b));};

let lastForecast=null;
function setForecastTrack(enabled){
  const btn=$('#f-track');
  btn.disabled=!enabled;
  btn.textContent=enabled?'▶ Поставить на трекер':'Трекер недоступен';
}
function showForecastWarning(text){
  $('#f-warn').textContent=text;
  $('#f-warn').classList.remove('hidden');
}
$('#f-go').onclick=()=>{
  const p=profById($('#f-prof').value), temp=parseNumberValue($('#f-temp').value);
  lastForecast=null;
  setForecastTrack(false);
  $('#f-result').classList.remove('hidden');
  if(!p || !isFinite(temp)){
    const ring=$('#f-ring'); ring.style.setProperty('--c','var(--red)'); ring.style.setProperty('--p','100%');
    ring.classList.remove('pulse');
    $('#f-phase').querySelector('.dot').style.setProperty('--c','var(--red)');
    $('#f-big').textContent='—'; $('#f-lbl').textContent='проверьте ввод';
    $('#f-phase-t').textContent='Нужна температура';
    $('#f-explain').textContent='Введите температуру закваски в °C, чтобы посчитать прогноз.';
    showForecastWarning('Температура должна быть числом.');
    return;
  }
  const reg=tempRegime(temp);
  const t=timeToPeak(p,temp,fHum);
  const ring=$('#f-ring'); ring.style.setProperty('--c',reg.c); ring.style.setProperty('--p','100%');
  ring.classList.toggle('pulse', reg.key==='hot'||reg.key==='death');
  $('#f-phase').querySelector('.dot').style.setProperty('--c',reg.c);

  if(reg.key==='hib'){
    $('#f-big').textContent='—'; $('#f-lbl').textContent='холодно';
    $('#f-phase-t').textContent='Гибернация';
    $('#f-explain').innerHTML=`При ${temp} °C брожение почти остановлено. Это режим хранения, не роста. Поднимите температуру до ${p.tMin}–${p.tMax} °C.`;
  } else if(reg.key==='death'){
    $('#f-big').textContent='—'; $('#f-lbl').textContent='слишком жарко';
    $('#f-phase-t').textContent='Опасный перегрев';
    $('#f-explain').innerHTML=`При ${temp} °C дрожжи угнетаются и могут погибнуть. Это не режим выращивания закваски: охладите до ${p.tMin}–${p.tMax} °C и покормите заново при необходимости.`;
  } else {
    $('#f-big').textContent='≈ '+fmtH(t); $('#f-lbl').textContent='до пика';
    $('#f-phase-t').textContent=reg.key==='opt'?'Оптимум · активный рост':(reg.key==='hot'?'Перегрев':'Активный рост');
    const peak=new Date(Date.now()+t*3600*1000);
    $('#f-explain').innerHTML=`Профиль «<b>${p.name}</b>» при <b>${temp} °C</b>: пик примерно через <b>${fmtH(t)}</b> `
      + `(к ${fmtTime(peak)}). `
      + `Опора профиля: ${p.tBase} ч при ${p.tRef} °C.`;
  }
  $('#f-warn').classList.toggle('hidden', reg.key==='ok'||reg.key==='opt');
  if(!(reg.key==='ok'||reg.key==='opt')) showForecastWarning(reg.txt);

  if(reg.key==='hib'||reg.key==='death') return;
  if(fMode==='reverse'){
    const parsed=parseTimeValue($('#f-target').value);
    if(!parsed){
      showForecastWarning('Укажите корректное время, к которому нужна готовая закваска.');
      return;
    }
    const now=new Date();
    const tgt=new Date(now); tgt.setHours(parsed.hh,parsed.mm,0,0); if(tgt<=now)tgt.setDate(tgt.getDate()+1);
    const start=new Date(tgt.getTime()-t*3600*1000);
    $('#f-explain').innerHTML += `<br><b>Чтобы успеть к ${$('#f-target').value}:</b> начните брожение `
      + `${fmtDayTime(start, now)}.`;
  }
  lastForecast={profId:p.id, temp, t, hum:fHum};
  setForecastTrack(true);
};
$('#f-track').onclick=()=>{ if(!lastForecast)return;
  startTracker(lastForecast.profId, lastForecast.temp, lastForecast.t);
  go('home');
};

/* ============ ТРЕКЕР БРОЖЕНИЯ (главная) ============ */
function startTracker(profId,temp,t){
  if(!profById(profId) || !isFinite(temp) || !isFinite(t) || t<=0) return;
  LS.set('batch',{profId,temp,t,start:Date.now()}); renderTracker();
}
function trackerPhase(frac){
  if(frac<0.12) return {t:'Старт / разогрев', c:'var(--blue)', pulse:false};
  if(frac<0.8)  return {t:'Активный рост',    c:'var(--amber)',pulse:false};
  if(frac<1)    return {t:'Близко к пику',    c:'var(--amber)',pulse:true};
  if(frac<1.25) return {t:'ПИК — пора печь!', c:'var(--green)',pulse:true};
  return {t:'Прошла пик — покормить', c:'var(--red)', pulse:true};
}
function renderTracker(){
  const b=LS.get('batch',null), el=$('#tracker');
  if(!b){ el.innerHTML = `<div class="card hero">
      <div class="phase-chip"><span class="dot"></span>Нет активной закваски</div>
      <div class="ring" style="--p:0%"><div><div class="big">🫙</div><div class="lbl">запустите брожение</div></div></div>
      <button class="btn" id="t-start">▶ Запустить закваску</button>
      <div class="hint" style="text-align:center;margin-top:8px">Выберите профиль и температуру — посчитаю время до пика и буду показывать фазу.</div>
    </div>`;
    $('#t-start').onclick=()=>go('forecast'); return;
  }
  const p=profById(b.profId);
  const start=Number(b.start), duration=Number(b.t), temp=Number(b.temp);
  if(!p || !isFinite(start) || !isFinite(duration) || duration<=0 || !isFinite(temp)){
    LS.set('batch',null);
    renderTracker();
    return;
  }
  const elapsed=(Date.now()-start)/3600000;
  const progress=elapsed/duration;
  const frac=clamp(progress,0,1.5);
  const ph=trackerPhase(progress);
  const left=duration-elapsed;
  const peak=new Date(start+duration*3600000);
  el.innerHTML=`<div class="card hero">
    <div class="phase-chip"><span class="dot" style="--c:${ph.c}"></span>${ph.t}</div>
    <div class="ring${ph.pulse?' pulse':''}" style="--c:${ph.c};--p:${(frac/1.5*100).toFixed(0)}%">
      <div><div class="big">${left>0?fmtH(left):'ПИК'}</div><div class="lbl">${left>0?'до пика':'готова'}</div></div>
    </div>
    <div style="font-size:13px;color:var(--ink-soft);margin-bottom:12px">
      «${p.name}» · ${temp} °C · пик к ${fmtTime(peak)}
    </div>
    <div class="row" style="gap:8px">
      <button class="btn" id="t-done" style="flex:1">✓ Готово</button>
      <button class="btn ghost" id="t-stop" style="flex:1">Снять</button>
    </div>
  </div>`;
  $('#t-done').onclick=()=>{ addJournal(`Закваска «${p.name}» доведена до пика (${temp} °C)`); LS.set('batch',null); renderTracker(); };
  $('#t-stop').onclick=()=>{ LS.set('batch',null); renderTracker(); };
}

/* ============ ЖУРНАЛ ============ */
function addJournal(text){
  const j=LS.get('journal',[]); j.unshift({text, ts:Date.now()}); LS.set('journal',j.slice(0,50)); renderJournal();
}
function renderJournal(){
  const j=LS.get('journal',[]), el=$('#journal-list');
  if(!j.length){ el.innerHTML='<div class="empty">Пока пусто. Завершённые брожения и заметки появятся здесь.</div>'; return; }
  el.innerHTML=j.map((e,i)=>{ const d=new Date(e.ts);
    const ds=`${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
    return `<div class="jrow"><div class="jd">${ds}</div><div class="jt">${e.text}</div><button class="jx" data-j="${i}">×</button></div>`;
  }).join('');
  $$('[data-j]').forEach(b=>b.onclick=()=>{const j=LS.get('journal',[]);j.splice(+b.dataset.j,1);LS.set('journal',j);renderJournal();});
}

/* ============ ПРОФИЛИ ============ */
const groupIcon = g => g.includes('Ржаные')?'🌾':g.includes('Древние')?'🌱':'🌽';
function renderProfiles(){
  const groups={}; PROFILES.forEach(p=>(groups[p.group]=groups[p.group]||[]).push(p));
  $('#prof-list').innerHTML = Object.entries(groups).map(([g,arr])=>
    `<div class="section-label">${g}</div>`+arr.map(p=>
      `<div class="prof" data-prof="${p.id}"><div class="pic">${groupIcon(g)}</div>
        <div><div class="pname">${p.name}</div><div class="pmeta">${p.tMin}–${p.tMax} °C · ${p.hMin===p.hMax?p.hMin:p.hMin+'–'+p.hMax}% · ${p.timeMin}–${p.timeMax} ч</div></div>
        <div class="pgo">›</div></div>`).join('')
  ).join('');
  $$('[data-prof]').forEach(el=>el.onclick=()=>openProfile(el.dataset.prof));
}
function openProfile(id){
  const p=profById(id);
  $('#sp-title').textContent=p.name;
  $('#sp-body').innerHTML=`
    <div class="card">
      <div class="kv"><span class="k">Температура ведения</span><span class="v">${p.tMin}–${p.tMax} °C</span></div>
      <div class="kv"><span class="k">Гидратация</span><span class="v">${p.hMin===p.hMax?p.hMin:p.hMin+'–'+p.hMax} %</span></div>
      <div class="kv"><span class="k">Время до пика (старт.)</span><span class="v">${p.timeMin}–${p.timeMax} ч</span></div>
      <div class="kv"><span class="k">Кормление</span><span class="v">${p.feed}</span></div>
      <div class="kv"><span class="k">Опора модели</span><span class="v">${p.tBase} ч при ${p.tRef} °C</span></div>
    </div>
    ${p.note?`<div class="callout">${p.note}</div>`:''}
    <div class="card">
      <h3>Прогноз при вашей температуре</h3>
      <div class="field"><label>Температура, °C</label><input id="sp-temp" class="input" type="number" value="${p.tRef}"></div>
      <button class="btn ghost" id="sp-calc">Посчитать время до пика</button>
      <div class="callout ok hidden" id="sp-res"></div>
    </div>
    <div class="disclaimer">Стартовые значения для калибровки на прототипе «Умной банки». Финал уточняется на реальной муке и закваске.</div>`;
  $('#sheet-prof').classList.add('open');
  $('#sp-calc').onclick=()=>{
    const temp=parseNumberValue($('#sp-temp').value);
    const res=$('#sp-res');
    res.className='callout';
    if(!isFinite(temp)){
      res.classList.add('warn');
      res.textContent='Введите температуру в °C.';
      res.classList.remove('hidden');
      return;
    }
    const reg=tempRegime(temp);
    if(reg.key==='hib'){
      res.classList.add('warn');
      res.textContent=`При ${temp} °C это режим хранения: брожение почти остановлено. Для прогноза роста поднимите температуру до ${p.tMin}–${p.tMax} °C.`;
      res.classList.remove('hidden');
      return;
    }
    if(reg.key==='death'){
      res.classList.add('warn');
      res.textContent=`При ${temp} °C дрожжи угнетаются и могут погибнуть. Охладите закваску до ${p.tMin}–${p.tMax} °C.`;
      res.classList.remove('hidden');
      return;
    }
    const t=timeToPeak(p, temp);
    res.classList.add(reg.key==='hot'?'warn':'ok');
    res.innerHTML=`Пик примерно через <b>${fmtH(t)}</b> при ${temp} °C.`
      + (reg.key==='hot'?`<br><b>Внимание:</b> ${reg.txt}`:'');
    res.classList.remove('hidden');
  };
}

/* ============ ОБУЧЕНИЕ ============ */
$$('[data-learn]').forEach(el=>el.onclick=()=>openLearn(el.dataset.learn));
function openLearn(key){
  const c=CULTIVATION[key];
  $('#sl-title').textContent=c.title;
  const steps=c.steps.map((s,i)=>`
    <div class="step"><div class="num"><span>${i+1}</span>${i<c.steps.length-1?'<div class="line"></div>':''}</div>
      <div class="body"><div class="day">${s.day}</div><h4>${s.title}</h4><p>${s.text}</p></div></div>`).join('');
  const params=c.params.map(([k,v])=>`<div class="kv"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('');
  $('#sl-body').innerHTML=`
    <div class="note-band ${c.authoritative?'auth':'gen'}">${c.authoritative?'✓ Авторитетный протокол «Едлин Хлеб»':'⚠ Ориентировочный протокол — авторитетных материалов по этой закваске пока нет'}</div>
    <p style="font-size:13px;color:var(--ink-soft)">${c.subtitle}</p>
    <div class="card">${params}</div>
    <div class="card">${steps}</div>
    <div class="callout warn">${c.fail}</div>`;
  $('#sheet-learn').classList.add('open');
}
function renderLearn(){
  $('#maturity').innerHTML=MATURITY.map(m=>`
    <div class="mat${m.good?' peak':''}"><div class="mn">${m.n}</div>
      <div><div class="ms">${m.see}</div><div class="mv">${m.verdict}</div></div></div>`).join('');
  $('#troubleshoot').innerHTML=TROUBLESHOOT.map(t=>`
    <div class="ts-item${t.danger?' danger':''}"><div class="s">${t.sign}</div><div class="d">${t.diag}</div><div class="f">→ ${t.fix}</div></div>`).join('');
  $('#storage').innerHTML=`
    <h3>В холодильнике</h3>${STORAGE_GUIDE.fridge.map(x=>`<p style="font-size:13px;color:var(--ink-soft)">• ${x}</p>`).join('')}
    <h3 style="margin-top:12px">При комнатной температуре</h3>${STORAGE_GUIDE.room.map(x=>`<p style="font-size:13px;color:var(--ink-soft)">• ${x}</p>`).join('')}
    <h3 style="margin-top:12px">Длительное хранение</h3>${STORAGE_GUIDE.preserve.map(x=>`<p style="font-size:13px;color:var(--ink-soft)">• ${x}</p>`).join('')}`;
}

/* ============ Старт ============ */
fillProfileSelect($('#c-prof'));
fillProfileSelect($('#f-prof'));
renderProfiles();
renderLearn();
renderJournal();
renderTracker();
setInterval(()=>{ if(LS.get('batch',null)) renderTracker(); }, 60000); // обновлять фазу раз в минуту
