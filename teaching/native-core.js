// Teaching extension driven by the original Simewu Miner, Header and Network objects.
export const modes = {
  majority:'51% Attack', finney:'Finney Attack', race:'Race Attack', double:'Double-Spend Attack'
};
export function seededRandom(seed) {
  let value=Number(seed)>>>0;
  return ()=>{value+=0x6D2B79F5;let n=value;n=Math.imul(n^n>>>15,n|1);n^=n+Math.imul(n^n>>>7,n|61);return ((n^n>>>14)>>>0)/4294967296;};
}
export function ledger(chain) {
  const coins=new Map([['U0',{owner:'Alice',value:10}]]);
  for(let i=0;i<chain.length;i++) {
    const block=chain[i];
    if(!block || block.height!==i || !block.isBlock())throw Error('Invalid native block');
    if(i && block.prevHash!==chain[i-1].hash)throw Error('Block links do not match');
    for(const tx of block.teachingTransactions||[]) {
      const coin=coins.get(tx.input);
      if(!coin || coin.owner!==tx.owner || coin.value!==tx.value)throw Error(`${tx.id} references a spent or invalid UTXO`);
      coins.delete(tx.input);coins.set(tx.id+':0',{owner:tx.to,value:tx.value});
    }
  }
  return coins;
}
export class NativeSession {
  constructor(api, config) {
    this.api=api;this.net=api.network();this.config={mode:'majority',q:60,confirmations:1,seed:42,defended:false,fee:3,delay:2,validation:false,...config};
    if(!modes[this.config.mode])throw Error('Select an experiment type');
    this.nodes=Object.values(this.net.peers);this.attacker=this.net.peers[this.config.attacker];this.merchant=this.net.peers[this.config.merchant];
    if(this.nodes.length<2||!this.attacker||!this.merchant||this.attacker===this.merchant)throw Error('Select different attacker and merchant nodes. The network needs at least two nodes.');
    for(const [key,min,max] of [['q',1,90],['confirmations',0,100],['seed',0,4294967295],['delay',0,20],['fee',1,100]]) {
      const n=Number(this.config[key]);if(!Number.isFinite(n)||n<min||n>max)throw Error('Parameter out of range: '+key);this.config[key]=n;
    }
    if(this.net.useSHA256)throw Error('Teaching mode uses simplified PoW. Turn off Use secure SHA-256 in Network first.');
    if(!(this.net.difficulty>0&&this.net.difficulty<=1))throw Error('The difficulty target must be greater than 0 and at most 1.');
    this.random=seededRandom(this.config.seed);this.time=0;this.logs=[];this.active=true;this.done=false;this.sent=false;this.delivered=false;this.conflictKnown=false;
    this.privateFound=false;this.phase='prepare';this.receipts=0;this.reorgs=0;this.rejected=0;this.lastError='';
    this.withholding=['majority','finney'].includes(this.config.mode);
    this.A={id:'TX-A',input:'U0',owner:'Alice',to:'Merchant',value:10};
    this.B={id:'TX-B',input:'U0',owner:'Alice',to:'Alice',value:10};
    this.origPower=new Map(this.nodes.map(n=>[n.ID,n.power]));
    this.honest=this.nodes.filter(n=>n!==this.attacker);
    this.adjustPowers();
    this.attacker.teachingRole='Attacker';this.merchant.teachingRole='Merchant observer';
    this.log('Teaching session loaded',`Using ${this.nodes.length} existing miners. Attacker: ${this.attacker.name}; merchant observer: ${this.merchant.name}.`);
  }
  adjustPowers() {
    const q=(this.config.defended&&this.config.mode==='majority'?Math.min(30,this.config.q):this.config.q)/100;
    const total=Math.max(100,this.nodes.reduce((s,n)=>s+Math.max(0,n.power),0));
    const honestPower=this.honest.reduce((s,n)=>s+Math.max(0,this.origPower.get(n.ID)),0);
    this.attacker.power=total*q;
    for(const n of this.honest)n.power=total*(1-q)*(honestPower?Math.max(0,this.origPower.get(n.ID))/honestPower:1/this.honest.length);
  }
  log(title,detail){this.logs.push({time:this.time,title,detail});}
  chain(node){return node.blockchain.slice(0,node.currentHeader.height);}
  get confirmations(){const chain=this.chain(this.merchant);const i=chain.findIndex(b=>(b.teachingTransactions||[]).some(t=>t.id==='TX-A'));return i<0?0:chain.length-i;}
  get balance(){return [...ledger(this.chain(this.merchant)).values()].filter(c=>c.owner==='Merchant').reduce((s,c)=>s+c.value,0);}
  get threshold(){return this.config.defended?Math.max(1,this.config.confirmations):this.config.confirmations;}
  get statusA(){return this.confirmations?'Confirmed':this.chain(this.merchant).some(b=>(b.teachingTransactions||[]).some(t=>t.id==='TX-B'))?'Invalidated':this.sent?'Pending':'Not sent';}
  get result(){
    if(this.config.mode==='double'&&this.done)return this.receipts>1?'The payment application recorded a duplicate receipt. Native nodes rejected the invalid double-spend block.':'Native nodes rejected the double spend. The payment application kept one valid receipt.';
    if(!this.done)return 'Observe changes in the existing nodes, topology, statistics and Blockchain Explorer.';
    if(this.delivered&&!this.balance)return 'Goods delivered, but the merchant has 0 coins on the valid chain. A double-spend loss occurred.';
    if(this.delivered)return 'The merchant received 10 teaching coins and delivered the goods. No delivery loss occurred.';
    return 'The merchant withheld the goods. No delivery loss occurred.';
  }
  considerDelivery(){
    if(!this.sent||this.delivered||this.statusA==='Invalidated')return;
    if(this.config.defended&&this.conflictKnown&&this.config.mode==='race')return;
    if(this.confirmations>=this.threshold){this.delivered=true;this.log('Merchant delivered goods',`Confirmations: ${this.confirmations}; required: ${this.threshold}.`);}
  }
  send(){this.sent=true;this.log('Transactions created','TX-A pays the merchant; conflicting TX-B pays Alice. Both spend genesis output U0.');this.considerDelivery();}
  choose(pool=this.nodes){
    const total=pool.reduce((s,n)=>s+Math.max(0,n.power),0);if(!total)return pool[0];
    let r=this.random()*total;for(const n of pool){r-=Math.max(0,n.power);if(r<=0)return n;}return pool.at(-1);
  }
  mine(node,tx=[]) {
    node.currentHeader.teachingTransactions=tx.map(t=>({...t}));
    const parent=this.chain(node);
    const proposed=node.currentHeader;
    // Ownership is checked independently of the PoW nonce; PoW is produced by original mine().
    const utxo=ledger(parent);
    for(const t of tx){if(!utxo.has(t.input))throw Error('Attempted to mine an invalid UTXO');utxo.delete(t.input);}
    const count=node.totalBlocksFound;
    this.api.withRandom(this.random,()=>{for(let attempts=0;attempts<1000000&&node.totalBlocksFound===count;attempts++)node.mine();});
    if(node.totalBlocksFound===count)throw Error('No block found in this teaching step. Increase the difficulty target in Network.');
    this.api.flush();
    this.log('Native miner found a block',`${node.name} -> height ${node.currentHeader.height-1}; transactions: ${tx.map(t=>t.id).join(', ')||'none'}.`);
    this.considerDelivery();
    return proposed;
  }
  candidateChain(header){
    const solver=this.net.peers[header.solver];if(!solver)throw Error('Block source not found');
    const chain=[];
    for(let h=0;h<header.height;h++){const b=solver.getBlock(h);if(!b)throw Error('Candidate branch is missing a historical block');chain.push(b);}
    chain.push(header);ledger(chain);return chain;
  }
  accept(node,from,header,receive){
    if(this.withholding&&node===this.attacker)return;
    if(header.height<node.currentHeader.height)return;
    try{this.candidateChain(header);}catch(error){this.rejected++;this.log('Native node rejected a block',`${node.name}: ${error.message}`);return;}
    const old=node===this.merchant?this.chain(node):null;
    receive.call(node,from,header);
    if(old&&old.some((b,i)=>this.chain(node)[i]?.hash!==b.hash)) {
      this.reorgs++;this.log('Merchant node reorganized its chain',`${node.name} used native receive() and queryBlockAtHeight() to adopt the longer branch.`);
    }
    this.considerDelivery();
  }
  release(){
    this.withholding=false;
    const tip=this.attacker.getBlock(this.attacker.currentHeader.height-1);
    this.log('Private branch published',`${this.attacker.name}.submit() broadcasts the block at height ${tip.height} to its outgoingPeers.`);
    this.attacker.submit(tip);this.api.flush();this.considerDelivery();
  }
  step(){
    if(this.done||!this.active)return;
    if(this.api.network()!==this.net||this.nodes.some(n=>this.net.peers[n.ID]!==n))throw Error('The native network changed. Reload the teaching session.');
    this.time++;
    if(this.config.mode==='majority')this.majority();
    if(this.config.mode==='finney')this.finney();
    if(this.config.mode==='race')this.race();
    if(this.config.mode==='double')this.double();
    for(const n of this.nodes)ledger(this.chain(n));
    if(this.done)this.log('Completed',this.result);
  }
  majority(){
    if(!this.sent){this.send();return;}
    const node=this.choose();const attacker=node===this.attacker;
    const hasSpend=this.chain(node).some(b=>(b.teachingTransactions||[]).length);
    this.mine(node,hasSpend?[]:[attacker?this.B:this.A]);
    if(this.delivered&&this.attacker.currentHeader.height>this.merchant.currentHeader.height){this.release();this.done=true;}
    if(this.time>=50){this.log('Observation window ended','Observation stopped after 50 teaching steps. No reorganization within this window does not imply permanent safety.');this.done=true;}
  }
  finney(){
    if(this.phase==='prepare'){
      const node=this.choose();
      this.mine(node,node===this.attacker?[this.B]:[]);
      if(node===this.attacker){this.privateFound=true;this.phase='premined';this.log('Pre-mined block found','TX-B is in the attacker node\'s native block, which has not been broadcast.');}
      if(this.time>=35&&this.phase==='prepare'){this.done=true;this.log('Pre-mining timed out','No pre-mined block was found in this run.');}return;
    }
    if(this.phase==='premined'){this.send();this.phase='paid';return;}
    if(this.random()<0.2)this.mine(this.choose(this.honest),[this.A]);
    this.release();this.done=true;
  }
  race(){
    if(!this.sent){this.send();return;}
    if(this.time===2){this.conflictKnown=true;this.log('Merchant received a conflict alert','Both transactions reference U0. Defense mode suspends delivery.');return;}
    const early=this.random()<1/(1+this.config.delay);
    const replace=this.random()<0.5;
    const selectA=early&&(!replace||this.random()<1/(1+this.config.fee));
    this.mine(this.choose(this.honest),[selectA?this.A:this.B]);this.done=true;
  }
  double(){
    if(!this.sent){this.send();return;}
    if(this.time===2){this.mine(this.choose(this.honest),[this.A]);this.receipts=1;return;}
    const sender=this.choose(this.honest);const invalid=sender.newHeader(sender.getBlock(sender.currentHeader.height-1));
    invalid.teachingTransactions=[this.B];
    this.api.withRandom(this.random,()=>{do{invalid.guessNonce();}while(!invalid.isBlock());});
    this.merchant.receive(sender.ID,invalid);
    this.receipts=(this.config.validation||this.config.defended)?1:2;
    this.log('Receipt validation',this.receipts===1?'Checked the valid chain and funding source; kept one receipt.':'Application validation is off, producing two receipts. The valid chain still contains only one spend.');this.done=true;
  }
  report(){return {config:this.config,steps:this.time,result:this.result,merchantBalance:this.balance,confirmations:this.confirmations,delivered:this.delivered,reorgs:this.reorgs,rejected:this.rejected,receipts:this.receipts,nodes:this.nodes.map(n=>({id:n.ID,name:n.name,power:n.power,height:n.currentHeader.height-1,blocksFound:n.totalBlocksFound,blocks:this.chain(n).map(b=>({height:b.height,hash:b.hash,prevHash:b.prevHash,transactions:b.teachingTransactions||[]}))})),logs:this.logs};}
}
