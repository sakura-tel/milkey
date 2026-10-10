import { User } from '../../models/entities/user';
import { Note } from '../../models/entities/note';
import { NoteWatchings } from '../../models';
import { genId } from '../../misc/gen-id';
import { NoteWatching } from '../../models/entities/note-watching';
import { isDuplicateKeyValueError } from '../../misc/is-duplicate-key-value-error';
import { IdentifiableError } from '../../misc/identifiable-error';

export default async (me: User['id'], note: Note) => {
	// 自分の投稿はwatchできない
	if (me === note.userId) {
		return;
	}

	await NoteWatchings.save({
		id: genId(),
		createdAt: new Date(),
		noteId: note.id,
		userId: me,
		noteUserId: note.userId
	} as NoteWatching).catch(e => {
		if (isDuplicateKeyValueError(e)) {
			throw new IdentifiableError('ca181079-4b1b-aaa3-779b-9d50ae23c8d1');
		} else {
			throw e;
		}
	});
};
