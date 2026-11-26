// Loaded after the upstream classic script so its lexical bindings remain authoritative.
(() => {
  let active=null;
  const queue=[];
  const clone=Header.prototype.clone, fromObj=Header.fromObj;
  Header.prototype.clone=function(){const h=clone.call(this);if(this.transactions)h.transactions=this.transactions.map(t=>({...t}));return h;};
  Header.fromObj=function(obj){const h=fromObj(obj);if(obj.transactions)h.transactions=obj.transactions.map(t=>({...t}));return h;};
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
  function densePlan(){
    const ids=Object.keys(network.peers);
    const count=ids.reduce((sum,id)=>sum+Object.keys(network.peers[id].outgoingPeers).length,0);
    if(ids.length<8||count<=ids.length*4)return null;
    const selected=network.peers[updateToolOptions.selectedMiner]?updateToolOptions.selectedMiner:(active?.merchant.ID||ids[0]);
    const outer=ids.filter(id=>id!==selected),positions={};positions[selected]={x:0,y:0};
    const radius=Math.max(350,outer.length*16);
    outer.forEach((id,i)=>{const angle=2*Math.PI*i/outer.length-Math.PI/2;positions[id]={x:radius*Math.cos(angle),y:radius*Math.sin(angle)};});
    const links=outer.flatMap(id=>{
      const outgoing=network.peers[selected].outgoingPeers[id]!==undefined;
      const incoming=network.peers[id].outgoingPeers[selected]!==undefined;
      return outgoing||incoming?[{from:selected,to:id,outgoing,incoming}]:[];
    });
    return {selected,count,positions,links};
  }
  function tidyTopology(){
    const plan=densePlan(),view=updateToolOptions.visNetwork;
    let note=document.getElementById('nativeTopologyNote');
    if(!active?.active||active.net!==network||!plan||!view){if(note)note.hidden=true;return;}
    if(!note){note=document.createElement('p');note.id='nativeTopologyNote';note.className='small text-white bg-dark px-3 py-2 mb-0';const container=document.getElementById('networkVisualizer');container.before(note);}
    note.hidden=false;note.textContent=`Dense network: showing ${plan.links.length} neighboring nodes of ${network.peers[plan.selected].name}. All ${plan.count} directed connections remain active. Select another node to inspect its connections.`;
    const data=view.body.data,mapping=updateToolOptions.visNodeIDs;
    view.setOptions({physics:{enabled:false},edges:{smooth:false,width:1,color:{color:'#adb5bd',opacity:0.45}},nodes:{size:18,borderWidth:2,font:{size:22,color:'#ffffff',strokeWidth:4,strokeColor:'#343a40'}},interaction:{dragNodes:false}});
    data.nodes.update(Object.entries(plan.positions).map(([id,p])=>({id:mapping[id],...p,fixed:{x:true,y:true}})));
    const seen=new Set();
    data.edges.update(data.edges.get().map(edge=>{
      const link=plan.links.find(l=>(mapping[l.from]===edge.from&&mapping[l.to]===edge.to)||(mapping[l.from]===edge.to&&mapping[l.to]===edge.from));
      const key=link?link.from+':'+link.to:'';const hidden=!link||seen.has(key);if(!hidden)seen.add(key);
      const forward=link&&mapping[link.from]===edge.from;
      return {id:edge.id,hidden,physics:false,smooth:false,arrows:{to:{enabled:!hidden&&(forward?link.outgoing:link.incoming),scaleFactor:0.45},from:{enabled:!hidden&&(forward?link.incoming:link.outgoing),scaleFactor:0.45}}};
    }));
    view.fit({animation:false});
  }
  const originalSetup=_vis_setupNetworkSimulation;
  _vis_setupNetworkSimulation=function(){updateToolOptions.visNetwork?.destroy();originalSetup();tidyTopology();};
  const originalSelect=_selectMiner;
  _selectMiner=function(id,scrollTo){originalSelect(id,scrollTo);tidyTopology();};
  window.SimewuTesting={
    network:()=>network,
    withRandom(random,fn){const original=Math.random;Math.random=random;try{return fn();}finally{Math.random=original;}},
    setSession(session){active=session;queue.length=0;if(!session){const note=document.getElementById('nativeTopologyNote');if(note)note.hidden=true;}},
    visualPlan:densePlan,
    flush(){let deliveries=0;while(queue.length){if(++deliveries>100000)throw Error('Message limit exceeded for this test step');const {buffer,packet}=queue.shift();const i=buffer.buffer.indexOf(packet);if(i>=0)buffer.buffer.splice(i,1);network.peers[packet.to]?.receive(packet.from,packet.payload);}},
    stop(){network.stopAllMiners();if(updateToolOptions.sampler_running)toggleSampling(false);network.removeBlocksInFlight();queue.length=0;$('#toggleMiningBtn').text('Start All Miners').attr('class','btn btn-dark rounded-0');},
    clear(){network.clearBlockchain();},
    mesh(){for(const n of Object.values(network.peers))for(const other of Object.values(network.peers))if(n!==other&&n.outgoingPeers[other.ID]===undefined)n.addConnection(other.ID,false);},
    snapshot(){return {nodes:Object.values(network.peers).map(n=>({id:n.ID,power:n.power,latency:n.latency,outgoing:{...n.outgoingPeers}}))};},
    restore(snapshot){for(const data of snapshot.nodes){const n=network.peers[data.id];if(!n)continue;n.power=data.power;n.latency=data.latency;n.outgoingPeers={...data.outgoing};delete n.testRole;}for(const n of Object.values(network.peers))n.incomingPeers=[];for(const n of Object.values(network.peers))for(const to in n.outgoingPeers)network.peers[to]?.incomingPeers.push(n.ID);},
    refresh(rebuild=false){if(rebuild){_updateMinerList();clearTimeout(updateToolOptions.selectMinerTimeout);updateToolOptions.selectMinerTimeout=null;$('#minerList').val(updateToolOptions.selectedMiner);}updateMinerStatsTable();updateMinerJsonEditor();if(active?.active&&network.peers[active.merchant.ID]){$('#explorerMinerName').val(active.merchant.ID);$('#explorerMinerBlock').val(active.merchant.currentHeader.height-1);}changeExplorerMiner();if(rebuild)vis_setupNetworkSimulation();requestVisRedraw();},
    select(id){
      // Do not fire the upstream change handler: it schedules selectMiner() with scrolling enabled.
      clearTimeout(updateToolOptions.selectMinerTimeout);updateToolOptions.selectMinerTimeout=null;
      updateToolOptions.selectedMinerPrev=updateToolOptions.selectedMiner;updateToolOptions.selectedMiner=id;
      $('#minerList').val(id);$('#explorerMinerName').val(id);
      updateMinerJsonEditor(network.peers[id]);drawCanvasVisualizerMinerCircles();
    },
    running(value){$('#toggleMiningBtn').text(value?'Stop All Miners':'Start All Miners').attr('class',value?'btn btn-warning rounded-0':'btn btn-dark rounded-0');},
    samplerEnabled(enabled){document.getElementById('toggleSamplingBtn').disabled=!enabled;}
  };
})();
