import flow from './flow.js';
import { buildHtmlReport } from './report.js';

function envNum(name, def) {
  const v = Number(__ENV[name]);
  return Number.isFinite(v) ? v : def;
}

function envStr(name, def) {
  const v = __ENV[name];
  return v == null || v === '' ? def : String(v);
}

const CI = String(__ENV.CI || '').toLowerCase() === 'true';
const TARGET_RPS = envNum('RPS', CI ? 50 : 250);
if (CI && (__ENV.RPS_TOLERANCE == null || __ENV.RPS_TOLERANCE === '')) __ENV.RPS_TOLERANCE = '0.10';
const PRE_VUS = envNum('PRE_VUS', CI ? 300 : 1500);
const MAX_VUS = envNum('MAX_VUS', CI ? 900 : 3000);

// Spike shape kept short for CI by default.
const WARMUP = envStr('WARMUP', CI ? '10s' : '30s');
const RAMP_UP = envStr('RAMP_UP', CI ? '5s' : '10s');
const HOLD = envStr('HOLD', CI ? '20s' : '2m');
const RAMP_DOWN = envStr('RAMP_DOWN', CI ? '5s' : '10s');

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(90)<2000'],
    checks: ['rate>0.99'],
  },
  scenarios: {
    spike: {
      executor: 'ramping-arrival-rate',
      timeUnit: '1s',
      preAllocatedVUs: PRE_VUS,
      maxVUs: MAX_VUS,
      gracefulStop: '30s',
      stages: [
        { target: Math.max(1, Math.round(TARGET_RPS * 0.2)), duration: WARMUP },
        { target: TARGET_RPS, duration: RAMP_UP },
        { target: TARGET_RPS, duration: HOLD },
        { target: Math.max(1, Math.round(TARGET_RPS * 0.2)), duration: RAMP_DOWN },
        { target: 0, duration: '5s' },
      ],
    },
  },
  tags: { app: 'blazedemo', test_type: 'spike' },
  userAgent: 'k6-performance-test (blazedemo)',
  noConnectionReuse: false,
};

export default flow;

export function handleSummary(data) {
  const html = buildHtmlReport({
    title: 'BlazeDemo — Relatório (Spike)',
    data,
    targetRps: TARGET_RPS,
  });

  const outDir = envStr('REPORT_DIR', 'reports');
  return {
    [`${outDir}/spike-report.html`]: html,
    stdout: `Relatório HTML gerado em ${outDir}/spike-report.html\n`,
  };
}

