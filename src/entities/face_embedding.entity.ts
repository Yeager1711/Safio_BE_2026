import {
        Entity,
        PrimaryGeneratedColumn,
        Column,
        ManyToOne,
        JoinColumn,
        CreateDateColumn,
        UpdateDateColumn,
} from 'typeorm';

import { FaceProfile } from './face_profile.entity';

@Entity('face_embeddings')
export class FaceEmbedding {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Column({
                name: 'face_profile_id',
                type: 'char',
                length: 36,
        })
        face_profile_id: string;

        /**
         * Relation tới FaceProfile
         */
        @ManyToOne(() => FaceProfile, (faceProfile) => faceProfile.embeddings, {
                onDelete: 'CASCADE',
        })
        @JoinColumn({
                name: 'face_profile_id',
        })
        faceProfile: FaceProfile;

        @Column({
                type: 'varchar',
                length: 20,
        })
        angle: string;

        /**
         * URL ảnh lưu trữ
         *
         * Không nên lưu base64 lâu dài
         */
        @Column({
                name: 'image_url',
                type: 'longtext',
                nullable: true,
        })
        image_url: string | null;

        @Column({
                name: 'embedding',
                type: 'json',
                nullable: true,
        })
        embedding: number[] | null;

        /**
         * Độ tin cậy lúc tạo embedding
         */
        @Column({
                name: 'confidence',
                type: 'decimal',
                precision: 5,
                scale: 4,
                default: 0,
                nullable: true,
        })
        confidence: number;

        @CreateDateColumn({
                name: 'created_at',
        })
        createdAt: Date;

        @UpdateDateColumn({
                name: 'updated_at',
        })
        updatedAt: Date;
}
