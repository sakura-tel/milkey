import * as Koa from 'koa';
import * as bcrypt from 'bcryptjs';
import * as speakeasy from 'speakeasy';
import signin from '../common/signin';
import config from '../../../config';
import { Users, Signins, UserProfiles, UserSecurityKeys, AttestationChallenges } from '../../../models';
import { ILocalUser } from '../../../models/entities/user';
import { genId } from '../../../misc/gen-id';
import { ensure } from '../../../prelude/ensure';
import { verifyLogin, hash } from '../2fa';
import { randomBytes } from 'crypto';
import { limiter } from '../limiter';
import { getIpHash } from '../../../misc/get-ip-hash';
import redis from '../../../db/redis';

export default async (ctx: Koa.Context) => {
	ctx.set('Access-Control-Allow-Origin', config.url);
	ctx.set('Access-Control-Allow-Credentials', 'true');

	const body = ctx.request.body as any;
	const username = body['username'];
	const password = body['password'];
	const token = body['token'];

	try {
		// not more than 1 attempt per second and not more than 10 attempts per hour
		await limiter({ key: 'signin', duration: 60 * 60 * 1000, max: 10, minInterval: 1000 }, getIpHash(ctx.ip));
	} catch (err) {
		ctx.status = 429;
		ctx.body = {
			error: {
				message: 'Too many failed attempts to sign in. Try again later.',
				code: 'TOO_MANY_AUTHENTICATION_FAILURES',
				id: '22d05606-fbcf-421a-a2db-b32610dcfd1b',
			},
		};
		return;
	}

	if (typeof username != 'string') {
		ctx.status = 400;
		return;
	}

	if (typeof password != 'string') {
		ctx.status = 400;
		return;
	}

	if (token != null && typeof token != 'string') {
		ctx.status = 400;
		return;
	}

	// Fetch user
	const user = await Users.findOne({
		usernameLower: username.toLowerCase(),
		host: null
	}) as ILocalUser;

	if (user == null) {
		ctx.throw(404, {
			error: 'user not found'
		});
		return;
	}

	const profile = await UserProfiles.findOne(user.id).then(ensure);

	// Compare password
	const same = await bcrypt.compare(password, profile.password!);

	async function fail(status?: number, failure?: { error: string }) {
		// Append signin history
		await Signins.save({
			id: genId(),
			createdAt: new Date(),
			userId: user.id,
			ip: ctx.ip,
			headers: ctx.headers,
			success: false
		});

		ctx.throw(status || 500, failure || { error: 'someting happened' });
	}

	if (!profile.twoFactorEnabled) {
		if (same) {
			signin(ctx, user);
			return;
		} else {
			await fail(403, {
				error: 'incorrect password'
			});
			return;
		}
	}

	if (token) {
		if (!same) {
			await fail(403, {
				error: 'incorrect password'
			});
			return;
		}

		// 判定に用いるタイムスタンプを固定
		const now = Date.now();
		const normalizedToken = token.trim();
		const validationWindow = 1;
		const timeStep = 30;

		// 固定したタイムスタンプで検証
		const delta = (speakeasy as any).totp.verifyDelta({
			secret: profile.twoFactorSecret,
			encoding: 'base32',
			token: normalizedToken,
			step: timeStep,
			window: validationWindow,
			time: Math.floor(now / 1000),
		});

		if (!delta) {
			await fail(403, {
				id: 'cdf1235b-ac71-46d4-a3a6-84ccce48df6f',
			});
			return;
		}

		const currentStep = Math.floor(now / 1000 / timeStep);
		const step = currentStep + delta.delta;

		const usedTokenRedisKey = `2fa:used:${user.id}:${step}`;

		const ttl = timeStep * (validationWindow * 2 + 1);

		await new Promise<void>((resolve, reject) => {
			redis.set(
				usedTokenRedisKey,
				normalizedToken,
				'EX',
				ttl,
				'NX', async (err, reply) => {
						if (err) {
								reject(err);
								return;
						}

						try {
								if (reply !== 'OK') {
										await fail(403, {
												id: 'cdf1235b-ac71-46d4-a3a6-84ccce48df6f',
										});
										resolve();
										return;
								}

								signin(ctx, user);
								resolve();
						} catch (e) {
								reject(e);
						}
			});
		});
		return;
	} else if (body.credentialId) {
		if (!same && !profile.usePasswordLessLogin) {
			await fail(403, {
				error: 'incorrect password'
			});
			return;
		}

		const clientDataJSON = Buffer.from(body.clientDataJSON, 'hex');
		const clientData = JSON.parse(clientDataJSON.toString('utf-8'));
		const challenge = await AttestationChallenges.findOne({
			userId: user.id,
			id: body.challengeId,
			registrationChallenge: false,
			challenge: hash(clientData.challenge).toString('hex')
		});

		if (!challenge) {
			await fail(403, {
				error: 'non-existent challenge'
			});
			return;
		}

		await AttestationChallenges.delete({
			userId: user.id,
			id: body.challengeId
		});

		if (new Date().getTime() - challenge.createdAt.getTime() >= 5 * 60 * 1000) {
			await fail(403, {
				error: 'non-existent challenge'
			});
			return;
		}

		const securityKey = await UserSecurityKeys.findOne({
			id: Buffer.from(
				body.credentialId
					.replace(/-/g, '+')
					.replace(/_/g, '/'),
					'base64'
			).toString('hex')
		});

		if (!securityKey) {
			await fail(403, {
				error: 'invalid credentialId'
			});
			return;
		}

		const isValid = verifyLogin({
			publicKey: Buffer.from(securityKey.publicKey, 'hex'),
			authenticatorData: Buffer.from(body.authenticatorData, 'hex'),
			clientDataJSON,
			clientData,
			signature: Buffer.from(body.signature, 'hex'),
			challenge: challenge.challenge
		});

		if (isValid) {
			signin(ctx, user);
			return;
		} else {
			await fail(403, {
				error: 'invalid challenge data'
			});
			return;
		}
	} else {
		if (!same && !profile.usePasswordLessLogin) {
			await fail(403, {
				error: 'incorrect password'
			});
			return;
		}

		const keys = await UserSecurityKeys.find({
			userId: user.id
		});

		if (keys.length === 0) {
			await fail(403, {
				error: 'no keys found'
			});
			return;
		}

		// 32 byte challenge
		const challenge = randomBytes(32).toString('base64')
			.replace(/=/g, '')
			.replace(/\+/g, '-')
			.replace(/\//g, '_');

		const challengeId = genId();

		await AttestationChallenges.save({
			userId: user.id,
			id: challengeId,
			challenge: hash(Buffer.from(challenge, 'utf-8')).toString('hex'),
			createdAt: new Date(),
			registrationChallenge: false
		});

		ctx.body = {
			challenge,
			challengeId,
			securityKeys: keys.map(key => ({
				id: key.id
			}))
		};
		ctx.status = 200;
		return;
	}
	// never get here
};
