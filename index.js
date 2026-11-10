/**
 * dsh-opencode-session — OpenCode Go's required `x-opencode-session` header,
 * stamped through the pi-ai adapter's own `llm-pi-ai/request-headers` seam.
 *
 * Why this exists: OpenCode Go rejects inference requests that lack
 * `x-opencode-session` with `400 MissingSessionID`, and uses the value to
 * route the request and key prompt caching. The shipped pi-ai opencode
 * providers wrap their API implementations with the same header, but the
 * wrapper only fires when the call carries a `sessionId`, and on a
 * `llm-pi-ai` provider profile the header can be missing at the wire.
 *
 * The adapter exposes a synchronous waterfall for model-hidden transport
 * metadata immediately before dispatch. Its context carries the Session's
 * `sessionId`, and each listener receives a fresh, mutable `Headers` copy.
 * This plugin adds the header for opencode.ai hosts only: no global fetch
 * patching, no other provider touched, no dependency.
 *
 * The waterfall contract: listeners run in order, must call `next()` to let
 * the rest of the chain (and finally the built-in behavior) run, and a
 * listener that throws fails the request, so everything here is guarded.
 */

export const name = 'dsh-opencode-session'

/** No service is required; the seam is a plain event on the host context. */
export const inject = []

const HEADER = 'x-opencode-session'
const DEFAULT_HOSTS = ['opencode.ai']
const DEFAULT_FALLBACK = 'dsh-opencode'
const EVENT = 'llm-pi-ai/request-headers'

/** Parse a base URL into a lower-case hostname, or nothing when unparseable. */
export function hostOf(baseURL) {
	try {
		return new URL(String(baseURL)).hostname.toLowerCase()
	} catch {
		return undefined
	}
}

/** Exact host or one of its subdomains. */
export function hostMatches(hostname, hosts) {
	const host = String(hostname ?? '').toLowerCase()
	return hosts.some((entry) => {
		const target = String(entry).toLowerCase().trim()
		if (!target) return false
		return host === target || host.endsWith(`.${target}`)
	})
}

/** The value to send: the Session id when the adapter supplied one, else a constant. */
export function sessionValue(request, fallback) {
	const id = request?.sessionId
	if (typeof id === 'string' && id.length > 0) return id
	if (typeof id === 'number' && Number.isFinite(id)) return String(id)
	return fallback
}

/**
 * Build the waterfall listener. Exported so the behavior can be tested
 * without a running host.
 *
 * @param options.hosts - hostnames whose requests get the header.
 * @param options.fallback - value used when no Session id is in context.
 */
export function createHeaderContributor(options = {}) {
	const hosts = Array.isArray(options.hosts) && options.hosts.length ? options.hosts.map(String) : DEFAULT_HOSTS
	const fallback =
		typeof options.fallback === 'string' && options.fallback.length > 0 ? options.fallback : DEFAULT_FALLBACK
	return function opencodeSessionHeader(request, headers, next) {
		try {
			const host = hostOf(request?.baseURL)
			if (
				host !== undefined &&
				hostMatches(host, hosts) &&
				headers !== undefined &&
				typeof headers.set === 'function' &&
				typeof headers.has === 'function' &&
				!headers.has(HEADER)
			) {
				headers.set(HEADER, sessionValue(request, fallback))
			}
		} catch {
			// A header we cannot represent must not fail the request; the
			// provider's own 400 is a clearer signal than a TypeError here.
		}
		return next()
	}
}

/**
 * Mount the contributor.
 *
 * @param ctx - host cordis context.
 * @param config - optional `{ hosts?: string[], fallback?: string }`.
 */
export function apply(ctx, config) {
	const cfg = config ?? {}
	const contributor = createHeaderContributor({
		hosts: cfg.hosts,
		fallback: cfg.fallback,
	})
	ctx.on(EVENT, contributor)
	const hosts = Array.isArray(cfg.hosts) && cfg.hosts.length ? cfg.hosts.map(String) : DEFAULT_HOSTS
	const fallback =
		typeof cfg.fallback === 'string' && cfg.fallback.length > 0 ? cfg.fallback : DEFAULT_FALLBACK
	ctx.logger?.info?.(
		`[dsh-opencode-session] mounted: header=${HEADER} hosts=${hosts.join(', ')} fallback=${fallback}`,
	)
}

export default apply
