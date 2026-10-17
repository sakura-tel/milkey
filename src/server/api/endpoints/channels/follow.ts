import $ from 'cafy';
import { ID } from '../../../../misc/cafy-id';
import define from '../../define';
import { ApiError } from '../../error';
import { Channels, ChannelFollowings } from '../../../../models';
import { genId } from '../../../../misc/gen-id';

export const meta = {
	tags: ['channels'],

	requireCredential: true as const,

	kind: 'write:channels',

	params: {
		channelId: {
			validator: $.type(ID),
		},
	},

	errors: {
		noSuchChannel: {
			message: 'No such channel.',
			code: 'NO_SUCH_CHANNEL',
			id: 'c0031718-d573-4e85-928e-10039f1fbb68'
		},
		alreadyFollowing: {
			message: 'You are already following that channel.',
			code: 'ALREADY_FOLLOWING',
			id: '7db31665-651e-40c1-8e6e-28e9ad829a2d',
		},
	}
};

export default define(meta, async (ps, user) => {
	const channel = await Channels.findOne({
		id: ps.channelId,
	});

	if (channel == null) {
		throw new ApiError(meta.errors.noSuchChannel);
	}

	// Check if already following
	const exist = await ChannelFollowings.findOne({
		followerId: user.id,
		followeeId: channel.id
	});

	if (exist != null) {
		throw new ApiError(meta.errors.alreadyFollowing);
	}

	await ChannelFollowings.save({
		id: genId(),
		createdAt: new Date(),
		followerId: user.id,
		followeeId: channel.id,
	});
});
