const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const pkg = require('../package.json');
const file = '../' + pkg.n8n.nodes[0];
const Node = Object.values(require(file))[0],
	node = new Node();
const folder = path.dirname(require.resolve(file));
const operations = require(path.join(folder, 'operations.json')),
	routes = require(path.join(folder, 'routes.json'));
const { parseArgument, requestPages } = require(path.join(folder, 'transport.js'));
function sample(schema) {
	const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
	if (schema.enum) return schema.enum[0];
	if (type === 'integer' || type === 'number') return schema.minimum ?? 1;
	if (type === 'boolean') return true;
	if (type === 'array')
		return Array.from({ length: schema.minItems ?? 1 }, () =>
			sample(schema.items ?? { type: 'string' }),
		);
	if (type === 'object')
		return Object.fromEntries(
			(schema.required ?? []).map((key) => [key, sample(schema.properties[key])]),
		);
	return 'fixture-123';
}
function context(
	op = operations[0],
	{
		items = [{ json: {} }],
		response = { statusCode: 200, body: { ok: true } },
		error,
		params = {},
		continueOnFail = false,
		confirm = true,
	} = {},
) {
	const calls = [];
	const values = { operation: op.name, confirmWrite: confirm };
	for (const key of op.inputSchema.required ?? [])
		values[op.name + '__' + key] = sample(op.inputSchema.properties[key]);
	Object.assign(values, params);
	const ctx = {
		getInputData: () => items,
		getNode: () => ({
			name: 'Test',
			type: 'test',
			typeVersion: 1,
			parameters: {},
			position: [0, 0],
		}),
		getNodeParameter: (name, i, fallback) => values[name] ?? fallback,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (credential, options) => {
				calls.push({ credential, options });
				if (error) throw error;
				return response;
			},
		},
	};
	return { ctx, calls };
}
test('each operation makes one native REST request with no MCP handshake, headers or envelope', async () => {
	for (const op of operations) {
		const paging = routes[op.name].pagination;
		const expected = { ok: true };
		if (paging) expected[paging.items[0]] = [];
		const { ctx, calls } = context(op, { response: { statusCode: 200, body: expected } });
		const result = await node.execute.call(ctx);
		assert.equal(calls.length, 1, op.name);
		const { credential, options } = calls[0];
		assert.equal(credential, node.description.credentials[0].name);
		assert.equal(options.method, routes[op.name].method);
		const url = new URL(options.url);
		assert.equal(url.protocol, 'https:');
		assert.equal(url.origin, 'https://api.liftaven.com');
		assert(url.pathname.startsWith('/v1/'));
		assert(options.disableFollowRedirect);
		assert.equal(options.headers.Accept, 'application/json');
		assert(!JSON.stringify(options).includes('jsonrpc'));
		assert(!JSON.stringify(options.headers).includes('MCP'));
		assert.equal(result[0][0].json.ok, true);
	}
});
test('links outputs to the corresponding input item', async () => {
	const { ctx, calls } = context(operations[0], {
		items: [{ json: { a: 1 } }, { json: { a: 2 } }],
	});
	const result = await node.execute.call(ctx);
	assert.equal(calls.length, 2);
	assert.deepEqual(
		result[0].map((x) => x.pairedItem),
		[{ item: 0 }, { item: 1 }],
	);
});
test('encodes identifiers without exposing them as path or query structure', async () => {
	const op = operations.find((o) => routes[o.name].path.includes(':'));
	if (!op) return;
	const key = routes[op.name].path.match(/:([A-Za-z][A-Za-z0-9]*)/)[1];
	const { ctx, calls } = context(op, { params: { [op.name + '__' + key]: 'owned?item#one' } });
	await node.execute.call(ctx);
	assert(calls[0].options.url.includes('owned%3Fitem%23one'));
	assert.equal(new URL(calls[0].options.url).hash, '');
	assert(!calls[0].options.body?.[key]);
});
test('writes do not require an extra confirmation', async () => {
	const op = operations.find((o) => o.annotations?.readOnlyHint !== true);
	const { ctx, calls } = context(op, { confirm: false });
	await node.execute.call(ctx);
	assert.equal(calls.length, 1);
});
test('invalid required values fail before a network request', async () => {
	const op = operations.find((o) => (o.inputSchema.required ?? []).length);
	if (!op) return;
	const key = op.inputSchema.required[0];
	const { ctx, calls } = context(op, { params: { [op.name + '__' + key]: '' } });
	await assert.rejects(node.execute.call(ctx), /required/);
	assert.equal(calls.length, 0);
});
test('HTTP failures never copy secrets or raw provider errors into workflow data', async () => {
	const error = Object.assign(new Error('Bearer SECRET; private response'), {
		statusCode: 401,
		request: { headers: { Authorization: 'Bearer SECRET' } },
	});
	const { ctx } = context(operations[0], { error, continueOnFail: true });
	const result = await node.execute.call(ctx);
	assert.match(result[0][0].json.error, /401/);
	assert(!JSON.stringify(result).includes('SECRET'));
});
test('204 responses become a successful JSON item', async () => {
	const { ctx } = context(operations[0], { response: { statusCode: 204, body: '' } });
	assert.deepEqual((await node.execute.call(ctx))[0][0].json, { success: true });
});
test('rejects invalid JSON responses', async () => {
	const { ctx } = context(operations[0], {
		response: { statusCode: 200, body: '<html>error</html>' },
	});
	await assert.rejects(node.execute.call(ctx), /invalid JSON/);
});
test('parses valid JSON arrays and rejects wrong types and out-of-range values', () => {
	assert.deepEqual(parseArgument('["a"]', { type: 'array' }, true, 'values'), ['a']);
	assert.throws(() => parseArgument('{}', { type: 'array' }, true, 'values'));
	assert.throws(() => parseArgument(4, { type: 'integer', maximum: 3 }, true, 'count'));
});

test('resource and authentication defaults use the product API origin', () => {
	const Credentials = Object.values(require('../' + pkg.n8n.credentials[0]))[0],
		credential = new Credentials();
	const defaults = Object.fromEntries(credential.properties.map((p) => [p.name, p.default]));
	assert.equal(defaults.serverUrl, 'https://api.liftaven.com/v1');
	assert.equal(defaults.resourceUrl, 'https://api.liftaven.com/v1');
	assert(!defaults.serverUrl.includes('://mcp.'));
});

test('all operations are organised under resource selectors', () => {
	const properties = node.description.properties;
	const resource = properties.find((p) => p.name === 'resource');
	assert(resource);
	const selectors = properties.filter((p) => p.name === 'operation');
	const seen = [];
	for (const selector of selectors) {
		assert.equal(selector.displayOptions.show.resource.length, 1);
		assert(resource.options.some((r) => r.value === selector.displayOptions.show.resource[0]));
		seen.push(...selector.options.map((o) => o.value));
	}
	assert.deepEqual(seen.sort(), operations.map((o) => o.name).sort());
});

test('n8n resolves each resource to its own operation and visible required fields', () => {
	const { NodeHelpers } = require('n8n-workflow');
	const properties = node.description.properties;
	const resource = properties.find((parameter) => parameter.name === 'resource');
	for (const option of resource.options) {
		const selector = properties.find(
			(parameter) =>
				parameter.name === 'operation' &&
				parameter.displayOptions.show.resource.includes(option.value),
		);
		const defaults = NodeHelpers.getNodeParameters(
			properties,
			{ resource: option.value },
			true,
			false,
			{ typeVersion: 1 },
			node.description,
		);
		assert.equal(defaults.operation, selector.default);
		for (const operation of selector.options) {
			const parameters = NodeHelpers.getNodeParameters(
				properties,
				{ resource: option.value, operation: operation.value },
				true,
				false,
				{ typeVersion: 1 },
				node.description,
			);
			assert.equal(parameters.operation, operation.value);
			const schema = operations.find((entry) => entry.name === operation.value).inputSchema;
			for (const field of schema.required ?? []) {
				assert(
					Object.hasOwn(parameters, `${operation.value}__${field}`),
					`${operation.value}: ${field} must be visible`,
				);
			}
			for (const other of operations.filter((entry) => entry.name !== operation.value)) {
				for (const field of other.inputSchema.required ?? []) {
					assert(
						!Object.hasOwn(parameters, `${other.name}__${field}`),
						`${other.name}: ${field} must be hidden`,
					);
				}
			}
		}
	}
});

function pagesContext(pages) {
	const calls = [];
	const ctx = {
		getNode: () => ({
			name: 'Test',
			type: 'test',
			parameters: {},
			typeVersion: 1,
			position: [0, 0],
		}),
		helpers: {
			httpRequestWithAuthentication: async (c, o) => {
				calls.push(structuredClone(o));
				if (calls.length > pages.length) throw new Error('Extra request');
				return { statusCode: 200, body: structuredClone(pages[calls.length - 1]) };
			},
		},
	};
	return { ctx, calls };
}
const opts = { method: 'GET', url: 'https://liftaven.com/v1/test?filter=owned', json: true };
test('Admin lists follow opaque page tokens including omitted empty arrays', async () => {
	const { ctx, calls } = pagesContext([
		{ accounts: [{ name: 'a' }], nextPageToken: 'one' },
		{ nextPageToken: 'two' },
		{ accounts: [{ name: 'b' }] },
	]);
	const result = await requestPages(
		ctx,
		'credential',
		opts,
		{ pagination: { kind: 'token', items: ['accounts'], pageSize: 200 } },
		true,
		50,
	);
	assert.deepEqual(result.accounts, [{ name: 'a' }, { name: 'b' }]);
	assert.deepEqual(
		calls.map((c) => new URL(c.url).searchParams.get('pageToken')),
		[null, 'one', 'two'],
	);
	assert(calls.every((c) => new URL(c.url).searchParams.get('filter') === 'owned'));
});
test('Core/SEO report POST pagination keeps filters and metadata, follows actual offset', async () => {
	const { ctx, calls } = pagesContext([
		{
			rows: [{ v: 1 }, { v: 2 }],
			dimensionHeaders: ['page'],
			metadata: { subjectToThresholding: true },
			pagination: { nextOffset: 2 },
		},
		{ rows: [{ v: 3 }], pagination: { hasMore: false } },
	]);
	const result = await requestPages(
		ctx,
		'credential',
		{
			...opts,
			method: 'POST',
			body: {
				dimensionFilter: { owned: true },
				dateRanges: [{ startDate: '2026-09-01', endDate: '2026-09-30' }],
			},
		},
		{ pagination: { kind: 'report', items: ['rows'], pageSize: 200 } },
		true,
		50,
	);
	assert.equal(result.rows.length, 3);
	assert.deepEqual(result.dimensionHeaders, ['page']);
	assert.equal(result.metadata.subjectToThresholding, true);
	assert.deepEqual(
		calls.map((c) => c.body.offset),
		[0, 2],
	);
	assert(calls.every((c) => c.body.dimensionFilter.owned));
});
test('Search Console respects actual plan-limited page length', async () => {
	const { ctx, calls } = pagesContext([
		{ rows: [1, 2], hasMore: true },
		{ rows: [3, 4], hasMore: false },
	]);
	const result = await requestPages(
		ctx,
		'credential',
		opts,
		{ pagination: { kind: 'gsc', items: ['rows'], pageSize: 200 } },
		false,
		3,
	);
	assert.deepEqual(result.rows, [1, 2, 3]);
	assert.deepEqual(
		calls.map((c) => new URL(c.url).searchParams.get('offset')),
		['0', '2'],
	);
});
test('website content merges both pages and posts using provider offsets', async () => {
	const { ctx, calls } = pagesContext([
		{ pages: Array.from({ length: 25 }, (_, i) => ({ id: i })), posts: [{ id: 100 }] },
		{ pages: [{ id: 25 }], posts: [] },
	]);
	const result = await requestPages(
		ctx,
		'credential',
		opts,
		{ pagination: { kind: 'website', items: ['pages', 'posts', 'tree', 'items'], pageSize: 25 } },
		true,
		50,
	);
	assert.equal(result.pages.length, 26);
	assert.equal(result.posts.length, 1);
	assert.equal(new URL(calls[1].url).searchParams.get('offset'), '25');
});
test('website repeated pages fail instead of claiming all data was fetched', async () => {
	const body = { items: Array.from({ length: 100 }, (_, i) => i) };
	const { ctx } = pagesContext([body, body]);
	await assert.rejects(
		requestPages(
			ctx,
			'credential',
			opts,
			{ pagination: { kind: 'website', items: ['items'], pageSize: 25 } },
			true,
			50,
		),
		/repeated a page/,
	);
});
test('bounded Bing and realtime reads request the selected limit once', async () => {
	const { ctx, calls } = pagesContext([{ rows: [1, 2, 3], warnings: ['provider cap'] }]);
	const result = await requestPages(
		ctx,
		'credential',
		opts,
		{ pagination: { kind: 'bounded', items: ['rows'], pageSize: 200 } },
		false,
		2,
	);
	assert.deepEqual(result.rows, [1, 2]);
	assert.equal(calls.length, 1);
	assert.equal(new URL(calls[0].url).searchParams.get('limit'), '2');
	assert.deepEqual(result.warnings, ['provider cap']);
});
test('pagination tokens and extra write confirmation are not shown to users', () => {
	const props = node.description.properties;
	assert(!props.some((p) => p.name === 'confirmWrite'));
	for (const p of props) {
		if (p.name.startsWith('options_') && routes[p.name.slice(8)]?.pagination)
			assert(!p.options.some((o) => ['limit', 'offset', 'pageToken', 'pageSize'].includes(o.name)));
	}
	const resources = props.find((p) => p.name === 'resource').options.map((o) => o.name);
	assert(resources.includes('Google Analytics'));
	assert(resources.includes('Bing Webmaster Tools'));
});
