import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

interface Schema {
	default?: unknown;
	type?: string | string[];
	enum?: unknown[];
	minimum?: number;
	maximum?: number;
	minLength?: number;
	maxLength?: number;
}
export interface Operation {
	name: string;
	inputSchema: { properties?: Record<string, Schema>; required?: string[] };
	annotations?: { readOnlyHint?: boolean };
}

export function parseArgument(
	value: unknown,
	schema: Schema,
	required: boolean,
	name: string,
): unknown {
	if ((value === undefined || value === null || value === '') && schema.default !== undefined)
		value = schema.default;
	const type = Array.isArray(schema.type) ? schema.type.find((t) => t !== 'null') : schema.type;
	if (value === null && Array.isArray(schema.type) && schema.type.includes('null')) return null;
	if (value === undefined || value === null || value === '') {
		if (required) throw new Error(`${name} is required`);
		return undefined;
	}
	if (type === 'object' || type === 'array') {
		if (typeof value === 'string') {
			let invalid = false;
			try {
				value = JSON.parse(value);
			} catch {
				invalid = true;
			}
			if (invalid) throw new Error(`${name} must be valid JSON`);
		}
		if (
			type === 'array'
				? !Array.isArray(value)
				: typeof value !== 'object' || Array.isArray(value) || value === null
		)
			throw new Error(`${name} has the wrong JSON type`);
	}
	if (type === 'integer' || type === 'number') {
		if (
			typeof value !== 'number' ||
			!Number.isFinite(value) ||
			(type === 'integer' && !Number.isInteger(value))
		)
			throw new Error(`${name} must be a valid ${type}`);
		if (schema.minimum !== undefined && value < schema.minimum)
			throw new Error(`${name} is below the minimum`);
		if (schema.maximum !== undefined && value > schema.maximum)
			throw new Error(`${name} is above the maximum`);
	}
	if (type === 'boolean' && typeof value !== 'boolean')
		throw new Error(`${name} must be a boolean`);
	if (type === 'string') {
		if (typeof value !== 'string') throw new Error(`${name} must be a string`);
		if (schema.minLength !== undefined && value.length < schema.minLength)
			throw new Error(`${name} is too short`);
		if (schema.maxLength !== undefined && value.length > schema.maxLength)
			throw new Error(`${name} is too long`);
	}
	if (schema.enum && !schema.enum.includes(value))
		throw new Error(`${name} must be one of the listed options`);
	return value;
}

export interface ResourceRoute {
	method: IHttpRequestOptions['method'];
	path: string;
	pagination?: {
		kind: 'token' | 'report' | 'gsc' | 'website' | 'bounded';
		pageSize: number;
		items: string[];
	};
}
async function requestJson(
	ctx: IExecuteFunctions,
	credential: string,
	options: IHttpRequestOptions,
): Promise<unknown> {
	let response;
	try {
		response = await ctx.helpers.httpRequestWithAuthentication.call(ctx, credential, options);
	} catch (error) {
		const status = (error as { statusCode?: number }).statusCode;
		throw new NodeOperationError(
			ctx.getNode(),
			typeof status === 'number'
				? `API request failed (HTTP ${status}). Reconnect for 401/403; check plan limits for 429.`
				: 'The API request failed. Check the connection and permissions.',
		);
	}
	const status = Number(response.statusCode ?? 200);
	if (status < 200 || status >= 300)
		throw new NodeOperationError(
			ctx.getNode(),
			`API request failed (HTTP ${status}). Check permissions and inputs.`,
		);
	let body: unknown = response.body;
	if (status === 204 || body === undefined || body === '') body = { success: true };
	if (typeof body === 'string') {
		try {
			body = JSON.parse(body);
		} catch {
			throw new NodeOperationError(ctx.getNode(), 'The API returned an invalid JSON response');
		}
	}

	return body;
}

function atPath(value: unknown, path: string): unknown {
	return path
		.split('.')
		.reduce<unknown>(
			(current, key) =>
				current && typeof current === 'object'
					? (current as Record<string, unknown>)[key]
					: undefined,
			value,
		);
}
function setPath(value: Record<string, unknown>, path: string, items: unknown[]): void {
	const parts = path.split('.');
	let target = value;
	for (const key of parts.slice(0, -1)) target = target[key] as Record<string, unknown>;
	target[parts[parts.length - 1]] = items;
}
/** Follows only API tokens on the fixed resource URL; never follows a server-supplied URL. */
export async function requestPages(
	ctx: IExecuteFunctions,
	credential: string,
	options: IHttpRequestOptions,
	route: ResourceRoute,
	returnAll: boolean,
	limit: number,
): Promise<unknown> {
	const paging = route.pagination;
	if (!paging) return requestJson(ctx, credential, options);
	if (!returnAll && (!Number.isSafeInteger(limit) || limit < 1))
		throw new NodeOperationError(ctx.getNode(), 'Limit must be a positive integer');
	const url = new URL(options.url),
		bodyArgs = { ...((options.body as Record<string, unknown>) ?? {}) };
	const set = (key: string, value: unknown) => {
		if (options.method === 'GET') url.searchParams.set(key, String(value));
		else bodyArgs[key] = value;
	};
	const kind = paging.kind;
	if (kind === 'token') set('pageSize', paging.pageSize);
	else if (kind !== 'website')
		set('limit', kind === 'bounded' ? Math.min(limit, paging.pageSize) : paging.pageSize);
	if (['report', 'gsc', 'website'].includes(kind)) set('offset', 0);
	let result: Record<string, unknown> | undefined,
		count = 0,
		offset = 0;
	const arrays: Record<string, unknown[]> = {},
		seen = new Set<string>();
	let more = false;
	for (;;) {
		const body = await requestJson(ctx, credential, {
			...options,
			url: url.href,
			...(options.method === 'GET' ? {} : { body: bodyArgs }),
		});
		if (!body || typeof body !== 'object' || Array.isArray(body))
			throw new NodeOperationError(ctx.getNode(), 'The API returned an invalid list response');
		const record = body as Record<string, unknown>;
		let keys = paging.items.filter((key) => Array.isArray(atPath(body, key)));
		// Google Admin omits empty repeated fields instead of returning [].
		if (!keys.length && kind === 'token') {
			keys = [paging.items[0]];
			record[keys[0]] = [];
		}
		if (!keys.length)
			throw new NodeOperationError(ctx.getNode(), 'The API returned an unsupported list response');
		if (kind !== 'website') keys = keys.slice(0, 1);
		const pageArrays = keys.map((key) => atPath(body, key) as unknown[]);
		const fingerprint = JSON.stringify(pageArrays);
		if (kind !== 'token' && pageArrays.some((a) => a.length) && seen.has(fingerprint))
			throw new NodeOperationError(
				ctx.getNode(),
				'The API repeated a page instead of advancing. Narrow the request or check the connected provider.',
			);
		if (kind !== 'token') seen.add(fingerprint);
		if (!result) result = record;
		const previousCount = count;
		for (let i = 0; i < keys.length; i++) {
			const key = keys[i],
				values = pageArrays[i];
			arrays[key] ??= [];
			const selected = returnAll ? values : values.slice(0, Math.max(0, limit - count));
			arrays[key].push(...selected);
			count += selected.length;
		}
		const rows = pageArrays[0].length;
		let next: unknown;
		if (kind === 'token') next = record.nextPageToken;
		if (kind === 'report') next = atPath(body, 'pagination.nextOffset');
		if (kind === 'gsc' && record.hasMore === true) {
			if (!rows)
				throw new NodeOperationError(
					ctx.getNode(),
					'The API returned an empty page while more results remain',
				);
			next = offset + rows;
		}
		if (kind === 'website') {
			const total =
				atPath(body, 'pagination.total') ?? atPath(body, 'result.total') ?? record.total;
			const size = keys.includes('tree') || keys.includes('items') ? 100 : 25;
			const returned = Math.max(...pageArrays.map((a) => a.length));
			if (typeof total === 'number' ? offset + returned < total : returned >= size)
				next = offset + (keys.includes('posts') ? 25 : returned);
		}
		more =
			(next !== undefined && next !== null && next !== '') ||
			(!returnAll &&
				pageArrays.reduce((sum, values) => sum + values.length, 0) > count - previousCount);
		if (kind === 'bounded' && atPath(body, 'pagination.hasMore') === true) more = true;
		if (!returnAll && count >= limit) break;
		if (kind === 'bounded' || !more) break;
		if (kind === 'token') {
			if (typeof next !== 'string' || next.length > 4096 || seen.has(next))
				throw new NodeOperationError(
					ctx.getNode(),
					'The API repeated or returned an invalid pagination token',
				);
			seen.add(next);
			set('pageToken', next);
		} else {
			if (!Number.isSafeInteger(next) || Number(next) <= offset)
				throw new NodeOperationError(ctx.getNode(), 'The API returned invalid pagination');
			offset = Number(next);
			set('offset', offset);
		}
	}
	for (const [key, values] of Object.entries(arrays)) setPath(result!, key, values);
	delete result!.nextPageToken;
	if (kind === 'report') {
		const metadata = result!.pagination as Record<string, unknown>;
		result!.pagination = { ...metadata, offset: 0, returned: count, hasMore: more };
		delete (result!.pagination as Record<string, unknown>).nextOffset;
	}
	if (kind === 'gsc') {
		result!.offset = 0;
		result!.hasMore = more;
	}
	// Preserve provider totals, warnings, sampling and truncation metadata.
	result!.n8nPagination = {
		returned: count,
		hasMore: more,
		returnAll: kind === 'bounded' ? false : returnAll,
	};
	return result;
}

export async function executeOperations(
	ctx: IExecuteFunctions,
	origin: string,
	credential: string,
	operations: Operation[],
	routes: Record<string, ResourceRoute>,
): Promise<INodeExecutionData[][]> {
	const output: INodeExecutionData[] = [];
	const items = ctx.getInputData();
	for (let i = 0; i < items.length; i++) {
		try {
			const name = ctx.getNodeParameter('operation', i) as string;
			const operation = operations.find((op) => op.name === name),
				route = routes[name];
			if (!operation || !route)
				throw new NodeOperationError(ctx.getNode(), 'Choose a supported operation');
			const args: Record<string, unknown> = {};
			const required = operation.inputSchema.required ?? [];
			const extra = ctx.getNodeParameter(`options_${name}`, i, {}) as Record<string, unknown>;
			for (const [key, schema] of Object.entries(operation.inputSchema.properties ?? {})) {
				if (
					route.pagination &&
					['offset', 'cursor', 'page', 'limit', 'pageSize', 'pageToken'].includes(key)
				)
					continue;
				const isRequired = required.includes(key);
				const value = parseArgument(
					isRequired ? ctx.getNodeParameter(`${name}__${key}`, i) : extra[key],
					schema,
					isRequired,
					key,
				);
				if (value !== undefined) args[key] = value;
			}
			const path = route.path.replace(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, key: string) => {
				const value = args[key];
				if (
					typeof value !== 'string' ||
					!value ||
					value === '.' ||
					value === '..' ||
					/[\\/]/.test(value)
				)
					throw new NodeOperationError(ctx.getNode(), `${key} is required`);
				delete args[key];
				return encodeURIComponent(value);
			});
			const url = new URL(path, origin);
			if (url.origin !== origin || !url.pathname.startsWith('/v1/'))
				throw new NodeOperationError(ctx.getNode(), 'Invalid API resource');
			const options: IHttpRequestOptions = {
				method: route.method,
				url: url.href,
				json: true,
				returnFullResponse: true,
				disableFollowRedirect: true,
				timeout: 120000,
				headers: { Accept: 'application/json' },
			};
			if (route.method === 'GET') {
				for (const [key, value] of Object.entries(args))
					url.searchParams.set(
						key,
						typeof value === 'object' ? JSON.stringify(value) : String(value),
					);
				options.url = url.href;
			} else if (Object.keys(args).length || route.method !== 'DELETE') {
				options.body = args;
				options.headers = { ...options.headers, 'Content-Type': 'application/json' };
			}
			const body = await requestPages(
				ctx,
				credential,
				options,
				route,
				route.pagination ? ctx.getNodeParameter('returnAll', i, false) === true : false,
				route.pagination ? Number(ctx.getNodeParameter('limit', i, 50)) : 50,
			);
			const json =
				body && typeof body === 'object' && !Array.isArray(body)
					? (body as IDataObject)
					: ({ data: body } as IDataObject);
			output.push({ json, pairedItem: { item: i } });
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Operation failed';
			if (ctx.continueOnFail()) {
				output.push({ json: { error: message }, pairedItem: { item: i } });
				continue;
			}
			throw new NodeOperationError(ctx.getNode(), message, { itemIndex: i });
		}
	}
	return [output];
}
