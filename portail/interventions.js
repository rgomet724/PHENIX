'use strict';
(() => {
  const endpoint='/portail/administration/api/interventions';
  const el=id=>document.getElementById(id);
  let items=[],busy=false,dirty=false;
  const row=(item={code:'',label:''})=>{
    const tr=document.createElement('tr');
    const codeCell=document.createElement('td'),labelCell=document.createElement('td'),actionCell=document.createElement('td');
    const code=document.createElement('input');code.value=item.code;code.maxLength=20;code.placeholder='Ex. 020';code.setAttribute('aria-label','Code intervention');code.style.fontWeight='700';
    const label=document.createElement('input');label.value=item.label;label.maxLength=180;label.placeholder='Motif d’intervention';label.setAttribute('aria-label','Motif intervention');
    const del=document.createElement('button');del.type='button';del.className='button small danger';del.textContent='Supprimer';
    del.addEventListener('click',()=>{if(confirm('Supprimer ce code du catalogue ?')){tr.remove();dirty=true;}});
    code.addEventListener('input',()=>{dirty=true;});label.addEventListener('input',()=>{dirty=true;});
    codeCell.append(code);labelCell.append(label);actionCell.append(del);tr.append(codeCell,labelCell,actionCell);
    return tr;
  };
  const draw=()=>{el('interventionRows').replaceChildren(...items.map(row));dirty=false;};
  const csrf=async()=>{
    const response=await fetch('/portail/administration/api/session',{credentials:'same-origin',cache:'no-store'});
    const data=await response.json();
    if(!response.ok)throw new Error(data.message||'Session administrateur requise.');
    return data.csrfToken;
  };
  async function load(){
    if(dirty&&!confirm('Annuler les modifications non enregistrées ?'))return;
    el('interventionError').textContent='';
    try{
      const response=await fetch(endpoint,{credentials:'same-origin',cache:'no-store'});
      const data=await response.json();
      if(!response.ok)throw new Error(data.message||data.error||'Chargement impossible.');
      items=data.interventions||[];draw();
    }catch(error){el('interventionError').textContent=error.message;}
  }
  async function save(){
    if(busy)return;
    const interventions=[...el('interventionRows').children].map(tr=>({
      code:tr.cells[0].querySelector('input').value.trim().toUpperCase(),
      label:tr.cells[1].querySelector('input').value.trim()
    }));
    const error=el('interventionError');error.textContent='';
    if(!interventions.length){error.textContent='Conservez au moins un motif.';return;}
    if(interventions.some(x=>!x.code||!x.label)){error.textContent='Renseignez tous les codes et motifs.';return;}
    if(new Set(interventions.map(x=>x.code)).size!==interventions.length){error.textContent='Certains codes sont en double.';return;}
    busy=true;el('interventionSave').disabled=true;
    try{
      const token=await csrf();
      const response=await fetch(endpoint,{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json','x-admin-csrf':token},body:JSON.stringify({interventions})});
      const data=await response.json();
      if(!response.ok)throw new Error(data.message||data.error||'Enregistrement impossible.');
      items=data.interventions;draw();error.style.color='#16854b';error.textContent='Codes et motifs enregistrés dans PHENIX et ATLAS.';
    }catch(e){error.style.color='#ad1c2b';error.textContent=e.message;}
    finally{busy=false;el('interventionSave').disabled=false;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    el('interventionAdd').addEventListener('click',()=>{
      const tr=row();el('interventionRows').append(tr);tr.querySelector('input').focus();dirty=true;
    });
    el('interventionReload').addEventListener('click',load);
    el('interventionSave').addEventListener('click',save);
    document.querySelector('[data-view="access"]').addEventListener('click',load);
    load();
  });
})();
