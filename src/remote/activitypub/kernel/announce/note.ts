import Resolver from '../../resolver';
import post from '../../../../services/note/create';
import { IRemoteUser } from '../../../../models/entities/user';
import { IAnnounce, getApId } from '../../type';
import { fetchNote, resolveNote } from '../../models/note';
import { apLogger } from '../../logger';
import { extractDbHost } from '../../../../misc/convert-host';
import { fetchMeta } from '../../../../misc/fetch-meta';
import { getApLock } from '../../../../misc/app-lock';
import { parseAudience } from '../../audience';
import { isRelayActor } from '../../../../services/relay';
import { publishNotesStream } from '../../../../services/stream';
import { StatusError } from '../../../../misc/fetch';
import { Notes } from '../../../../models';

const logger = apLogger;

/**
 * アナウンスアクティビティを捌きます
 */
export default async function(resolver: Resolver, actor: IRemoteUser, activity: IAnnounce, targetUri: string): Promise<void> {
	// アナウンサーが凍結されていたらスキップ
	if (actor.isSuspended) {
		return;
	}

	// リレーからのAnnounceかチェック
	const fromRelay = await isRelayActor(actor);
	const uri = getApId(fromRelay ? target : activity);

	// アナウンス先をブロックしてたら中断
	const meta = await fetchMeta();
	if (meta.blockedHosts.includes(extractDbHost(uri))) return;

	const activityUri = getApId(activity);
	const unlock = await getApLock(activityUri);

	try {
		// 既に同じURIを持つものが登録されていないかチェック
		const exist = await fetchNote(uri);
		if (exist) {
			return;
		}

		// Announce対象をresolve
		let renote;
		try {
			renote = await resolveNote(targetUri);
		} catch (e) {
			// 対象が4xxならスキップ
			if (e instanceof StatusError && e.isClientError) {
				logger.warn(`Ignored announce target ${targetUri} - ${e.statusCode}`);
				return;
			}
			logger.warn(`Error in announce target ${targetUri} - ${e.statusCode || e}`);
			throw e;
		}

		// リレーからのAnnounceはリノートを作成せず、ノートを直接公開する
		if (fromRelay) {
			logger.info(`Publishing relay-delivered note: ${uri}`);
			const noteObj = await Notes.pack(renote, null, { skipHide: true });
			publishNotesStream(noteObj);
			return;
		}

		logger.info(`Creating the (Re)Note: ${uri}`);

		const activityAudience = await parseAudience(actor, activity.to, activity.cc);

		await post(actor, {
			createdAt: activity.published ? new Date(activity.published) : null,
			renote,
			visibility: activityAudience.visibility,
			visibleUsers: activityAudience.visibleUsers,
			uri
		});
	} finally {
		unlock();
	}
}
