import { Users } from '../../../../models';
import $ from 'cafy';
import define from '../../define';
import { doPostSuspend } from '../../../../services/suspend-user';
import { publishUserEvent } from '../../../../services/stream';
import { createDeleteAccountJob } from '../../../../queue';
import { ID } from '../../../../misc/cafy-id';
import { insertModerationLog } from '../../../../services/insert-moderation-log';

export const meta = {
	desc: {
		'ja-JP': '指定したユーザーを削除します。',
		'en-US': 'Dekete a user.'
	},

	tags: ['admin'],

	requireCredential: true as const,
	requireAdmin: true,

  	params: {
		userId: {
			validator: $.type(ID),
			desc: {
				'ja-JP': '対象のユーザーID',
				'en-US': 'The user ID which you want to delete'
			}
		},
	}
};

export default define(meta, async (ps, me) => {
	const user = await Users.findOne(ps.userId as string);

	if (user == null) {
		throw new Error('user not found');
	}

	if (user.isAdmin) {
		throw new Error('cannot suspend admin');
	}

	if (user.isModerator) {
		throw new Error('cannot suspend moderator');
	}

	if (user.isDeleted) {
		return;
	}

  // 物理削除する前にDelete activityを送信する
  await doPostSuspend(user).catch(e => {});

  createDeleteAccountJob(user);

  await Users.update(user.id, {
    isDeleted: true,
  });

	insertModerationLog(me, 'suspend', {
		targetId: user.id,
	});

  // Terminate streaming
	publishUserEvent(user.id, 'terminate', {});
});
