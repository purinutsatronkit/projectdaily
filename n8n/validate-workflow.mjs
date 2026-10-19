import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';

// Static checks only. This does not start n8n, call the API, or send email.
const workflow = JSON.parse(readFileSync(new URL('./taskflow-daily-reminder.json', import.meta.url), 'utf8'));
const get = name => workflow.nodes.find(node => node.name === name);
assert.equal(workflow.active, false);
assert.equal(workflow.settings.timezone, 'Asia/Bangkok');
assert.equal(new Set(workflow.nodes.map(node => node.id)).size, workflow.nodes.length);
assert.equal(new Set(workflow.nodes.map(node => node.name)).size, workflow.nodes.length);
assert.deepEqual(get('Daily 07:30 Bangkok').parameters.rule.interval, [
  { field: 'days', daysInterval: 1, triggerAtHour: 7, triggerAtMinute: 30 },
]);
for (const [name, outputs] of Object.entries(workflow.connections)) {
  assert.ok(get(name), `Unknown source: ${name}`);
  for (const branch of outputs.main) for (const edge of branch) {
    assert.ok(get(edge.node), `Unknown target: ${edge.node}`);
    assert.equal(edge.type, 'main');
  }
}
assert.deepEqual(workflow.connections['Has due tasks?'].main[1], []);
assert.equal(workflow.connections['Send task summary'].main[0][0].node, 'Record sent reminders');
for (const name of ['Get due tasks', 'Record sent reminders']) {
  const node = get(name);
  assert.equal(node.parameters.authentication, 'genericCredentialType');
  assert.equal(node.parameters.genericAuthType, 'httpHeaderAuth');
  assert.ok(node.parameters.url.startsWith('http://localhost:3000/api/integrations/'));
  assert.equal(node.credentials, undefined, 'Credentials must be configured after import');
  assert.equal(node.continueOnFail, undefined, 'Failed API calls must stop the flow');
}
const response = {
  date: '2026-10-13', user: { name: 'ทดสอบ', email: 'test@example.com' },
  tasks: [{ id: 'task-1', title: '<script>งานทดสอบ</script>', due_date: '2026-10-12', priority: 'high', status: 'pending' }],
};
const evaluate = (expression, data = response) => {
  assert.ok(expression.startsWith('={{') && expression.endsWith('}}'));
  return vm.runInNewContext(`(${expression.slice(3, -2)})`, {
    $json: data,
    $: name => {
      assert.equal(name, 'Get due tasks');
      return { first: () => ({ json: response }) };
    },
  }, { timeout: 1000 });
};
const email = get('Send task summary');
assert.equal(email.parameters.emailFormat, 'text');
assert.equal(email.retryOnFail, false);
assert.equal(email.continueOnFail, undefined, 'Failed SMTP must not record a reminder');
assert.equal(evaluate(email.parameters.toEmail), response.user.email);
assert.match(evaluate(email.parameters.subject), /2026-10-13/);
const renderedEmail = evaluate(email.parameters.text);
assert.match(renderedEmail, /<script>งานทดสอบ<\/script>/);
assert.match(renderedEmail, /2026-10-12/);
assert.ok(renderedEmail.includes('\n'), 'Email must render actual newline characters');
assert.ok(!renderedEmail.includes('\\n'), 'Email must not render literal backslash-n separators');
const condition = get('Has due tasks?').parameters.conditions.conditions[0];
assert.equal(condition.operator.type, 'number');
assert.equal(condition.operator.operation, 'gt');
assert.equal(condition.rightValue, 0);
assert.equal(evaluate(condition.leftValue), 1);
assert.equal(evaluate(condition.leftValue, { ...response, tasks: [] }), 0);
const body = JSON.parse(evaluate(get('Record sent reminders').parameters.jsonBody, { messageId: 'smtp-output' }));
assert.deepEqual(body, { task_ids: ['task-1'], date: '2026-10-13', channel: 'email' });
console.log('Passed: workflow JSON, graph, daily Thai schedule, credential placeholders, plaintext and request expressions.');
console.log('Static validation only; no live n8n import/execution or SMTP delivery was tested.');
