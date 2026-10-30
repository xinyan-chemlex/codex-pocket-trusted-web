const paths={
  phone:['M7 2h10v20H7z','M10 5h4','M11 19h2'],
  terminal:['M4 5h16v14H4z','m7 9 3 3-3 3','M13 15h4'],
  monitor:['M3 4h18v13H3z','M8 21h8','M12 17v4'],
  server:['M4 3h16v7H4z','M4 14h16v7H4z','M7 6.5h.01','M7 17.5h.01','M11 6.5h6','M11 17.5h6'],
  folder:['M3 7V5h6l2 2h10v12H3z'],
  chat:['M4 4h16v12H9l-5 4z','M8 8h8','M8 12h5'],
  panel:['M3 4h18v16H3z','M9 4v16'],
  plus:['M12 5v14','M5 12h14'],
  arrow:['M5 12h14','m13 6 6 6-6 6'],
  up:['M12 19V5','m6 11 6-6 6 6'],
  refresh:['M20 7v5h-5','M4 17v-5h5','M6 7a7 7 0 0 1 12-1l2 6','M18 17a7 7 0 0 1-12 1l-2-6'],
  settings:['M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8','m9 3 6 0 1 3 3 1 2 5-2 2-1 3-5 2-2-2-3-1-2-5 2-2 1-3 3-1z'],
  image:['M3 3h18v18H3z','M7 8h.01','m3 18 6-6 4 4 3-3 5 5'],
  search:['M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12','m15 15 5 5'],
  lock:['M5 10h14v11H5z','M8 10V7a4 4 0 0 1 8 0v3','M12 14v3'],
  close:['m6 6 12 12','M18 6 6 18'],
  logout:['M10 4H4v16h6','M9 12h12','m17 8 4 4-4 4'],
  chevron:['m9 5 7 7-7 7'],
};
export function icon(name,className='ui-icon'){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');svg.setAttribute('class',className);
  for(const d of paths[name]||paths.terminal){const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);svg.append(p);}return svg;
}
export function buttonIcon(id,name,label){const button=document.getElementById(id);if(!button)return;const text=label??button.textContent.trim();if(text&&!button.hasAttribute('aria-label'))button.setAttribute('aria-label',text);button.replaceChildren(icon(name));if(text){const span=document.createElement('span');span.textContent=text;button.append(span);}}
