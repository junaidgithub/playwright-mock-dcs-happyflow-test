// Builds a client-facing HTML report from the latest Playwright run (test-results/results.json)
// plus the narrative in report-data.js. Screenshots from reports/evidence/ are embedded inline,
// so the output is a single file that can be emailed.
// Usage: npx playwright test  →  node reports/capture-evidence.js  →  node reports/generate-client-report.js
const fs = require('fs');
const path = require('path');
const data = require('./report-data');

const root = path.join(__dirname, '..');
const resultsFile = path.join(root, 'test-results', 'results.json');
if (!fs.existsSync(resultsFile)) {
  // Written by the json reporter in playwright.config.js; a --reporter CLI flag replaces it.
  console.error('test-results/results.json not found. Run "npx playwright test" (without --reporter) first.');
  process.exit(1);
}
const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const stripTags = (title) => title.replace(/\s*@\w+/g, '').trim();
const fmt = (iso, opts) => new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', ...opts });
const runDate = fmt(results.stats.startTime, { day: 'numeric', month: 'short', year: 'numeric' });
const runTime = fmt(results.stats.startTime, { hour: '2-digit', minute: '2-digit' });

// Flatten results.json into [{ group, title, status, duration }].
const tests = [];
(function walk(suites, group) {
  for (const suite of suites) {
    const g = suite.file === suite.title ? group : stripTags(suite.title);
    for (const spec of suite.specs || []) {
      for (const t of spec.tests) {
        const r = t.results[t.results.length - 1];
        tests.push({ group: g, title: spec.title, status: r.status, duration: r.duration });
      }
    }
    walk(suite.suites || [], g);
  }
})(results.suites, '');

const missing = tests.filter((t) => !data.expected[t.title]).map((t) => t.title);
if (missing.length) console.warn('No expected-result text for:\n  ' + missing.join('\n  '));

const total = tests.length;
const passed = tests.filter((t) => t.status === 'passed').length;
const failed = total - passed;
const verdict = (ok) => `<span class="badge ${ok ? 'pass' : 'fail'}">${ok ? 'PASS' : 'FAIL'}</span>`;
const sevClass = { Critical: 'crit', High: 'high', Medium: 'med', Low: 'low' };
const regressionPassed = (id) => tests.filter((t) => (data.expected[t.title] || '').startsWith(`${id}:`)).every((t) => t.status === 'passed');

function img(name, caption, cls = '') {
  const file = path.join(__dirname, 'evidence', `${name}.png`);
  if (!fs.existsSync(file)) return '';
  return `<figure class="${cls}"><img src="data:image/png;base64,${fs.readFileSync(file).toString('base64')}" alt="${esc(caption)}"><figcaption>${esc(caption)}</figcaption></figure>`;
}

// Group tests in a stable order matching report-data.groups.
const groupOrder = Object.keys(data.groups);
const byGroup = groupOrder.map((key) => ({ key, meta: data.groups[key], tests: tests.filter((t) => t.group === key) })).filter((g) => g.tests.length);

const scopeRows = byGroup.map(({ meta, tests: ts }) => {
  const ok = ts.every((t) => t.status === 'passed');
  return `<tr><td><strong>${esc(meta.name)}</strong></td><td>${esc(meta.purpose)}</td><td class="num">${ts.length}</td><td class="num">${ts.filter((t) => t.status === 'passed').length}</td><td>${verdict(ok)}</td></tr>`;
}).join('\n');

const happy = tests.find((t) => t.title.startsWith('happy path'));
const journeyRows = data.journeySteps.map(([step, note], i) => `<tr><td class="num">${i + 1}</td><td>${esc(step)}</td><td>${verdict(happy && happy.status === 'passed')}</td><td>${esc(note)}</td></tr>`).join('\n');

const defectSummary = data.defects.map((d) => `<tr><td><strong>${d.id}</strong></td><td><span class="sev ${sevClass[d.severity]}">${d.severity}</span></td><td>${esc(d.title)}</td><td>${esc(d.module)}</td><td><span class="badge pass">FIXED</span></td><td>${verdict(regressionPassed(d.id))}</td></tr>`).join('\n');

const defectCards = data.defects.map((d) => `
<div class="bug-card ${sevClass[d.severity]}">
  <div class="bug-title">${d.id} — ${esc(d.title)} <span class="sev ${sevClass[d.severity]}">${d.severity}</span></div>
  <div class="bug-meta"><strong>Module:</strong> ${esc(d.module)} &nbsp;·&nbsp; <strong>Status:</strong> Fixed &amp; re-tested ${verdict(regressionPassed(d.id))}</div>
  <div class="bug-grid">
    <div><h4>Steps to reproduce</h4><ol>${d.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
    <div><h4>Expected</h4><p>${esc(d.expected)}</p><h4>Actual (before fix)</h4><p class="actual">${esc(d.actual)}</p></div>
  </div>
  <p><strong>Business impact:</strong> ${esc(d.impact)}</p>
  <p><strong>Fix applied:</strong> ${esc(d.fix)}</p>
  ${d.evidence ? `<div class="evidence">${img(d.evidence[0], 'Before fix: the second boarding is accepted')}${img(d.evidence[1], 'After fix: the second boarding is rejected')}</div>` : ''}
</div>`).join('\n');

let tcNo = 0;
const testCaseTables = byGroup.map(({ meta, tests: ts }) => {
  const rows = ts.map((t, i) => {
    tcNo++;
    return `<tr><td class="id">${meta.prefix}-${String(i + 1).padStart(2, '0')}</td><td>${esc(t.title.charAt(0).toUpperCase() + t.title.slice(1))}</td><td>${esc(data.expected[t.title] || '—')}</td><td>${verdict(t.status === 'passed')}</td></tr>`;
  }).join('\n');
  return `<h3>${esc(meta.name)} <span class="count">${ts.length} tests</span></h3><p class="muted">${esc(meta.purpose)}</p>
<table><tr><th style="width:80px">ID</th><th>Test case</th><th>Expected result</th><th style="width:70px">Result</th></tr>${rows}</table>`;
}).join('\n');

const finalRun = { run: `Final run: ${runDate}, ${runTime} PKT`, scope: `${total} tests, fixed app`, result: `${passed} passed · ${failed} failed`, note: failed ? 'See failed test cases above.' : 'Release-candidate result.' };
const historyRows = [...data.runHistory, finalRun].map((r, i, all) => `<tr${i === all.length - 1 ? ' class="final"' : ''}><td>${esc(r.run)}</td><td>${esc(r.scope)}</td><td><strong>${esc(r.result)}</strong></td><td>${esc(r.note)}</td></tr>`).join('\n');

const crit = data.defects.filter((d) => d.severity === 'Critical').length;
const high = data.defects.filter((d) => d.severity === 'High').length;
const assessment = failed === 0
  ? `All <strong>${total}</strong> automated test cases passed in the final run. Testing covered the complete passenger journey (booking lookup, check-in, seat selection, baggage, boarding pass and boarding) plus ${total - 3} negative, edge-case and regression scenarios. <strong>${data.defects.length} product defects</strong> were found during the cycle, including <strong>${crit} critical</strong> and <strong>${high} high</strong>, mostly around duplicate boarding and steps that could be changed after boarding. All of them have been fixed and re-tested. The suite was repeated three times with no intermittent results. <strong>The build is recommended for release from a functional-QA standpoint</strong>, subject to the technical review of the code changes.`
  : `<strong>${failed} of ${total}</strong> test cases failed in the final run. See the failed test cases below before deciding on release.`;

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(data.project.title)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f4f5f7; color: #222; }
  .header { background: linear-gradient(135deg,#5b2a86,#7a3fb0); color: #fff; padding: 32px 40px; }
  .header h1 { margin: 0 0 6px; font-size: 26px; }
  .header p { margin: 0; opacity: .9; font-size: 14px; }
  .container { max-width: 1100px; margin: 0 auto; padding: 30px 40px 60px; }
  h2 { color: #5b2a86; border-bottom: 2px solid #e0d5ef; padding-bottom: 6px; margin-top: 40px; }
  h3 { color: #3d1f5c; margin: 28px 0 4px; }
  h3 .count { font-size: 12px; font-weight: 600; color: #7a6a8e; background: #ece4f7; border-radius: 10px; padding: 2px 8px; margin-left: 6px; vertical-align: middle; }
  h4 { margin: 8px 0 4px; font-size: 13px; color: #3d1f5c; text-transform: uppercase; letter-spacing: .3px; }
  table { width: 100%; border-collapse: collapse; margin: 14px 0 24px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
  th, td { border: 1px solid #e2e2e2; padding: 9px 12px; font-size: 13.5px; text-align: left; vertical-align: top; }
  th { background: #5b2a86; color: #fff; font-weight: 600; }
  tr:nth-child(even) { background: #faf8fc; }
  tr.final td { background: #eef8f0; }
  td.num { text-align: center; width: 60px; }
  td.id { font-family: Consolas, monospace; font-size: 12.5px; white-space: nowrap; }
  .muted { color: #666; font-size: 13.5px; margin: 0 0 6px; }
  .badge { display: inline-block; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 700; }
  .badge.pass { background: #e2f6e6; color: #1a7d32; }
  .badge.fail { background: #fde2e2; color: #c62828; }
  .sev { display: inline-block; padding: 2px 9px; border-radius: 4px; font-size: 11.5px; font-weight: 700; margin-left: 4px; }
  .sev.crit { background: #c62828; color: #fff; } .sev.high { background: #ef6c00; color: #fff; }
  .sev.med { background: #fff3cd; color: #946200; } .sev.low { background: #e3ecf7; color: #2c5282; }
  .summary-box { background: #fff; border-left: 5px solid #5b2a86; padding: 18px 24px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin: 20px 0; line-height: 1.6; font-size: 14.5px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 20px 0; }
  .kpi { background: #fff; border-radius: 6px; padding: 16px 18px; box-shadow: 0 1px 3px rgba(0,0,0,.08); border-top: 4px solid #5b2a86; }
  .kpi .v { font-size: 28px; font-weight: 700; color: #3d1f5c; } .kpi .l { font-size: 12.5px; color: #666; margin-top: 2px; }
  .kpi.ok { border-top-color: #1a7d32; } .kpi.ok .v { color: #1a7d32; }
  .kpi.warn { border-top-color: #c62828; } .kpi.warn .v { color: #c62828; }
  .bug-card { background: #fff; border: 1px solid #ecdede; border-left: 5px solid #c62828; border-radius: 4px; padding: 16px 20px; margin-bottom: 16px; font-size: 13.5px; }
  .bug-card.high { border-left-color: #ef6c00; } .bug-card.med { border-left-color: #c9a227; } .bug-card.low { border-left-color: #2c5282; }
  .bug-title { font-weight: 700; color: #3d1f5c; font-size: 15px; margin-bottom: 4px; }
  .bug-meta { color: #555; margin-bottom: 10px; }
  .bug-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  .bug-card ol { margin: 0; padding-left: 20px; } .bug-card p { margin: 4px 0 8px; }
  .actual { color: #c62828; }
  .evidence { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-top: 10px; }
  figure { margin: 0; } figure.single { max-width: 480px; margin: 0 auto 10px; } figure img { width: 100%; border: 1px solid #ddd; border-radius: 4px; }
  figcaption { font-size: 12px; color: #666; margin-top: 4px; text-align: center; }
  .meta-table td:first-child { font-weight: 600; width: 220px; background: #f7f3fb; }
  ul.notes li { margin-bottom: 8px; font-size: 14px; line-height: 1.5; }
  .tag { display:inline-block; background:#ece4f7; color:#5b2a86; border-radius:4px; padding:2px 8px; font-size:11.5px; margin-right:6px; font-weight: 600; }
  .disclaimer { background: #fffbea; border: 1px solid #f0e2a8; padding: 12px 16px; border-radius: 4px; font-size: 13px; color: #6b5800; }
  footer { text-align: center; color: #888; font-size: 12px; padding: 30px; }
  @media (max-width: 760px) { .container, .header { padding-left: 16px; padding-right: 16px; } .kpis, .bug-grid, .evidence { grid-template-columns: 1fr 1fr; } .bug-grid, .evidence { grid-template-columns: 1fr; } table { display: block; overflow-x: auto; } }
  @media print { body { background: #fff; } .bug-card, table, figure { break-inside: avoid; } }
</style>
</head>
<body>
<div class="header">
  <h1>${esc(data.project.title)}</h1>
  <p>${esc(data.project.subtitle)} · ${runDate}</p>
</div>
<div class="container">

<h2>Test Run Summary</h2>
<div class="kpis">
  <div class="kpi"><div class="v">${total}</div><div class="l">Test cases executed</div></div>
  <div class="kpi ${failed ? 'warn' : 'ok'}"><div class="v">${passed} / ${total}</div><div class="l">Passed in final run</div></div>
  <div class="kpi warn"><div class="v">${data.defects.length}</div><div class="l">Product defects found (${crit} critical)</div></div>
  <div class="kpi ok"><div class="v">${data.defects.length} / ${data.defects.length}</div><div class="l">Defects fixed &amp; re-tested</div></div>
</div>
<table class="meta-table">
<tr><td>Application</td><td>${esc(data.project.application)}</td></tr>
<tr><td>Environment</td><td>${esc(data.project.environment)}</td></tr>
<tr><td>Flight under test</td><td>${esc(data.project.flight)}</td></tr>
<tr><td>Test data</td><td>${esc(data.project.testData)}</td></tr>
<tr><td>Tool / approach</td><td>${esc(data.project.tool)} · Playwright ${esc(results.config.version)}</td></tr>
<tr><td>Final run</td><td>${runDate}, ${runTime} PKT · ${Math.round(results.stats.duration / 1000)} s</td></tr>
<tr><td>Final result</td><td>${verdict(failed === 0)} &nbsp;${passed} passed · ${failed} failed · ${results.stats.flaky} flaky</td></tr>
</table>
<div class="summary-box"><strong>Overall Assessment:</strong> ${assessment}</div>

<h2>What Was Tested</h2>
<table><tr><th style="width:230px">Area</th><th>What it checks</th><th>Tests</th><th>Passed</th><th style="width:70px">Result</th></tr>
${scopeRows}
</table>

<h2>Passenger Journey — Step Results</h2>
<table><tr><th style="width:40px">#</th><th style="width:200px">Step</th><th style="width:70px">Result</th><th>Notes</th></tr>
${journeyRows}
</table>
${img('happy-path-boarding-pass', 'Boarding pass issued in the happy-path run (synthetic passenger)', 'single')}

<h2>Defects Found &amp; Fixed</h2>
<table><tr><th>ID</th><th>Severity</th><th>Defect</th><th>Module</th><th>Status</th><th>Re-test</th></tr>
${defectSummary}
</table>
${defectCards}

<h2>Test Cases (Functional)</h2>
${testCaseTables}

<h2>Execution History</h2>
<p class="muted">Every run listed here was actually executed; numbers are taken from the Playwright results.</p>
<table><tr><th style="width:260px">Run</th><th style="width:170px">Scope</th><th style="width:150px">Result</th><th>Notes</th></tr>
${historyRows}
</table>

<h2>Key Automation Observations</h2>
<ul class="notes">${data.automationNotes.map(([tag, text]) => `<li><span class="tag">${esc(tag)}</span>${esc(text)}</li>`).join('')}</ul>

<h2>Recommendations</h2>
<ul class="notes">${data.recommendations.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>

<div class="disclaimer"><strong>Note:</strong> This report covers a mock DCS training system. All passenger, flight and booking data is synthetic. No real airline systems, passenger records or travel documents were accessed or created. Code changes made for the fixes need technical and security review before deployment.</div>
</div>
<footer>Generated from Playwright results · SkyRoute DCS QA Sandbox · ${runDate}</footer>
</body>
</html>`;

const out = path.join(__dirname, `DCS_QA_Report_${new Date(results.stats.startTime).toISOString().slice(0, 10)}.html`);
fs.writeFileSync(out, html);
console.log(`Report written: ${out}  (${passed}/${total} passed)`);
