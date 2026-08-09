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

        @Column({ length: 100 })
        cam_name: string;

        @Column({ length: 100 })
        location: string;

        @Column({ length: 100, nullable: true })
        ip_address?: string;

        @Column({ type: 'enum', enum: ['active', 'inactive'], default: 'inactive' })
        status: string;

        @Column({
                type: 'enum',
                enum: ['IP', 'Ezviz', 'Imou'],
                default: 'IP',
        })
        camera_type: 'IP' | 'Ezviz' | 'Imou';

        // Ezviz
        @Column({ length: 255, nullable: true })
        app_key?: string;

        @Column({ length: 255, nullable: true })
        app_secret?: string;

        @Column({ length: 100, nullable: true })
        ezviz_username?: string;

        @Column({ length: 100, nullable: true })
        ezviz_password?: string;

        @Column({ length: 100, nullable: true })
        device_serial?: string;

        @Column({ length: 100, nullable: true })
        verify_code?: string;

        // Imou
        @Column({ length: 255, nullable: true })
        imou_app_id?: string;

        @Column({ length: 255, nullable: true })
        imou_app_secret?: string;

        @Column({ length: 255, nullable: true })
        imou_token?: string;

        @Column({ length: 255, nullable: true })
        imou_device_id?: string;

        // RTSP
        @Column({ length: 100, nullable: true })
        rtsp_username?: string;

        @Column({ length: 100, nullable: true })
        rtsp_password?: string;

        @Column({ nullable: true })
        rtsp_port?: number;

        @Column({ nullable: true })
        rtsp_channel?: number;

        @ManyToOne(() => FamilyGroup, { nullable: false })
        @JoinColumn({ name: 'family_group_id' })
        familyGroup: FamilyGroup;

        @ManyToOne(() => User, { nullable: false })
        @JoinColumn({ name: 'created_by' })
        createdBy: User;

        @CreateDateColumn({
                name: 'created_at',
        })
        createdAt: Date;

        @UpdateDateColumn({
                name: 'updated_at',
        })
        updatedAt: Date;
}
