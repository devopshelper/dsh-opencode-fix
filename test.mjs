import assert from 'node:assert/strict'
import test from 'node:test'

import { apply, createHeaderContributor, hostMatches, sessionValue } from './index.js'

/** Run one contributor call and capture what reached the wire. */
function run(contributor, request, initial = {}) {
	const headers = new Headers(initial)
	let calls = 0
	const result = contributor(request, headers, () => {
		calls++
		return 'continued'
	})
	return { headers, calls, result }
}

test('stamps the Session id on opencode.ai', () => {
	const { headers, calls, result } = run(createHeaderContributor(), {
		provider: 'opencode-go',
		model: 'deepseek-v4.1-flash',
		baseURL: 'https://opencode.ai/inference/go/openai/v1/chat/completions',
		sessionId: 'sess-42',
	})
	assert.equal(headers.get('x-opencode-session'), 'sess-42')
	assert.equal(calls, 1)
	assert.equal(result, 'continued')
})

test('accepts subdomains of an allowed host', () => {
	const { headers } = run(createHeaderContributor(), {
		baseURL: 'https://api.opencode.ai/v1/chat/completions',
		sessionId: 'sess-sub',
	})
	assert.equal(headers.get('x-opencode-session'), 'sess-sub')
})

test('never touches another provider', () => {
	const { headers } = run(createHeaderContributor(), {
		baseURL: 'https://api.deepseek.com/chat/completions',
		sessionId: 'sess-42',
	})
	assert.equal(headers.has('x-opencode-session'), false)
})

test('lookalike hosts do not match', () => {
	assert.equal(hostMatches('opencode.ai.evil.example', ['opencode.ai']), false)
	assert.equal(hostMatches('notopencode.ai', ['opencode.ai']), false)
})

test('preserves a header the provider already set', () => {
	const { headers } = run(
		createHeaderContributor(),
		{ baseURL: 'https://opencode.ai/inference/go/v1', sessionId: 'sess-new' },
		{ 'x-opencode-session': 'sess-native' },
	)
	assert.equal(headers.get('x-opencode-session'), 'sess-native')
})

test('falls back when the adapter supplied no Session id', () => {
	const { headers } = run(createHeaderContributor(), { baseURL: 'https://opencode.ai/inference/go/v1' })
	assert.equal(headers.get('x-opencode-session'), 'dsh-opencode')
})

test('honors a configured fallback', () => {
	const { headers } = run(createHeaderContributor({ fallback: 'fixed-id' }), {
		baseURL: 'https://opencode.ai/inference/go/v1',
	})
	assert.equal(headers.get('x-opencode-session'), 'fixed-id')
})

test('a malformed base URL or header host still continues the chain', () => {
	const contributor = createHeaderContributor()
	const first = run(contributor, { baseURL: 'not a url', sessionId: 'sess-1' })
	assert.equal(first.calls, 1)
	assert.equal(first.headers.has('x-opencode-session'), false)
	const second = run(contributor, undefined)
	assert.equal(second.calls, 1)
})

test('numeric Session ids are stringified', () => {
	assert.equal(sessionValue({ sessionId: 7 }, 'fallback'), '7')
})

test('apply registers the contributor on the host event', () => {
	const registered = []
	const infos = []
	const ctx = {
		on: (event, handler) => registered.push({ event, handler }),
		logger: { info: (line) => infos.push(line) },
	}
	apply(ctx, {})
	assert.equal(registered.length, 1)
	assert.equal(registered[0].event, 'llm-pi-ai/request-headers')
	const { headers } = run(registered[0].handler, {
		baseURL: 'https://opencode.ai/inference/go/v1',
		sessionId: 'sess-apply',
	})
	assert.equal(headers.get('x-opencode-session'), 'sess-apply')
	assert.match(infos[0], /mounted: header=x-opencode-session/)
})
