import {
        Entity,
        PrimaryGeneratedColumn,
        Column,
        ManyToOne,
        JoinColumn,
        CreateDateColumn,
        UpdateDateColumn,
        Index,
} from 'typeorm';

import { Camera } from './camera.entity';
import { FamilyGroup } from './family-group.entity';
import { User } from './users.entity';

@Entity('face_recognition_logs')
export class FaceRecognitionLog {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Index()
        @Column({
                name: 'camera_id',
                type: 'char',
                length: 36,
        })
        camera_id: string;

        @Index()
        @Column({
                name: 'family_group_id',
                type: 'char',
                length: 36,
        })
        family_group_id: string

        @Index()
        @Column({
                name: 'recognized_user_id',
                type: 'char',
                length: 36,
                nullable: true,
        })
        recognized_user_id: string | null;

        @Column({
                name: 'recognition_type',
                type: 'varchar',
                length: 30,
        })
        recognition_type: string;

        @Column({
                type: 'decimal',
                precision: 5,
                scale: 4,
                default: 0,
        })
        similarity: number;
        @Column({
                name: 'snapshot_url',
                type: 'text',
                nullable: true,
        })
        snapshot_url: string | null;

        @Column({
                name: 'content_logs',
                type: 'text',
                nullable: true,
        })
        content_logs: string | null;

        @CreateDateColumn({
                name: 'created_at',
                type: 'timestamp',
        })
        created_at: Date;

        @UpdateDateColumn({
                name: 'updated_at',
                type: 'timestamp',
        })
        updated_at: Date;

        @ManyToOne(() => Camera, {
                onDelete: 'CASCADE',
        })
        @JoinColumn({
                name: 'camera_id',
                referencedColumnName: 'id',
        })
        camera: Camera;

        @ManyToOne(() => FamilyGroup, {
                onDelete: 'CASCADE',
        })
        @JoinColumn({
                name: 'family_group_id',
                referencedColumnName: 'id',
        })
        family_group: FamilyGroup;

        @ManyToOne(() => User, {
                nullable: true,
                onDelete: 'SET NULL',
        })
        @JoinColumn({
                name: 'recognized_user_id',
                referencedColumnName: 'id',
        })
        recognized_user: User | null;
}
