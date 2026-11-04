// Shared attachment controls for Sales CRM and Inquiry Management.
window.inquiryAttachmentUpload = async function(inquiryId, input) {
  if (!input || !input.files.length) return;
  const files = Array.from(input.files);
  if (files.length > 5 || files.some(f => f.size > 4 * 1024 * 1024)) throw new Error('Maximum 5 files, 4 MB each');
  const fd = new FormData(); files.forEach(file => fd.append('attachments', file));
  const response = await fetch('/api/inquiries/' + encodeURIComponent(inquiryId) + '/attachments', { method: 'POST', body: fd });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Upload failed');
  input.value = '';
};
window.inquiryAttachmentMarkup = function(inquiryId) {
  return `<section class="mt-4 p-3 border rounded-lg bg-gray-50" data-inquiry-attachments="${inquiryId}">
    <div class="font-semibold mb-2">Images & Excel Attachments</div>
    <input type="file" multiple accept=".jpg,.jpeg,.png,.webp,.xlsx,.xls,.csv" class="block w-full text-sm mb-2" aria-label="Add inquiry attachments">
    <button type="button" class="px-3 py-2 rounded bg-blue-600 text-white text-sm" onclick="inquiryAttachmentAddFromPanel(this)">Upload files</button>
    <p class="text-xs text-gray-500 mt-1">Up to 5 files per upload, 4 MB each</p>
    <div class="attachment-list mt-2 text-sm">Loading attachments...</div>
  </section>`;
};
window.inquiryAttachmentRefresh = async function(inquiryId) {
  const panel = document.querySelector('[data-inquiry-attachments="' + inquiryId + '"]');
  if (!panel) return;
  const list = panel.querySelector('.attachment-list');
  try {
    const response = await fetch('/api/inquiries/' + encodeURIComponent(inquiryId) + '/attachments');
    if (!response.ok) throw new Error('Could not load attachments');
    const result = await response.json();
    list.replaceChildren();
    if (!result.data.length) { list.textContent = 'No attachments yet'; return; }
    result.data.forEach(file => {
      const line = document.createElement('div'); line.className = 'py-1 flex gap-3 items-center';
      const link = document.createElement('a'); link.className = 'text-blue-700 underline break-all';
      link.textContent = file.filename + ' (' + Math.round(file.size / 1024) + ' KB)';
      link.href = '/api/inquiries/' + encodeURIComponent(inquiryId) + '/attachments/' + encodeURIComponent(file._id) + '/download';
      const del = document.createElement('button'); del.type = 'button'; del.className = 'text-red-600 text-xs'; del.textContent = 'Delete';
      del.onclick = async () => {
        if (!confirm('Delete this attachment?')) return;
        const r = await fetch('/api/inquiries/' + encodeURIComponent(inquiryId) + '/attachments/' + encodeURIComponent(file._id), { method: 'DELETE' });
        if (!r.ok) { alert('Not authorized or unable to delete'); return; }
        inquiryAttachmentRefresh(inquiryId);
      };
      line.append(link, del); list.append(line);
    });
  } catch (e) { list.textContent = e.message; }
};
window.inquiryAttachmentAddFromPanel = async function(button) {
  const panel = button.closest('[data-inquiry-attachments]');
  button.disabled = true;
  try { await inquiryAttachmentUpload(panel.dataset.inquiryAttachments, panel.querySelector('input[type=file]')); await inquiryAttachmentRefresh(panel.dataset.inquiryAttachments); }
  catch (e) { alert(e.message); } finally { button.disabled = false; }
};
