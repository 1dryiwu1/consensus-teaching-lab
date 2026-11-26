// Keep navigation within the classroom site, including links added by editor widgets.
(() => {
  function external(link) {
    const value=link.getAttribute('href');
    if(!value || value.startsWith('#'))return false;
    try {
      const url=new URL(value,location.href);
      if(url.protocol==='blob:'&&link.hasAttribute('download'))return false;
      return !['http:','https:'].includes(url.protocol)||url.origin!==location.origin;
    } catch { return true; }
  }
  function clean(root) {
    if(root.nodeType!==Node.ELEMENT_NODE)return;
    if(root.matches('a[href]')&&external(root)){root.remove();return;}
    for(const link of root.querySelectorAll('a[href]'))if(external(link))link.remove();
  }
  clean(document.documentElement);
  new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='attributes')clean(record.target);
      else for(const node of record.addedNodes)clean(node);
    }
  }).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['href']});
})();
