import { publishNoteStream } from '../../stream';
import { renderLike } from '../../../remote/activitypub/renderer/like';
import DeliverManager from '../../../remote/activitypub/deliver-manager';
import { renderActivity } from '../../../remote/activitypub/renderer';
import { toDbReaction, decodeReaction, getFallbackReaction } from '../../../misc/reaction-lib';
import { User, IRemoteUser } from '../../../models/entities/user';
import { Note } from '../../../models/entities/note';
import { NoteReactions, Users, NoteWatchings, Notes, Emojis } from '../../../models';
import { Not } from 'typeorm';
import { perUserReactionsChart } from '../../chart';
import { genId } from '../../../misc/gen-id';
import { createNotification } from '../../create-notification';
import deleteReaction from './delete';
import { IdentifiableError } from '../../../misc/identifiable-error';

export default async (user: User, note: Note, reaction?: string, isDislike = false) => {
	if (note.renoteId && note.text == null && note.poll == null && note.fileIds.length == 0) {
		throw new IdentifiableError('12c35529-3c79-4327-b1cc-e2cf63a71925');
	}
	// check visibility
	if (!await Notes.isVisibleForMe(note, user.id)) {
		throw new IdentifiableError('68e9d2d1-48bf-42c2-b90a-b20e09fd3d48', 'Note not accessible for you.');
	}
	const dbReaction = await toDbReaction(reaction, user.host);
	reaction = dbReaction ? dbReaction : await getFallbackReaction();
	const isFallback = !dbReaction;

	const exist = await NoteReactions.findOne({
		noteId: note.id,
		userId: user.id,
	});

	if (exist) {
		if (exist.reaction !== reaction) {
			// 別のリアクションがすでにされていたら置き換える
			await deleteReaction(user, note);
		} else {
			// 同じリアクションがすでにされていたら何もしない
			return;
		}
	}

	// Create reaction
	const inserted = await NoteReactions.save({
		id: genId(),
		createdAt: new Date(),
		noteId: note.id,
		userId: user.id,
		reaction,
		dislike: isDislike,
	});

	// Increment reactions count
	const sql = `jsonb_set("reactions", '{${reaction}}', (COALESCE("reactions"->>'${reaction}', '0')::int + 1)::text::jsonb)`;
	await Notes.createQueryBuilder().update()
		.set({
			reactions: () => sql,
		})
		.where('id = :id', { id: note.id })
		.execute();

	if (!isDislike) {
		Notes.increment({ id: note.id }, 'score', 1);
	}

	perUserReactionsChart.update(user, note);

	// カスタム絵文字リアクションだったら絵文字情報も送る
	const decodedReaction = decodeReaction(reaction);

	let emoji = await Emojis.findOne({
		where: {
			name: decodedReaction.name,
			host: decodedReaction.host
		},
		select: ['name', 'host', 'url']
	});

	if (emoji) {
		emoji = {
			name: emoji.host ? `${emoji.name}@${emoji.host}` : `${emoji.name}@.`,
			url: emoji.url
		} as any;
	}

	publishNoteStream(note.id, 'reacted', {
		reaction: decodedReaction.reaction,
		emoji: emoji,
		userId: user.id
	});

	// リアクションされたユーザーがローカルユーザーなら通知を作成
	if (note.userHost === null) {
		createNotification(note.userId, 'reaction', {
			notifierId: user.id,
			noteId: note.id,
			reaction: reaction
		});
	}

	// Fetch watchers
	NoteWatchings.find({
		noteId: note.id,
		userId: Not(user.id)
	}).then(watchers => {
		for (const watcher of watchers) {
			createNotification(watcher.userId, 'reaction', {
				notifierId: user.id,
				noteId: note.id,
				reaction: reaction
			});
		}
	});

	//#region 配信
	if (Users.isLocalUser(user) && !note.localOnly) {
		const content = renderActivity(await renderLike(inserted, note, isFallback));
		const dm = new DeliverManager(user, content);
		if (note.userHost !== null) {
			const reactee = await Users.findOne(note.userId);
			dm.addDirectRecipe(reactee as IRemoteUser);
		}
		dm.addFollowersRecipe();
		dm.execute();
	}
	//#endregion
};
