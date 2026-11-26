import {readFileSync,writeFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
let html=readFileSync(new URL('original.html',root),'utf8').replace(/^\uFEFF/,'');
html=html.replace("<link rel='stylesheet' href='style.min.css'>","<link rel='stylesheet' href='style.min.css'>\n<link rel='stylesheet' href='teaching/native.css'>");
const display=html.indexOf('<!-- Display Options Dropdown -->');
const menuAt=html.lastIndexOf("<div class='btn-group w-100'",display);
if(menuAt<0)throw Error('Cannot locate upstream menu');
const menu="<div class='btn-group w-100'><button id='nativeOpen' type='button' class='btn btn-dark rounded-0' data-toggle='collapse' data-target='#teachingPanel' aria-expanded='false' aria-controls='teachingPanel'>Testing</button></div>\n";
html=html.slice(0,menuAt)+menu+html.slice(menuAt);
const target="<div class='row'>\n\t\t\t<div class='col-md-12'>\n\t\t\t\t<span id='canvasVisualizerSpan'>";
// Work with both upstream CRLF and LF checkouts.
html=html.replace(/\r\n/g,'\n');
if(!html.includes(target))throw Error('Cannot locate upstream visualization');
html=html.replace(target,readFileSync(new URL('teaching/native-panel.html',root),'utf8')+'\n'+target);
html=html.replace('</html>',"<script src='teaching/site-links.js'></script>\n<script src='teaching/native-bridge.js?v=20261126.3'></script>\n<script type='module' src='teaching/native-ui.js?v=20261126.3'></script>\n</html>");
html=html.replace(/new JSONEditor\((\w+),\s*\{/g,'new JSONEditor($1, { language: "en",');
writeFileSync(new URL('index.html',root),html);
