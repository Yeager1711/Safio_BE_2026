import {
        Entity,
        PrimaryGeneratedColumn,
        Column,
        ManyToOne,
        JoinColumn,
        CreateDateColumn,
        UpdateDateColumn,
} from 'typeorm';
import { Camera } from './camera.entity';
import { User } from './users.entity';
import { WarningType } from './warning_type.entity';

@Entity('active_logs')
export class ActiveLog {
        @PrimaryGeneratedColumn('uuid')
        id: string;

        @ManyToOne(() => Camera, { nullable: false })
        @JoinColumn({ name: 'cam_id' })
        camera: Camera;

        @ManyToOne(() => User, { nullable: false })
        @JoinColumn({ name: 'user_id' })
        user: User;

        @Column({ type: 'int', nullable: true })
        person_id?: number;

        @Column({ length: 100, nullable: true })
        action?: string;

        @Column({ length: 50, nullable: true })
        fall_type?: string;

        @Column({ length: 100, nullable: true })
        behavior?: string;

        @Column({ nullable: true })
        snapshot_url?: string;

        @Column({ nullable: true })
        content_logs?: string;

        @ManyToOne(() => WarningType, { nullable: true })
        @JoinColumn({ name: 'warning_type_id' })
        warningType?: WarningType;

        @CreateDateColumn({
                name: 'created',
        })
        created: Date;

        @CreateDateColumn({
                name: 'created_at',
        })
        createdAt: Date;

        @UpdateDateColumn({
                name: 'updated_at',
        })
        updatedAt: Date;
}
