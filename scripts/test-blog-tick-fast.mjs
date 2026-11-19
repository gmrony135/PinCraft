import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isSafeWaitCode,MISSED_SLOT_WINDOW_MS} from '../lib/publishing/automations.mjs';

// Transient AI outages must be retried across ticks, not skipped after one attempt.
assert.equal(isSafeWaitCode('ai_unavailable'), true);
assert.equal(isSafeWaitCode('ai_busy'), true);
// Authorization and configuration blockers still pause and are never retried.
assert.equal(isSafeWaitCode('automation_authorization_changed'), false);
assert.equal(isSafeWaitCode('oauth_reconnect_required'), false);
assert.equal(MISSED_SLOT_WINDOW_MS, 6*60*60000);

// The tick route must hand generation to after() and must not await it before responding.
const route = readFileSync(new URL('../app/api/internal/blog-automation/tick/route.js', import.meta.url), 'utf8');
assert.match(route, /after\(async\(\)=>\{/);
assert.match(route, /after\(async\(\)=>\{\s*try\{await runBlogAutomations\(/);
assert.equal((route.match(/runBlogAutomations\(/g)||[]).length, 1);
assert.match(route, /accepted:true/);
console.log('test-blog-tick-fast: 8 checks passed');
