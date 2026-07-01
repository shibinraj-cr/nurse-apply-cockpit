const $ = (id) => document.getElementById(id);

chrome.storage.local.get(['cockpitUrl', 'driverToken'], (v) => {
  $('cockpitUrl').value = v.cockpitUrl || 'https://nurse-apply-cockpit.vercel.app';
  $('driverToken').value = v.driverToken || '';
});

$('save').addEventListener('click', () => {
  const cockpitUrl = $('cockpitUrl').value.trim().replace(/\/$/, '');
  const driverToken = $('driverToken').value.trim();
  chrome.storage.local.set({ cockpitUrl, driverToken }, () => {
    $('status').textContent = 'Saved ✓';
    setTimeout(() => ($('status').textContent = ''), 1500);
  });
});
