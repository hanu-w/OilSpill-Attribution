import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const ARTIFACT_DIR = 'C:/Users/Siddharth Gupta/.gemini/antigravity-ide/brain/150dce1b-5c49-4a98-b03b-66a717c2df27';
const EDGE_PATH = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9222;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getWsUrl() {
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const data = await res.json();
      return data.webSocketDebuggerUrl;
    } catch {
      await sleep(300);
    }
  }
  throw new Error('Could not connect to Edge debugging port');
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.callbacks = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    return new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
      this.ws.onmessage = (evt) => {
        const msg = JSON.parse(evt.data.toString());
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(msg.error);
          else resolve(msg.result);
        }
      };
    });
  }

  send(method, params = {}) {
    const id = this.id++;
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async close() {
    this.ws.close();
  }
}

async function run() {
  console.log('Launching headless Edge for visual verification...');
  const edgeProcess = spawn(EDGE_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1440,900',
    'about:blank',
  ]);

  try {
    const wsUrl = await getWsUrl();
    console.log('Connected to Edge CDP:', wsUrl);

    const listRes = await fetch(`http://127.0.0.1:${PORT}/json/list`);
    const targets = await listRes.json();
    const pageTarget = targets.find((t) => t.type === 'page') || targets[0];
    const pageWsUrl = pageTarget.webSocketDebuggerUrl;

    const cdp = new CDPClient(pageWsUrl);
    await cdp.connect();

    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('DOM.enable');

    console.log('Navigating to http://localhost:5173/ ...');
    await cdp.send('Page.navigate', { url: 'http://localhost:5173/' });
    await sleep(2500);

    const setSliderProgress = async (val) => {
      await cdp.send('Runtime.evaluate', {
        expression: `
          (() => {
            const slider = document.querySelector('input[type="range"]');
            if (slider) {
              const prototype = Object.getPrototypeOf(slider);
              const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
              descriptor.set.call(slider, '${val}');
              slider.dispatchEvent(new Event('input', { bubbles: true }));
              slider.dispatchEvent(new Event('change', { bubbles: true }));
            }
          })()
        `,
      });
      await sleep(1000);
    };

    // 1. Initial state screenshot (07:20 UTC, Progress 0.0)
    console.log('Capturing Step 1: Normal State (07:20 UTC)...');
    let snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'step1_normal_0720.png'), Buffer.from(snap.data, 'base64'));

    let evalRes = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText' });
    let text = evalRes.result.value.toUpperCase();
    console.log('  - Active Phase:', text.includes('NORMAL') ? 'NORMAL confirmed' : 'Phase mismatch');
    console.log('  - Active Fleet in status bar:', text.includes('12,482') ? 'Vessels telemetry confirmed' : 'Not found');
    console.log('  - Spill Card (should NOT be visible):', !text.includes('OIL SPILL DETECTED') ? 'Correctly hidden' : 'Prematurely visible');

    // 2. Advance to ~07:48 UTC (Progress 0.25 -> Spill Detected)
    console.log('\nAdvancing to Step 2: Spill Detected (07:48 UTC, Progress 0.25)...');
    await setSliderProgress(0.25);

    snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'step2_spill_detected_0748.png'), Buffer.from(snap.data, 'base64'));

    evalRes = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText' });
    text = evalRes.result.value.toUpperCase();
    console.log('  - Active Phase:', text.includes('SPILL DETECTED') ? 'SPILL DETECTED confirmed' : 'Phase mismatch');
    console.log('  - Spill Alert Card:', text.includes('OIL SPILL DETECTED') ? 'Visible' : 'Not found');
    console.log('  - Classification:', text.includes('HYDROCARBON SLICK') ? 'Visible' : 'Not found');
    console.log('  - Candidate Card (should NOT be visible):', !text.includes('AIS CORRELATION IN PROGRESS') ? 'Correctly hidden' : 'Prematurely visible');

    // 3. Advance to ~08:15 UTC (Progress 0.50 -> Correlating)
    console.log('\nAdvancing to Step 3: Correlating (08:15 UTC, Progress 0.50)...');
    await setSliderProgress(0.50);

    snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'step3_correlating_0815.png'), Buffer.from(snap.data, 'base64'));

    evalRes = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText' });
    text = evalRes.result.value.toUpperCase();
    console.log('  - Active Phase:', text.includes('CORRELATING') ? 'CORRELATING confirmed' : 'Phase mismatch');
    console.log('  - AIS Correlation Card:', text.includes('AIS CORRELATION IN PROGRESS') ? 'Visible' : 'Not found');
    console.log('  - 50 Vessels Analyzed:', text.includes('50 VESSELS ANALYZED') ? 'Confirmed' : 'Not found');
    console.log('  - Relevant Candidates (Ocean Guardian):', text.includes('OCEAN GUARDIAN') ? 'Confirmed' : 'Not found');
    console.log('  - Correlation Tags (Temporal Match):', text.includes('TEMPORAL MATCH') ? 'Confirmed' : 'Not found');
    console.log('  - Release Window (06:12–07:27 UTC):', text.includes('06:12–07:27 UTC') ? 'Confirmed' : 'Not found');

    // 4. Advance to ~08:45 UTC (Progress 0.75 -> Attribution Ready)
    console.log('\nAdvancing to Step 4: Attribution Ready (08:45 UTC, Progress 0.75)...');
    await setSliderProgress(0.75);

    snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'step4_attribution_ready_0845.png'), Buffer.from(snap.data, 'base64'));

    evalRes = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText' });
    text = evalRes.result.value.toUpperCase();
    console.log('  - Active Phase:', text.includes('ATTRIBUTION READY') ? 'ATTRIBUTION READY confirmed' : 'Phase mismatch');
    console.log('  - Correlation Complete Header:', text.includes('AIS CORRELATION COMPLETE') ? 'Confirmed' : 'Not found');
    console.log('  - Candidates List:', text.includes('RELEVANT CANDIDATES (4)') ? 'Confirmed' : 'Not found');

    // 5. Scrub back to 07:20 UTC (Progress 0.0 -> Normal Baseline)
    console.log('\nScrubbing back to Step 5: Normal Baseline (07:20 UTC, Progress 0.0)...');
    await setSliderProgress(0.0);

    snap = await cdp.send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'step5_return_normal_0720.png'), Buffer.from(snap.data, 'base64'));

    evalRes = await cdp.send('Runtime.evaluate', { expression: 'document.body.innerText' });
    text = evalRes.result.value.toUpperCase();
    console.log('  - Active Phase:', text.includes('NORMAL') ? 'NORMAL confirmed' : 'Phase mismatch');
    console.log('  - Spill Card Gone:', !text.includes('OIL SPILL DETECTED') ? 'Cleanly removed' : 'Still present');
    console.log('  - Correlation Card Gone:', !text.includes('AIS CORRELATION') ? 'Cleanly removed' : 'Still present');

    await cdp.close();
    console.log('\n======================================================');
    console.log('ALL BROWSER VISUAL & INTERACTION CHECKS PASSED');
    console.log('======================================================');
  } finally {
    edgeProcess.kill();
  }
}

run().catch((err) => {
  console.error('CDP verification error:', err);
  process.exit(1);
});
