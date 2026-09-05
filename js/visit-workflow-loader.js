/* Lightweight loader keeps calendar/PDF workflow code off the authenticated critical bundle. */
(()=>{
  'use strict';
  if(window.PametVisitWorkflowLoader)return;
  let pending=null;
  function load(){
    if(window.PametVisitWorkflow)return Promise.resolve(window.PametVisitWorkflow);
    if(pending)return pending;
    pending=new Promise((resolve,reject)=>{
      const script=document.createElement('script');
      script.src='/deferred/visit-workflow.js';
      script.async=true;
      script.addEventListener('load',()=>window.PametVisitWorkflow?resolve(window.PametVisitWorkflow):reject(new Error('Visit workflow did not initialize.')),{once:true});
      script.addEventListener('error',()=>reject(new Error('Visit workflow could not be loaded.')),{once:true});
      document.head.appendChild(script);
    }).catch(error=>{pending=null;throw error});
    return pending;
  }
  window.PametVisitWorkflowLoader={load};
  document.addEventListener('click',event=>{
    const email=event.target.closest?.('#emailReport');
    if(email&&!window.PametVisitWorkflow){
      event.preventDefault();event.stopImmediatePropagation();
      load().then(workflow=>workflow.openEmailBrief()).catch(()=>{});
      return;
    }
    if(event.target.closest?.('[data-nav="report"],[data-phase2="prep"]'))load().catch(()=>{});
  },true);
})();
