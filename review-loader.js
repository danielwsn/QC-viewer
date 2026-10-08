'use strict';
(() => {
  const $ = id => document.getElementById(id);
  const manifest = window.REVIEW_MANIFEST;
  const main = document.querySelector('main');
  const retry = $('reviewRetry');
  let timer;
  const controller = new AbortController();
  const received = new Map();
  const setMessage = text => { $('reviewLoadingMessage').textContent = text; };
  retry.addEventListener('click', () => location.reload());

  async function loadData(item) {
    const response = await fetch(item.url, {signal: controller.signal});
    if (!response.ok) throw new Error('The geometry download failed. Please check your connection and try again.');
    const reader = response.body.getReader();
    const chunks = [];
    let size = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
      received.set(item.url, size);
      const total = manifest.datasets.reduce((n, d) => n + d.bytes, 0);
      const loaded = [...received.values()].reduce((a, b) => a + b, 0);
      const percent = Math.min(100, Math.round(loaded / total * 100));
      $('reviewLoadingProgress').value = percent;
      setMessage('Downloading geometry data: ' + percent + '%');
    }
    if (size !== item.bytes) throw new Error('The geometry download was incomplete. Please try again.');
    const bytes = await new Response(new Blob(chunks).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
    if (bytes.byteLength !== item.decodedBytes) throw new Error('The geometry data could not be verified. Please try again.');
    const sha = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
    if (sha !== item.sha256) throw new Error('The geometry data could not be verified. Please try again.');
    window[item.variable] = JSON.parse(new TextDecoder().decode(bytes));
  }

  function loadScript(file) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = file + '?v=' + manifest.version;
      script.onload = resolve;
      script.onerror = () => reject(new Error('A viewer file could not be loaded. Please try again.'));
      document.head.appendChild(script);
    });
  }

  async function start() {
    try {
      if (!manifest) throw new Error('The viewer files could not be loaded. Please try again.');
      if (!window.DecompressionStream || !window.crypto?.subtle) {
        throw new Error('Please use a current version of Chrome, Edge, Firefox or Safari, or download the offline version below.');
      }
      timer = setTimeout(() => {
        setMessage('The download is taking longer than usual. You can keep waiting or try again.');
        retry.hidden = false;
      }, 45000);
      await Promise.all(manifest.datasets.map(loadData));
      clearTimeout(timer);
      retry.hidden = true;
      setMessage('Preparing the views…');
      for (const file of manifest.scripts) await loadScript(file);
      if (!window.CoveringApp) throw new Error('The viewer could not start. Please try again or download the offline version.');
      main.inert = false;
      main.removeAttribute('aria-busy');
      $('reviewLoading').hidden = true;
      window.dispatchEvent(new Event('reviewready'));
    } catch (error) {
      clearTimeout(timer);
      controller.abort();
      $('reviewLoadingTitle').textContent = 'The viewer could not load';
      setMessage(error.message || 'Please check your connection and try again.');
      $('reviewLoadingProgress').hidden = true;
      retry.hidden = false;
    }
  }
  start();
})();
