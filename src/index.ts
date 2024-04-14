export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	MY_BUCKET: R2Bucket;

	AUTH_KEY_SECRET: any;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
}

// Check requests for a pre-shared secret
const hasValidHeader = (request: Request, env: Env) => {
	return request.headers.get('X-Custom-Auth-Key') === env.AUTH_KEY_SECRET;
};

function authorizeRequest(request: Request, env: Env, key: any) {
	switch (request.method) {
		case 'PUT':
		case 'DELETE':
			return hasValidHeader(request, env);
		case 'GET':
			return key;
		default:
			return false;
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const key = url.pathname.slice(1);
		const slogan = url.searchParams.get('s');
		const headers = new Headers();
		headers.set('Access-Control-Allow-Origin', '*');
		headers.set('Access-Control-Allow-Headers', '*');
		headers.set('Access-Control-Expose-Headers', 'Slogan');
		headers.set('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
		headers.set('Access-Control-Max-Age', '86400');

		env.MY_BUCKET.list().then((resp: any) => {
			console.log(resp);
		});
		console.log(key);

		if (!authorizeRequest(request, env, key)) {
			console.log('failed to authorize');
			console.log(request.headers.get('X-Custom-Auth-Key'));
			const tmpResponse = new Response('Forbidden', { status: 403 });
			return new Response(tmpResponse.body, { headers });
		}

		switch (request.method) {
			case 'PUT':
				// client is responsible for generating filename
				// If we set slogan as metadata, we can just render it in the browser.
				const r2Object = (await env.MY_BUCKET.put(key, request.body, {
					httpMetadata: { contentType: 'image/png' },
					customMetadata: { slogan: slogan as string, timestamp: Math.floor(+new Date() / 1000).toString() as string },
				})) as R2Object;
				return new Response(r2Object.key, { headers });
			case 'GET':
				const object = await env.MY_BUCKET.get(key);

				if (object === null) {
					return new Response('Object Not Found', { status: 404 });
				}

				object.writeHttpMetadata(headers);
				headers.set('etag', object.httpEtag);
				headers.set('slogan', object.customMetadata?.slogan || '');
				return new Response(object.body, {
					headers,
				});
			default:
				return new Response('Method Not Allowed', {
					status: 405,
					headers: {
						Allow: 'PUT, GET, OPTIONS',
					},
				});
		}
	},
};
