/* Price-ready notifications are shown only for inquiries assigned to the logged-in salesperson. */
(function(){
  const seenPrefix='sambhav-price-ready-v1:';
  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  async function check(){
    try{
      const r=await fetch('/sales/inquiries/data',{credentials:'same-origin',cache:'no-store'});
      if(!r.ok)return;
      const j=await r.json();if(!j.success)return;
      const ready=(j.data||[]).filter(x=>x.overallStatus==='pricing-ready'&&x.priceReadyNoticeVersion>0);
      const unseen=ready.filter(x=>localStorage.getItem(seenPrefix+x._id)!==String(x.priceReadyNoticeVersion));
      if(!unseen.length)return;
      const x=unseen[0];
      // Mark before opening to avoid repeated interruptions across multiple tabs.
      localStorage.setItem(seenPrefix+x._id,String(x.priceReadyNoticeVersion));
      if(document.getElementById('sambhavPriceNotice'))return;
      const div=document.createElement('div');div.id='sambhavPriceNotice';div.style.cssText='position:fixed;right:20px;top:85px;width:min(420px,calc(100vw - 40px));z-index:100000;background:white;border:2px solid #16a34a;border-radius:14px;padding:20px;box-shadow:0 10px 35px #0003;font-family:Arial,sans-serif;color:#15243c';
      div.innerHTML='<button id="spnClose" style="float:right;border:0;background:#e2e8f0;border-radius:5px;padding:5px 9px">✕</button><h3 style="color:#15803d">🔔 Inquiry Price Ready</h3><p><b>Customer:</b> '+escapeHtml(x.companyId?.companyName||x.companyId?.name||'Unknown')+'</p><p><b>Products:</b> '+(x.products||[]).map(p=>escapeHtml(p.productName)+' — ₹'+escapeHtml(p.finalSellingPrice??'Not set')).join(', ')+'</p><a href="/sales/inquiries" style="display:inline-block;background:#2563eb;color:white;padding:9px 14px;border-radius:7px;text-decoration:none">View My Inquiries</a>';
      document.body.appendChild(div);div.querySelector('#spnClose').onclick=()=>div.remove();
    }catch(e){console.warn('Price ready notification check failed',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check);else check();
  setInterval(check,30000);
})();
