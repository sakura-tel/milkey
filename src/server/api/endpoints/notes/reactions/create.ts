import $ from 'cafy';
import { ID } from '../../../../../misc/cafy-id';
import createReaction from '../../../../../services/note/reaction/create';
import define from '../../../define';
import { getNote } from '../../../common/getters';
import { ApiError } from '../../../error';

export const meta = {
	desc: {
		'ja-JP': '指定した投稿にリアクションします。',
		'en-US': 'React to a note.'
	},

	tags: ['reactions', 'notes'],

	requireCredential: true as const,

	kind: 'write:reactions',

	params: {
		noteId: {
			validator: $.type(ID),
			desc: {
				'ja-JP': '対象の投稿'
			}
		},

		reaction: {
			validator: $.optional.str,
			desc: {
				'ja-JP': 'リアクションの種類'
			}
		},

		dislike: {
			validator: $.optional.bool,
			desc: {
				'ja-JP': 'きらい'
			}
		},
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: '033d0620-5bfe-4027-965d-980b0c85a3ea'
		},

		alreadyReacted: {
			message: 'You are already reacting to that note.',
			code: 'ALREADY_REACTED',
			id: '71efcf98-86d6-4e2b-b2ad-9d032369366b'
		},

		cannotReactToRenote: {
			message: 'You cannot react to Renote.',
			code: 'CANNOT_REACT_TO_RENOTE',
			id: 'eaccdc08-ddef-43fe-908f-d108faad57f5',
		}
	}
};

export default define(meta, async (ps, user) => {
	const note = await getNote(ps.noteId).catch(e => {
		if (e.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
		throw e;
	});
	await createReaction(user, note, ps.reaction, !!ps.dislike).catch(e => {
		if (e.id === '51c42bb4-931a-456b-bff7-e5a8a70dd298') throw new ApiError(meta.errors.alreadyReacted);
		if (e.id === '12c35529-3c79-4327-b1cc-e2cf63a71925') throw new ApiError(meta.errors.cannotReactToRenote);
		if (e.id === '68e9d2d1-48bf-42c2-b90a-b20e09fd3d48') throw new ApiError(meta.errors.noSuchNote);
		throw e;
	});
	return;
});
