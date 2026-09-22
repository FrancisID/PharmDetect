
  import { Capacitor } from '@capacitor/core';
  import { BarcodeScanner, BarcodeFormat } from '@capacitor-mlkit/barcode-scanning';
  import { Geolocation } from '@capacitor/geolocation';

  // Edit this before deploying so the app works without any manual setup.
  const DEFAULT_API_BASE_URL = 'http://localhost:3000/api';

  let API_BASE_URL = DEFAULT_API_BASE_URL;
  let API_KEY = '';
  let pendingScan = null;
  let history = [];
  let stream = null, webScanning = false;

  const $ = id => document.getElementById(id);
  const isNative = Capacitor.isNativePlatform();

  // ---------- scan engine badge ----------
  $('engine-badge').textContent = isNative
    ? 'Scan engine: native ML Kit (on-device)'
    : 'Scan engine: jsQR (browser)';

  // ---------- API helpers ----------
  function apiHeaders(){
    const h = { 'Content-Type': 'application/json' };
    if (API_KEY) h['x-api-key'] = API_KEY;
    return h;
  }
  async function apiPost(path, body){
    const res = await fetch(API_BASE_URL + path, { method: 'POST', headers: apiHeaders(), body: JSON.stringify(body) });
    let data = null;
    try { data = await res.json(); } catch(e) {}
    if (!res.ok && res.status !== 409) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return { ok: res.ok, status: res.status, data };
  }
  async function checkConnection(){
    const badge = $('conn-badge'), text = $('conn-text');
    try{
      const res = await fetch(API_BASE_URL.replace(/\/api\/?$/, '/api/health'));
      if(!res.ok) throw new Error('bad status');
      badge.classList.remove('offline');
      text.textContent = 'Connected to Pharmaceutical Database';
    }catch(e){
      badge.classList.add('offline');
      text.textContent = 'Not connected — check the API URL below';
    }
  }

  function showToast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
  function nowStamp(){ return new Date().toLocaleString(); }

  // ---------- GPS: native Geolocation plugin on-device, browser API in web ----------
  async function requestGps(){
    try{
      if (isNative){
        const perm = await Geolocation.requestPermissions();
        if (perm.location === 'granted' || perm.coarseLocation === 'granted'){
          const pos = await Geolocation.getCurrentPosition();
          $('f-gps').value = pos.coords.latitude.toFixed(4) + ', ' + pos.coords.longitude.toFixed(4);
          return;
        }
      } else if (navigator.geolocation){
        navigator.geolocation.getCurrentPosition(
          pos => { $('f-gps').value = pos.coords.latitude.toFixed(4)+', '+pos.coords.longitude.toFixed(4); },
          () => {}, { timeout: 4000 }
        );
        return;
      }
    }catch(e){ /* fall through to default */ }
    if(!$('f-gps').value) $('f-gps').value = '23.5859, 58.4059';
  }
  requestGps();

  function showBanner(bannerClass, status, detail, { showConfirm } = {}){
    $('result-banner').className = 'result-banner show ' + bannerClass;
    $('result-status').textContent = status;
    $('result-detail').textContent = detail;
    $('result-empty').style.display = 'none';
    $('confirm-row').style.display = showConfirm ? 'flex' : 'none';
  }

  function renderHistory(){
    const body = $('history-body'); body.innerHTML='';
    $('history-empty').style.display = history.length ? 'none' : 'block';
    history.slice().reverse().forEach(h=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td class="mono">${h.productId}</td><td><span class="pill ${h.pillClass}">${h.status}</span></td><td class="mono">${h.time}</td>`;
      body.appendChild(tr);
    });
  }

  async function runScan(productId){
    productId = String(productId).trim();
    if(!productId){ showToast('Scan or enter a Product ID first.'); return; }
    pendingScan = null;
    const gps = $('f-gps').value.trim() || '23.5859, 58.4059';

    let result;
    try{
      const { data } = await apiPost('/scan', { productId, gps });
      result = data;
    }catch(err){
      showToast('Could not reach the Pharmaceutical Database: ' + err.message);
      return;
    }

    if(result.status === 'PENDING_PURCHASE'){
      pendingScan = { productId, gps };
      showBanner('pending', 'ORIGINAL', 'This medication is genuine and unsold. Do you want to buy it?', { showConfirm: true });
    } else if (result.status === 'EXPIRED'){
      showBanner('expired', 'EXPIRED — DO NOT BUY', result.reason);
      history.push({ productId, status: 'EXPIRED', pillClass:'expired', time: nowStamp() });
      renderHistory();
    } else {
      showBanner('counterfeit', 'COUNTERFEIT — DO NOT BUY', result.reason);
      history.push({ productId, status: 'COUNTERFEIT', pillClass:'counterfeit', time: nowStamp() });
      renderHistory();
    }
  }

  $('btn-buy').addEventListener('click', async ()=>{
    if(!pendingScan) return;
    const { productId, gps } = pendingScan;
    try{
      const { ok, data } = await apiPost('/purchase', { productId, gps });
      if(ok && data.status === 'ORIGINAL'){
        showBanner('original', 'PURCHASE CONFIRMED', 'The Pharmaceutical Database has been updated with the sale date and location.');
        history.push({ productId, status: 'ORIGINAL (purchased)', pillClass:'original', time: nowStamp() });
        showToast('Purchase confirmed — Pharmaceutical Database updated.');
      } else {
        showBanner('counterfeit', 'COUNTERFEIT — DO NOT BUY', data.reason || 'This medication was already sold moments ago.');
        history.push({ productId, status: 'COUNTERFEIT', pillClass:'counterfeit', time: nowStamp() });
        showToast('Too late — this medication was just confirmed sold elsewhere.');
      }
    }catch(err){
      showToast('Could not reach the Pharmaceutical Database: ' + err.message);
    }
    pendingScan = null;
    renderHistory();
  });

  $('btn-dont-buy').addEventListener('click', ()=>{
    if(!pendingScan) return;
    history.push({ productId: pendingScan.productId, status:'ORIGINAL (not purchased)', pillClass:'original', time: nowStamp() });
    showBanner('pending', 'NOT PURCHASED', 'No action taken. This medication remains available for a future buyer.');
    pendingScan = null;
    renderHistory();
  });

  $('btn-manual-scan').addEventListener('click', ()=> runScan($('f-manual').value));

  $('btn-save-conn').addEventListener('click', ()=>{
    const url = $('f-api-url').value.trim();
    API_BASE_URL = (url || DEFAULT_API_BASE_URL).replace(/\/$/, '');
    API_KEY = $('f-api-key').value.trim();
    checkConnection();
    showToast('Connection settings saved for this session.');
  });

  // ---------- SCAN ENGINE ----------
  // Native platforms (the packaged iOS/Android app): use @capacitor-mlkit/barcode-scanning,
  // a dedicated on-device ML Kit decoder. This does NOT depend on the phone's stock
  // camera app having any QR-reading feature — it processes the live camera feed itself,
  // the same way jsQR does in the browser, just faster and more reliably on-device.
  async function startNativeScan(){
    try{
      const { camera } = await BarcodeScanner.requestPermissions();
      if (camera !== 'granted' && camera !== 'limited'){
        showToast('Camera permission is required to scan.');
        return;
      }
      $('scan-btn-label').textContent = 'Scanning…';
      const { barcodes } = await BarcodeScanner.scan({ formats: [BarcodeFormat.QrCode] });
      $('scan-btn-label').textContent = 'Scan';
      if (barcodes && barcodes.length > 0){
        const value = barcodes[0].rawValue || barcodes[0].displayValue;
        $('f-manual').value = value;
        runScan(value);
      } else {
        showToast('No QR code detected.');
      }
    }catch(err){
      $('scan-btn-label').textContent = 'Scan';
      showToast('Native scan failed: ' + err.message);
    }
  }

  // Web/browser fallback (used automatically outside the packaged app, e.g. while
  // testing in a desktop or mobile browser): getUserMedia + jsQR, exactly as before.
  const video = $('video'), canvas = $('canvas'), ctx = canvas.getContext('2d');
  async function startWebScan(){
    try{
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      video.srcObject = stream; video.style.display='block';
      $('scan-placeholder').style.display='none'; $('scan-frame').style.display='block';
      video.play(); webScanning = true; $('scan-btn-label').textContent='Stop scan';
      requestAnimationFrame(webTick); requestGps();
    }catch(e){ showToast('Camera unavailable — use upload or manual entry instead.'); }
  }
  function stopWebScan(){
    webScanning=false;
    if(stream){ stream.getTracks().forEach(t=>t.stop()); stream=null; }
    video.style.display='none'; $('scan-frame').style.display='none';
    $('scan-placeholder').style.display='block'; $('scan-btn-label').textContent='Scan';
  }
  function webTick(){
    if(!webScanning) return;
    if(video.readyState === video.HAVE_ENOUGH_DATA){
      canvas.width=video.videoWidth; canvas.height=video.videoHeight;
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if(code && code.data){ stopWebScan(); $('f-manual').value = code.data; runScan(code.data); return; }
    }
    requestAnimationFrame(webTick);
  }

  $('btn-camera').addEventListener('click', ()=>{
    if (isNative){
      startNativeScan();
    } else {
      webScanning ? stopWebScan() : startWebScan();
    }
  });

  // upload fallback — works identically on native and web, decoded with jsQR
  $('btn-upload-trigger').addEventListener('click', ()=> $('file-upload').click());
  $('file-upload').addEventListener('change', e=>{
    const file = e.target.files[0]; if(!file) return;
    const isHeic = /\.hei[cf]$/i.test(file.name) || /heic|heif/i.test(file.type);
    if(isHeic){ showToast('HEIC photos often can\'t be read here — try JPG/PNG, or use Scan instead.'); }
    const img = new Image();
    img.onload = ()=>{
      canvas.width=img.width; canvas.height=img.height; ctx.drawImage(img,0,0);
      const imageData = ctx.getImageData(0,0,canvas.width,canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' });
      if(code && code.data){ $('f-manual').value = code.data; runScan(code.data); }
      else showToast(`No QR code detected in that ${img.width}×${img.height} image.`);
    };
    img.onerror = ()=> showToast('This browser could not open that image file.');
    img.src = URL.createObjectURL(file);
  });

  $('f-api-url').value = DEFAULT_API_BASE_URL;
  checkConnection();
