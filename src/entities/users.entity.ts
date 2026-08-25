import {
        Entity,
        PrimaryGeneratedColumn,
        Column,
        ManyToOne,
        OneToMany,
        OneToOne,
        JoinColumn,
        CreateDateColumn,
        UpdateDateColumn,
} from 'typeorm';

import { Role } from './roles.entity';
import { Camera } from './camera.entity';
import { FaceProfile } from './face_profile.entity';

@Entity('users')
export class User {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @Column()
        full_name: string;

        @Column({ type: 'date' })
        date_of_birth: Date;

        @Column({ length: 15, nullable: true })
        phone_number?: string;

        @Column({ unique: true })
        email: string;

        @Column()
        password: string;

        @ManyToOne(() => Role, { nullable: false })
        @JoinColumn({ name: 'role_id' })
        role: Role;

        @OneToMany(() => Camera, (camera) => camera.createdBy)
        cameras: Camera[];

        @OneToOne(() => FaceProfile, (faceProfile) => faceProfile.user)
        face_profile: FaceProfile;

        /**
         * Bật/tắt yêu cầu xác thực Face ID cho các hành động nhạy cảm
         * true  = bắt buộc Face ID
         * false = không bắt buộc
         */
        @Column({
                name: 'require_face_id',
                type: 'boolean',
                default: true,
        })
        require_face_id: boolean;

        @CreateDateColumn({
                name: 'created_at',
        })
        createdAt: Date;

        @UpdateDateColumn({
                name: 'updated_at',
        })
        updatedAt: Date;
        family_group_id: any;
}
