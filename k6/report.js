function fmtMs(ms) {
  if (ms == null || Number.isNaN(ms)) return '-';
  if (ms < 1000) return `${ms.toFixed(0)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function fmtPct(v) {
  if (v == null || Number.isNaN(v)) return '-';
  return `${(v * 100).toFixed(2)}%`;
}

function getMetric(data, metricName) {
  if (!data || !data.metrics) return null;
  return data.metrics[metricName] || null;
}

function getMetricValue(data, metricName, stat) {
  const m = getMetric(data, metricName);
  if (!m) return null;

  // handleSummary format: metric.values["p(90)"], metric.values.rate, etc.
  if (m.values && Object.prototype.hasOwnProperty.call(m.values, stat)) return m.values[stat];

  // summary-export-like fallback (rare in handleSummary)
  if (Object.prototype.hasOwnProperty.call(m, stat)) return m[stat];

  return null;
}

function getThresholdOk(metric) {
  const thresholds = metric?.thresholds;
  if (!thresholds) return null;
  const keys = Object.keys(thresholds);
  if (keys.length === 0) return null;
  // if any threshold is false => fail
  return keys.every((k) => thresholds[k] === true);
}

export function buildHtmlReport({ title, data, targetRps }) {
  const p90 = getMetricValue(data, 'http_req_duration', 'p(90)');
  const httpFailRate = getMetricValue(data, 'http_req_failed', 'rate');
  const dropped = getMetricValue(data, 'dropped_iterations', 'count') ?? 0;
  const iterRate = getMetricValue(data, 'iterations', 'rate');
  const httpRps = getMetricValue(data, 'http_reqs', 'rate');
  const checkRate = getMetricValue(data, 'checks', 'rate');

  const p90Ok = p90 != null ? p90 < 2000 : null;
  const failOk = httpFailRate != null ? httpFailRate < 0.01 : null;
  const checksOk = checkRate != null ? checkRate > 0.99 : null;

  const tolerance = typeof __ENV !== 'undefined' && __ENV.RPS_TOLERANCE != null ? Number(__ENV.RPS_TOLERANCE) : 0.02;
  const tol = Number.isFinite(tolerance) ? tolerance : 0.02;
  const rpsOk =
    iterRate != null && targetRps != null ? iterRate >= targetRps * (1 - tol) : null;

  const accepted =
    (p90Ok ?? false) &&
    (failOk ?? false) &&
    (checksOk ?? false) &&
    (rpsOk ?? true);

  const reasons = [];
  if (p90Ok === false) reasons.push(`p90 de http_req_duration acima de 2s (${fmtMs(p90)})`);
  if (rpsOk === false)
    reasons.push(
      `vazão do cenário abaixo do alvo (${iterRate?.toFixed(2)} it/s vs alvo ${targetRps} it/s)`,
    );
  if (failOk === false) reasons.push(`taxa de falhas HTTP alta (${fmtPct(httpFailRate)})`);
  if (dropped && dropped > 0) reasons.push(`iterações dropadas (${dropped}) — falta de VUs/saturação/latência`);
  if (checksOk === false) reasons.push(`taxa de checks abaixo do esperado (${(checkRate * 100).toFixed(2)}%)`);
  if (reasons.length === 0) reasons.push('métricas dentro dos limites definidos');

  const statusText = accepted ? 'ATENDEU' : 'NÃO ATENDEU';
  const statusClass = accepted ? 'ok' : 'bad';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title}</title>
  <style>
    :root { --bg:#0b1220; --card:#121a2b; --text:#e6edf3; --muted:#9fb0c0; --ok:#2ecc71; --bad:#ff5c5c; --warn:#f1c40f; }
    body { margin:0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; background:var(--bg); color:var(--text); }
    .wrap { max-width: 980px; margin: 0 auto; padding: 28px 18px 42px; }
    .h1 { font-size: 22px; font-weight: 700; margin: 0 0 8px; }
    .sub { color: var(--muted); margin: 0 0 18px; }
    .grid { display:grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .card { background: var(--card); border: 1px solid rgba(255,255,255,.06); border-radius: 12px; padding: 14px 14px; }
    .k { color: var(--muted); font-size: 12px; margin-bottom: 6px; }
    .v { font-size: 18px; font-weight: 700; }
    .status { display:inline-block; padding: 6px 10px; border-radius: 999px; font-weight: 800; letter-spacing: .3px; }
    .status.ok { background: rgba(46,204,113,.15); color: var(--ok); border: 1px solid rgba(46,204,113,.35); }
    .status.bad { background: rgba(255,92,92,.12); color: var(--bad); border: 1px solid rgba(255,92,92,.35); }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
    ul { margin: 10px 0 0 18px; color: var(--text); }
    .hr { height:1px; background: rgba(255,255,255,.06); margin: 16px 0; }
    @media (max-width: 800px) { .grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="h1">${title}</div>
    <p class="sub">Resultado: <span class="status ${statusClass}">${statusText}</span></p>

    <div class="grid">
      <div class="card">
        <div class="k">Critério</div>
        <div class="v">p90 &lt; 2s em ${targetRps ?? '-'} it/s</div>
      </div>
      <div class="card">
        <div class="k">p90 http_req_duration</div>
        <div class="v mono">${fmtMs(p90)}</div>
      </div>
      <div class="card">
        <div class="k">Vazão do cenário (iterations/s)</div>
        <div class="v mono">${iterRate != null ? iterRate.toFixed(2) : '-'}</div>
      </div>
      <div class="card">
        <div class="k">RPS HTTP agregado (http_reqs/s)</div>
        <div class="v mono">${httpRps != null ? httpRps.toFixed(2) : '-'}</div>
      </div>
      <div class="card">
        <div class="k">Falhas HTTP (http_req_failed)</div>
        <div class="v mono">${fmtPct(httpFailRate)}</div>
      </div>
      <div class="card">
        <div class="k">Dropped iterations</div>
        <div class="v mono">${dropped ?? 0}</div>
      </div>
    </div>

    <div class="hr"></div>

    <div class="card">
      <div class="k">Conclusão</div>
      <div class="v">${accepted ? 'Critério de aceitação satisfeito.' : 'Critério de aceitação NÃO foi satisfeito.'}</div>
      <ul>
        ${reasons.map((r) => `<li>${r}</li>`).join('\n')}
      </ul>
    </div>

    <div class="hr"></div>

    <div class="card">
      <div class="k">Observações</div>
      <div style="color: var(--muted); line-height: 1.45;">
        Este relatório foi gerado automaticamente pelo <span class="mono">handleSummary()</span> do k6 a partir do summary em memória.
        Para auditoria completa, use também o <span class="mono">--summary-export</span> (JSON).
      </div>
    </div>
  </div>
</body>
</html>`;
}

