import $ from 'cafy';
import { ID } from '../../../../../misc/cafy-id';
import define from '../../../define';
import watch from '../../../../../services/note/watch';
import { getNote } from '../../../common/getters';
import { ApiError } from '../../../error';

export const meta = {
	desc: {
		'ja-JP': '指定した投稿をウォッチします。',
		'en-US': 'Watch a note.'
	},

	tags: ['notes'],

	requireCredential: true as const,

	kind: 'write:account',

	params: {
		noteId: {
			validator: $.type(ID),
			desc: {
				'ja-JP': '対象の投稿のID',
				'en-US': 'Target note ID.'
			}
		}
	},

	errors: {
		noSuchNote: {
			message: 'No such note.',
			code: 'NO_SUCH_NOTE',
			id: 'ea0e37a6-90a3-4f58-ba6b-c328ca206fc7'
		},
		alreadyWatching: {
			message: 'You are already watching that note.',
			code: 'ALREADY_WATCHING',
			id: 'ca181079-4b1b-aaa3-779b-9d50ae23c8d1',
		},
	}
};

export default define(meta, async (ps, user) => {
	const note = await getNote(ps.noteId).catch(e => {
		if (e.id === '9725d0ce-ba28-4dde-95a7-2cbb2c15de24') throw new ApiError(meta.errors.noSuchNote);
		throw e;
	});

	try {
		await watch(user.id, note);
	} catch (e) {
		if (e.id === 'ca181079-4b1b-aaa3-779b-9d50ae23c8d1') throw new ApiError(meta.errors.alreadyWatching);
		throw e;
	};
});
