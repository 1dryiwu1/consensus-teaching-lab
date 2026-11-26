import { NativeSession, validateConfig } from './native-core.js?v=20261126.2';
const api=window.SimewuTeaching;
const $=id=>document.getElementById(id);
let session=null,backup=null,timer=null,busy=false,pair=null,dirty=false,failed=false;
const hints={majority:'Defense: cap the attacker share at 30% and wait for at least one confirmation. Confirmations alone cannot prevent an ongoing majority attack.',finney:'Defense: reject zero-confirmation delivery and wait for at least one payment confirmation.',race:'Defense: wait for at least one confirmation and suspend delivery on a conflict alert.',double:'Defense: validate chain state and the funding source before recording receipts. Native nodes always reject double spending.'};
function roles(){const nodes=Object.values(api.network().peers);for(const [id,fallback] of [['nativeAttacker',0],['nativeMerchant',1]]){const saved=$(id).value;$(id).replaceChildren(...nodes.map(n=>{const o=document.createElement('option');o.value=n.ID;o.textContent=n.name;return o;}));if(nodes.some(n=>n.ID===saved))$(id).value=saved;else if(nodes[fallback])$(id).value=nodes[fallback].ID;}}
function config(){return {mode:$('nativeMode').value,attacker:$('nativeAttacker').value,merchant:$('nativeMerchant').value,q:Number($('nativePower').value),confirmations:Number($('nativeConfirmations').value),seed:Number($('nativeSeed').value),fee:Number($('nativeFee').value),delay:Number($('nativeDelay').value),defended:$('nativeDefense').checked,validation:$('nativeValidation').checked};}
function text(tag,value){const n=document.createElement(tag);n.textContent=value;return n;}
function pause(){clearInterval(timer);timer=null;$('nativePlay').textContent='Run';api.running(false);}
function notice(message){$('nativeSummary').textContent=message;}
function initialize(c=config()){
  pause();api.stop();
  if(session&&session.net!==api.network()){session.active=false;session=null;backup=null;api.setSession(null);}
  // Validate roles and parameters before destroying the current chain.
  validateConfig(api,c);
  if(!backup)backup=api.snapshot();
  if(session)session.active=false;
  api.setSession(null);api.restore(backup);api.clear();
  if($('nativeMesh').checked)api.mesh();
  session=new NativeSession(api,c);api.setSession(session);api.samplerEnabled(false);api.select(session.merchant.ID);api.refresh(true);
  dirty=false;failed=false;pair=null;$('nativeComparison').hidden=true;render();return session;
}
function render(){
  const exists=session?.active;
  $('nativeStep').disabled=!exists||session.done||dirty||failed;
  $('nativePlay').disabled=!exists||session.done||dirty||failed;
  $('nativeExport').disabled=!exists||dirty||failed;$('nativeExit').disabled=!exists;
  $('nativeState').textContent=!exists?'Not loaded':dirty?'Reload required':failed?'Reload after error':(session.done?'Completed':'Step '+session.time)+' · '+(session.config.defended?'Defense':'Baseline')+(session.config.mode==='double'&&session.config.validation&&!session.config.defended?' · Receipt checks on':'');
  if(!exists||dirty){
    const row=text('tr','');const cell=text('td',dirty?'Parameters changed. Load / Reset to start this configuration.':'Not started');cell.colSpan=6;row.append(cell);$('nativeMetrics').replaceChildren(row);$('nativeLogs').replaceChildren();$('nativeCompareRows').replaceChildren();$('nativeComparison').hidden=true;
    if(!exists)$('nativeSummary').textContent='Select node roles and load an experiment.';
    return;
  }
  notice(session.result);
  const row=document.createElement('tr');[session.time,session.confirmations,session.balance+' coins',session.delivered?'Delivered':'Withheld',session.reorgs,session.receipts].forEach(v=>row.append(text('td',v)));$('nativeMetrics').replaceChildren(row);
  $('nativeLogs').replaceChildren(...session.logs.slice().reverse().map(e=>{const p=document.createElement('div');p.className='native-log';p.append(text('b',`[${e.time}] ${e.title} `),document.createTextNode(e.detail));return p;}));
}
function step(){if(busy||!session||session.done||dirty||failed)return;busy=true;try{session.step();api.refresh();render();if(session.done)pause();}catch(error){pause();failed=true;render();notice(error.message+' Reload the teaching session.');}finally{busy=false;}}
function toggle(){if(timer){pause();return;}if(!session||session.done||dirty||failed)return;timer=setInterval(step,600);$('nativePlay').textContent='Pause';api.running(true);}
$('nativeLoad').onclick=()=>{try{initialize();}catch(error){notice(error.message);}};
$('nativeStep').onclick=step;$('nativePlay').onclick=toggle;
$('nativeCompare').onclick=()=>{
  try{
    const c=validateConfig(api,config());let out=[];
    // A comparison always uses checks off vs. checks on, regardless of the previous manual receipt toggle.
    for(const defended of [false,true]){const run=initialize({...c,defended,validation:defended});while(!run.done)run.step();out.push(run.report());}
    $('nativeDefense').checked=session.config.defended;$('nativeValidation').checked=session.config.validation;
    pair=out;api.refresh();render();$('nativeCompareRows').replaceChildren(...out.map((r,i)=>{const row=document.createElement('tr');[i?'Defense':'Baseline',r.merchantBalance+' coins',r.delivered?'Delivered':'Withheld',r.nodes.reduce((s,n)=>s+n.blocksFound,0),r.result].forEach(v=>row.append(text('td',v)));return row;}));$('nativeComparison').hidden=false;
  }catch(error){pause();failed=true;render();notice(error.message+' Reload the teaching session.');}
};
$('nativeExit').onclick=()=>{pause();api.stop();if(session)session.active=false;api.setSession(null);if(session?.net===api.network()){api.restore(backup);api.clear();}session=null;backup=null;pair=null;dirty=false;failed=false;api.samplerEnabled(true);api.refresh(true);render();notice('Teaching mode exited. Previous node settings were restored and teaching blocks cleared. Native mining is available.');};
$('nativeExport').onclick=()=>{if(!session)return;const blob=new Blob([JSON.stringify({experiment:session.report(),comparison:pair},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const link=text('a','');link.href=url;link.download=`Simewu-${session.config.mode}-${session.config.seed}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('nativeMode').onchange=()=>{$('nativeConfirmations').value=['finney','race'].includes($('nativeMode').value)?'0':'1';$('nativeDefenseHelp').textContent=hints[$('nativeMode').value];};
for(const control of document.querySelectorAll('#teachingPanel input,#teachingPanel select'))control.addEventListener('change',()=>{if(!session?.active)return;pause();dirty=true;pair=null;render();notice('Parameters changed. Click Load / Reset to apply them, or Compare Defenses to run both groups.');});
$('nativeRefreshRoles').onclick=roles;
document.addEventListener('click',event=>{if(event.target.closest('#nativeOpen')){roles();$('nativeDefenseHelp').textContent=hints[$('nativeMode').value];}});
roles();$('nativeDefenseHelp').textContent=hints.majority;
