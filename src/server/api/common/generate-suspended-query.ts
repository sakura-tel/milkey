import { User } from '../../../models/entities/user';
import { SelectQueryBuilder, Brackets } from 'typeorm';

// Requirements: user replyUser renoteUser must be joined
export function generateSuspendedUserQueryForNote(q: SelectQueryBuilder<any>) {
	const brakets = (user: string) => new Brackets(qb => qb
		.where(`note.${user}Id IS NULL`)
		.orWhere(`${user}.isSuspended = FALSE`));
	q
		.andWhere('user.isSuspended = FALSE')
		.andWhere(brakets('replyUser'))
		.andWhere(brakets('renoteUser'));
}
