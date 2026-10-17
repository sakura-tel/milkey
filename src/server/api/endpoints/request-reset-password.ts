import $ from 'cafy';
import { publishMainStream } from '../../../services/stream';
import define from '../define';
import rndstr from 'rndstr';
import config from '../../../config';
import * as ms from 'ms';
import { Users, UserProfiles, PasswordResetRequests } from '../../../models';
import { sendEmail } from '../../../services/send-email';
import { apiLogger } from '../logger';
import { genId } from '../../../misc/gen-id';
import { IsNull } from 'typeorm';

export const meta = {
	tags: ['reset password'],

	requireCredential: false as const,

	limit: {
		duration: ms('1hour'),
		max: 3
	},

	params: {
		username: {
			validator: $.str
		},

		email: {
			validator: $.str
		},
	},

	errors: {

	}
};

export default define(meta, async (ps) => {
	const user = await Users.findOne({
		usernameLower: ps.username.toLowerCase(),
		host: IsNull()
	});

	// そのユーザーは存在しない
	if (user == null) {
		apiLogger.warn(`Reset password requested for ${ps.username}, but not found.`);
		return;	// エラー内容を返してもいい
	}

	// ローカルユーザーではない
	if (user.host !== null) {
		apiLogger.warn(`Reset password requested for ${ps.username}, but not local user.`);
		return;	// 何も返さない
	}

	// 削除済み
	if (user.isDeleted) {
		apiLogger.warn(`Reset password requested for ${ps.username}, but deleted.`);
		return;	// エラー内容を返してもいい
	}

	// 凍結されている
	if (user.isSuspended) {
		apiLogger.warn(`Reset password requested for ${ps.username}, but suspended.`);
		return;	// エラー内容を返してもいい
	}

	const profile = await UserProfiles.findOneOrFail(user.id);

	// 合致するメアドが登録されていなかったら無視
	if (profile.email !== ps.email) {
		try {
			apiLogger.warn(`Reset password requested for ${ps.username}, but email missmatch.`);
		} catch {}
		return;	// エラー内容はあえて返さない
	}

	// メアドが認証されていなかったら無視
	if (!profile.emailVerified) {
		try {
			apiLogger.warn(`Reset password requested for ${ps.username}, but email not verified.`);
		} catch {}
		return;	// エラー内容はあえて返さない
	}

	const token = rndstr('a-z0-9', 64);

	await PasswordResetRequests.insert({
		id: genId(),
		createdAt: new Date(),
		userId: profile.userId,
		token
	});

	const link = `${config.url}/reset-password/${token}`;

	sendEmail(ps.email, 'Password reset requested', `To reset password, please click this link: ${link}`);
});
