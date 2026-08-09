import {
        Entity,
        PrimaryGeneratedColumn,
        Column,
        OneToOne,
        OneToMany,
        JoinColumn,
        CreateDateColumn,
        UpdateDateColumn,
} from 'typeorm';

import { User } from './users.entity';
import { FaceEmbedding } from './face_embedding.entity';

@Entity('face_profiles')
export class FaceProfile {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Column({
                name: 'user_id',
                type: 'char',
                length: 36,
                unique: true,
        })
        user_id: string;

        /**
         * Một user chỉ có một face profile
         */
        @OneToOne(() => User, (user) => user.face_profile, {
                onDelete: 'CASCADE',
        })
        @JoinColumn({
                name: 'user_id',
        })
        user: User;

        @Column({
                type: 'varchar',
                length: 20,
                default: 'pending',
        })
        status: string;

        @Column({
                type: 'datetime',
                nullable: true,
        })
        registered_at: Date | null;

        @OneToMany(() => FaceEmbedding, (embedding) => embedding.faceProfile, {
                cascade: true,
        })
        embeddings: FaceEmbedding[];

        @CreateDateColumn({
                name: 'created_at',
        })
        createdAt: Date;

        @UpdateDateColumn({
                name: 'updated_at',
        })
        updatedAt: Date;
}
