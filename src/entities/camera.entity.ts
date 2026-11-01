import {
        Entity,
        PrimaryGeneratedColumn,
        Column,
        ManyToOne,
        JoinColumn,
        CreateDateColumn,
        UpdateDateColumn,
} from 'typeorm';

import { User } from './users.entity';
import { FamilyGroup } from './family-group.entity';

@Entity('cameras')
export class Camera {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Column({
                length: 100,
        })
        cam_name: string;

        @Column({
                length: 100,
        })
        location: string;

        @Column({
                length: 100,
                nullable: true,
        })
        ip_address?: string | null;

        @Column({
                type: 'enum',
                enum: ['active', 'inactive'],
                default: 'active',
        })
        status: string;

        @Column({
                type: 'enum',
                enum: ['IP', 'Ezviz', 'Imou'],
                default: 'IP',
        })
        camera_type: 'IP' | 'Ezviz' | 'Imou';

        /*
         * ==================================================
         * EZVIZ CREDENTIALS
         * ==================================================
         *
         * Các field này lưu AES-256-GCM ciphertext.
         *
         * KHÔNG lưu plaintext.
         */

        @Column({
                type: 'text',
                nullable: true,
        })
        app_key?: string | null;

        @Column({
                type: 'text',
                nullable: true,
        })
        app_secret?: string | null;

        @Column({
                length: 100,
                nullable: true,
        })
        ezviz_username?: string | null;

        @Column({
                type: 'text',
                nullable: true,
        })
        ezviz_password?: string | null;

        @Column({
                type: 'text',
                nullable: true,
        })
        device_serial?: string | null;

        @Column({
                type: 'text',
                nullable: true,
        })
        verify_code?: string | null;

        /*
         * ==================================================
         * IMOU
         * ==================================================
         */

        @Column({
                length: 255,
                nullable: true,
        })
        imou_app_id?: string | null;

        @Column({
                type: 'text',
                nullable: true,
        })
        imou_app_secret?: string | null;

        @Column({
                type: 'text',
                nullable: true,
        })
        imou_token?: string | null;

        @Column({
                length: 255,
                nullable: true,
        })
        imou_device_id?: string | null;

        /*
         * ==================================================
         * RTSP
         * ==================================================
         */

        @Column({
                length: 100,
                nullable: true,
        })
        rtsp_username?: string | null;

        @Column({
                type: 'text',
                nullable: true,
        })
        rtsp_password?: string | null;

        @Column({
                nullable: true,
        })
        rtsp_port?: number | null;

        @Column({
                nullable: true,
        })
        rtsp_channel?: number | null;

        /*
         * ==================================================
         * FAMILY GROUP
         * ==================================================
         */

        @ManyToOne(() => FamilyGroup, {
                nullable: true,
                onDelete: 'SET NULL',
        })
        @JoinColumn({
                name: 'family_group_id',
        })
        familyGroup: FamilyGroup | null;

        /*
         * ==================================================
         * OWNER
         * ==================================================
         */

        @ManyToOne(() => User, {
                nullable: false,
        })
        @JoinColumn({
                name: 'created_by',
        })
        createdBy: User;

        /*
         * ==================================================
         * TIMESTAMPS
         * ==================================================
         */

        @CreateDateColumn({
                name: 'created_at',
        })
        createdAt: Date;

        @UpdateDateColumn({
                name: 'updated_at',
        })
        updatedAt: Date;
}
