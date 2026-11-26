// Loaded after the upstream classic script so its lexical bindings remain authoritative.
(() => {
  let active=null;
  const queue=[];
  const clone=Header.prototype.clone, fromObj=Header.fromObj;
  Header.prototype.clone=function(){const h=clone.call(this);if(this.teachingTransactions)h.teachingTransactions=this.teachingTransactions.map(t=>({...t}));return h;};
  Header.fromObj=function(obj){const h=fromObj(obj);if(obj.teachingTransactions)h.teachingTransactions=obj.teachingTransactions.map(t=>({...t}));return h;};
  const submit=Miner.prototype.submit, receive=Miner.prototype.receive, send=NetworkBuffer.prototype.send;
  Miner.prototype.submit=function(h){if(active?.active&&active.net===network&&active.withholding&&this===active.attacker)return;return submit.call(this,h);};
  Miner.prototype.receive=function(from,h){if(active?.active&&active.net===network)return active.accept(this,from,h,receive);return receive.call(this,from,h);};
  NetworkBuffer.prototype.send=function(to,payload){
    if(!active?.active||active.net!==network)return send.call(this,to,payload);
    const packet={from:this.parentID,to,payload,size:payload.numBytes};this.buffer.push(packet);queue.push({buffer:this,packet});
  };
  const originalAll=DOM_toggleAllMining,originalOne=DOM_toggleMining;
  DOM_toggleAllMining=function(){if(active?.active&&active.net===network)return document.getElementById('nativePlay').click();return originalAll();};
  DOM_toggleMining=function(){if(active?.active&&active.net===network)return document.getElementById('nativeStep').click();return originalOne();};
  window.SimewuTeaching={
    network:()=>network,
    withRandom(random,fn){const original=Math.random;Math.random=random;try{return fn();}finally{Math.random=original;}},
    setSession(session){active=session;queue.length=0;},
    flush(){let deliveries=0;while(queue.length){if(++deliveries>100000)throw Error('Message limit exceeded for this teaching step');const {buffer,packet}=queue.shift();const i=buffer.buffer.indexOf(packet);if(i>=0)buffer.buffer.splice(i,1);network.peers[packet.to]?.receive(packet.from,packet.payload);}},
    stop(){network.stopAllMiners();if(updateToolOptions.sampler_running)toggleSampling(false);network.removeBlocksInFlight();queue.length=0;$('#toggleMiningBtn').text('Start All Miners').attr('class','btn btn-dark rounded-0');},
    clear(){network.clearBlockchain();},
    mesh(){for(const n of Object.values(network.peers))for(const other of Object.values(network.peers))if(n!==other&&n.outgoingPeers[other.ID]===undefined)n.addConnection(other.ID,false);},
    snapshot(){return {nodes:Object.values(network.peers).map(n=>({id:n.ID,power:n.power,latency:n.latency,outgoing:{...n.outgoingPeers}}))};},
    restore(snapshot){for(const data of snapshot.nodes){const n=network.peers[data.id];if(!n)continue;n.power=data.power;n.latency=data.latency;n.outgoingPeers={...data.outgoing};delete n.teachingRole;}for(const n of Object.values(network.peers))n.incomingPeers=[];for(const n of Object.values(network.peers))for(const to in n.outgoingPeers)network.peers[to]?.incomingPeers.push(n.ID);},
    refresh(rebuild=false){if(rebuild)_updateMinerList();updateMinerStatsTable();updateMinerJsonEditor();if(active?.active&&network.peers[active.merchant.ID]){$('#explorerMinerName').val(active.merchant.ID);$('#explorerMinerBlock').val(active.merchant.currentHeader.height-1);}changeExplorerMiner();if(rebuild)vis_setupNetworkSimulation();requestVisRedraw();},
    select(id){clearTimeout(updateToolOptions.selectMinerTimeout);updateToolOptions.selectMinerTimeout=null;_selectMiner(id,false);},
    running(value){$('#toggleMiningBtn').text(value?'Stop All Miners':'Start All Miners').attr('class',value?'btn btn-warning rounded-0':'btn btn-dark rounded-0');},
    samplerEnabled(enabled){document.getElementById('toggleSamplingBtn').disabled=!enabled;}
  };
})();
