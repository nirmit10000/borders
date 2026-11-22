// Start the app. On the published site a <meta name="borders-cdn"> names jsDelivr's mirror of the
// published commit: the app's modules load from there (fast where github.io is slow). If they cannot be
// fetched, the same modules load from this site. Locally there is no meta, so they load from here.
const cdn = document.querySelector('meta[name="borders-cdn"]')?.content || '';
if (cdn) {
  try {
    await import(`${cdn}js/main.js`);
  } catch (e) {
    // a fetch failure rejects before any module runs, so starting again from this site is safe
    if (/fetch|import|load/i.test(String(e && e.message))) {
      console.warn('mirror unavailable, loading the app from the site', e);
      await import('./main.js');
    } else throw e;
  }
} else {
  await import('./main.js');
}
