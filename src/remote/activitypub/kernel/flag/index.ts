import { IRemoteUser } from '../../../../models/entities/user';
import config from '../../../../config';
import { IFlag, getApIds } from '../../type';
import { AbuseUserReports, Users, UserProfiles } from '../../../../models';
import { In } from 'typeorm';
import { genId } from '../../../../misc/gen-id';
import { sendEmail } from '../../../../services/send-email';
import { fetchMeta } from '../../../../misc/fetch-meta';

export default async (actor: IRemoteUser, activity: IFlag): Promise<string> => {
	// objectは `(User|Note) | (User|Note)[]` だけど、全パターンDBスキーマと対応させられないので
	// 対象ユーザーは一番最初のユーザー として あとはコメントとして格納する
	const uris = getApIds(activity.object);

	const userIds = uris.filter(uri => uri.startsWith(config.url + '/users/')).map(uri => uri.split('/').pop());
	const users = await Users.find({
		id: In(userIds)
	});
	if (users.length < 1) return `skip`;

	const report = await AbuseUserReports.insert({
		id: genId(),
		createdAt: new Date(),
		targetUserId: users[0].id,
		targetUserHost: users[0].host,
		reporterId: actor.id,
		reporterHost: actor.host,
		comment: `${activity.content}\n${JSON.stringify(uris, null, 2)}`
	}).then(x => AbuseUserReports.findOneOrFail(x.identifiers[0]));

	// Publish event to moderators
	setTimeout(async () => {
		const moderators = await Users.find({
			where: [{
				isAdmin: true,
			}, {
				isModerator: true,
			}],
			order: {
				lastActiveDate: 'DESC',
			},
		});

		let emailSentCount = 0;

		for (const moderator of moderators) {
			if (emailSentCount >= 3) break;
			const emailRecipientProfile = await UserProfiles.findOne({
				userId: moderator.id,
			});
			if (emailRecipientProfile.email && emailRecipientProfile.emailVerified) {
				sendEmail(emailRecipientProfile.email, 'New abuse report', report.comment);
				emailSentCount++;
			}
		}

		const meta = await fetchMeta();
		if (meta.email && meta.maintainerEmail) {
			sendEmail(meta.maintainerEmail, 'New abuse report', report.comment);
		}
	}, 1);

	return `ok`;
};
