import test from 'node:test';
import assert from 'node:assert/strict';
import {clientIp,trustedProxyIps} from '../apps/api/src/client-ip.ts';

test('forwarded IPs are trusted only through explicitly configured proxies',()=>{
  const proxies=trustedProxyIps('127.0.0.1, ::1, 10.0.0.2');
  assert.equal(clientIp('203.0.113.1','1.2.3.4',proxies),'203.0.113.1');
  assert.equal(clientIp('127.0.0.1','1.2.3.4',trustedProxyIps()),'127.0.0.1');
  assert.equal(clientIp('::ffff:127.0.0.1','203.0.113.1',proxies),'203.0.113.1');
  assert.equal(clientIp('127.0.0.1','1.2.3.4, 203.0.113.1, 10.0.0.2',proxies),'203.0.113.1');
  assert.equal(clientIp('127.0.0.1','invalid',proxies),'127.0.0.1');
  assert.equal(clientIp('127.0.0.1',Array(21).fill('10.0.0.2').join(','),proxies),'127.0.0.1');
  assert.throws(()=>trustedProxyIps('*'));
});
