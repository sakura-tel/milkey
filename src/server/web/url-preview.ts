import * as Koa from 'koa';
import { summaly } from '@misskey-dev/summaly';
import { fetchMeta } from '../../misc/fetch-meta';
import Logger from '../../services/logger';
import config from '../../config';
import { query } from '../../prelude/url';
import { getJson } from '../../misc/fetch';
import { URL } from 'url';
import { sanitizeUrl } from '../../misc/sanitize-url';
import { httpAgent, httpsAgent } from '../../misc/fetch';

const logger = new Logger('url-preview');

const blockedHost = [
	'asahi.com',
];

module.exports = async (ctx: Koa.Context) => {
	const url = new URL(ctx.query.url);

	if (blockedHost.some(host => url.hostname.includes(host))) {
		logger.warn(`Failed to get preview of ${ctx.query.url}: This website is blocked`);
		const summary = {
			title: 'Blocked',
			icon: null,
			description: 'This website is blocked',
			thumbnail: null,
			player: {
			url: null,
			width: null,
			height: null
			},
			sitename: url.hostname,
			sensitive: false,
			url: ctx.query.url,
			_isBlocked: true
		};

		// Cache 7days
		ctx.set('Cache-Control', 'max-age=604800, immutable');
		ctx.status = 200;
		ctx.body = summary;
		return;
	}

	const meta = await fetchMeta();

	logger.info(meta.summalyProxy
		? `(Proxy) Getting preview of ${ctx.query.url}@${ctx.query.lang} ...`
		: `Getting preview of ${ctx.query.url}@${ctx.query.lang} ...`);

	try {
		const summary = meta.summalyProxy ? await getJson(`${meta.summalyProxy}?${query({
			url: ctx.query.url,
			lang: ctx.query.lang || 'ja-JP'
		})}`) : await summaly(ctx.query.url, {
			followRedirects: false,
			lang: ctx.query.lang || 'ja-JP',
			agent: {
				http: httpAgent,
				https: httpsAgent,
			},
		});

		logger.succ(`Got preview of ${ctx.query.url}: ${summary.title}`);

		summary.icon = wrap(summary.icon);
		summary.thumbnail = wrap(summary.thumbnail);

		if (summary.player) summary.player.url = sanitizeUrl(summary.player.url);
		summary.url = sanitizeUrl(summary.url);

		// Cache 7days
		ctx.set('Cache-Control', 'max-age=604800, immutable');

		ctx.body = summary;
	} catch (e) {
		logger.warn(`Failed to get preview of ${ctx.query.url}: ${e}`);
		ctx.status = 200;
		ctx.set('Cache-Control', 'max-age=86400, immutable');
		ctx.body = '{}';
	}
};

function wrap(url: string | null) {
	if (url == null) return null;

	return `${config.url}/proxy/preview.jpg?${query({
		url,
		preview: '1'
	})}`
}
