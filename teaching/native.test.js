import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {NativeSession,ledger} from './native-core.js';

// Run the actual upstream classes and actual browser bridge, without a DOM renderer.
function host(count=4){
  const source=readFileSync(new URL('../original.html',import.meta.url),'utf8');
  const classes=source.slice(source.indexOf('class Network {'),source.indexOf('\n\tnetwork = new Network();'));
  const jq=()=>({html(){return this;},text(){return this;},attr(){return this;}});
  const context=vm.createContext({window:{},Math:Object.create(Math),setTimeout:()=>1,clearTimeout(){},setInterval:()=>1,clearInterval(){},$:jq,updateTools(){},clearAllTimeouts(){},DOM_toggleAllMining(){},DOM_toggleMining(){},document:{},updateToolOptions:{visSimulationActive:false}});
  vm.runInContext('let network=null;'+classes+'\nnetwork=new Network();network.difficulty=0.01;network.genesis.hash=0.001;network.genesis.nonce=0.001;\nwindow.Miner=Miner;',context);
  vm.runInContext(readFileSync(new URL('./native-bridge.js',import.meta.url),'utf8'),context);
  const api=context.window.SimewuTeaching;
  for(let i=0;i<count;i++)new context.window.Miner('Node '+(i+1),10,100,1000,1000);
  const nodes=Object.values(api.network().peers);
  for(const n of nodes)for(const other of nodes)if(other!==n){n.outgoingPeers[other.ID]=100;n.incomingPeers.push(other.ID);}
  return {api,nodes,context};
}
function run(c={}){
  const {api,nodes}=host();
  const s=new NativeSession(api,{attacker:nodes[0].ID,merchant:nodes[1].ID,...c});
  api.setSession(s);
  while(!s.done)s.step();
  return s;
}

test('native miner chains and UTXO conserve funds across all four modes',()=>{
  for(const mode of ['majority','finney','race','double'])for(let seed=0;seed<25;seed++)for(const defended of [false,true]){
    const s=run({mode,seed,defended,confirmations:0});
    for(const n of s.nodes){const coins=[...ledger(s.chain(n)).values()];assert.equal(coins.length,1);assert.equal(coins[0].value,10);}
    assert.ok(s.nodes.some(n=>n.totalBlocksFound>0));
    if(defended&&['finney','race'].includes(mode))assert.ok(!s.delivered||s.balance===10);
  }
});
test('native block duplicate-spend rejection protects consensus with app validation off',()=>{
  const s=run({mode:'double',validation:false});
  assert.equal(s.receipts,2);assert.equal(s.balance,10);assert.equal(s.rejected,1);
  assert.equal(s.merchant.currentHeader.height,2);
  assert.equal(run({mode:'double',validation:true}).receipts,1);
});
test('upstream Header cloning preserves transaction metadata through receive and query',()=>{
  const s=run({mode:'double'});
  for(const n of s.nodes){const block=n.queryBlockAtHeight(1);assert.equal(block.teachingTransactions[0].id,'TX-A');assert.equal(block.isBlock(),true);}
});
test('native mining and defense runs are reproducible with the same seed',()=>{
  for(const mode of ['majority','finney','race','double']){
    assert.equal(JSON.stringify(run({mode,seed:42}).report()),JSON.stringify(run({mode,seed:42}).report()));
  }
});
test('actual outgoingPeers control propagation and disconnected merchant stays unconfirmed',()=>{
  const {api,nodes}=host(3);
  for(const n of nodes)n.outgoingPeers={};
  const s=new NativeSession(api,{mode:'double',attacker:nodes[0].ID,merchant:nodes[1].ID});api.setSession(s);
  s.sent=true;s.mine(nodes[2],[s.A]);
  assert.equal(s.confirmations,0);assert.equal(nodes[1].currentHeader.height,1);
});
test('shared-role and invalid numerical configurations do not mutate native power',()=>{
  const {api,nodes}=host();
  assert.throws(()=>new NativeSession(api,{attacker:nodes[0].ID,merchant:nodes[0].ID}));
  assert.throws(()=>new NativeSession(api,{attacker:nodes[0].ID,merchant:nodes[1].ID,q:NaN}));
  assert.equal(nodes[0].power,10);
});
