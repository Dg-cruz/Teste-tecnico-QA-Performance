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
const TARGET_RPS = envNum('RPS', CI ? 25 : 250);
// In CI we allow a bit more scheduler drift on arrival-rate.
if (CI && (__ENV.RPS_TOLERANCE == null || __ENV.RPS_TOLERANCE === '')) __ENV.RPS_TOLERANCE = '0.10';
const DURATION = envStr('DURATION', CI ? '30s' : '5m');
const PRE_VUS = envNum('PRE_VUS', CI ? 200 : 1200);
const MAX_VUS = envNum('MAX_VUS', CI ? 600 : 3000);

export const options = {
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(90)<2000'],
    checks: ['rate>0.99'],
  },
  scenarios: {
    load: {
      executor: 'constant-arrival-rate',
      rate: TARGET_RPS,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_VUS,
      maxVUs: MAX_VUS,
      gracefulStop: '30s',
    },
  },
  tags: { app: 'blazedemo', test_type: 'load' },
  userAgent: 'k6-performance-test (blazedemo)',
  noConnectionReuse: false,
};

export default flow;

export function handleSummary(data) {
  const html = buildHtmlReport({
    title: 'BlazeDemo — Relatório (Load)',
    data,
    targetRps: TARGET_RPS,
  });

  const outDir = envStr('REPORT_DIR', 'reports');
  return {
    [`${outDir}/load-report.html`]: html,
    // keep a compact text on stdout
    stdout: `Relatório HTML gerado em ${outDir}/load-report.html\n`,
  };
}

