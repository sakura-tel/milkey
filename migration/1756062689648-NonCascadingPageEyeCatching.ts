/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */
import {MigrationInterface, QueryRunner} from "typeorm";

export class NonCascadingPageEyeCatching1756062689648 implements MigrationInterface {
    name = 'NonCascadingPageEyeCatching1756062689648'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "page" DROP CONSTRAINT "FK_3126dd7c502c9e4d7597ef7ef10"`);
        await queryRunner.query(`ALTER TABLE "page" ADD CONSTRAINT "FK_a9ca79ad939bf06066b81c9d3aa" FOREIGN KEY ("eyeCatchingImageId") REFERENCES "drive_file"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "page" DROP CONSTRAINT "FK_a9ca79ad939bf06066b81c9d3aa"`);
        await queryRunner.query(`ALTER TABLE "page" ADD CONSTRAINT "FK_3126dd7c502c9e4d7597ef7ef10" FOREIGN KEY ("eyeCatchingImageId") REFERENCES "drive_file"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }
}
