import autobind from 'autobind-decorator';
import Channel from '../channel';
import { Notes, Antennas } from '../../../../models';
import { isMutedUserRelated } from '../../../../misc/is-muted-user-related';

export default class extends Channel {
	public readonly chName = 'antenna';
	public static shouldShare = false;
	public static requireCredential = true;
	private antennaId: string;

	@autobind
	public async init(params: any) {
		if (typeof params.antennaId !== 'string') return false;
		if (!this.user) return false;

		this.antennaId = params.antennaId as string;

		const antennaExists = await Antennas.findOne({
			id: this.antennaId,
			userId: this.user.id,
		});

		if (!antennaExists) return false;

		// Subscribe stream
		this.subscriber.on(`antennaStream:${this.antennaId}`, this.onEvent);
	}

	@autobind
	private async onEvent(data: any) {
		const { type, body } = data;

		if (type === 'note') {
			const note = await Notes.pack(body.id, this.user, { detail: true });

			// 流れてきたNoteがミュートしているユーザーが関わるものだったら無視する
			if (isMutedUserRelated(note, this.muting, false)) return;

			this.send('note', note);
		} else {
			this.send(type, body);
		}
	}

	@autobind
	public dispose() {
		// Unsubscribe events
		this.subscriber.off(`antennaStream:${this.antennaId}`, this.onEvent);
	}
}
